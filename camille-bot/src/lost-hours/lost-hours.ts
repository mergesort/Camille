/**
 * Lost Hours Tracking
 *
 * Handles detection and tracking of lost hours reported by the community
 */

import { Logger } from '../shared/logging/logger';
import { Config } from '../shared/config/config';
import { createLostHoursIncrementRegex, createLostHoursMalformedNegativeRegex } from '../shared/regex/patterns';
import {
  getSlackChannelInfo,
  updateSlackChannelTopic,
  updateSlackChannelDescription,
  sendSlackMessage,
  MissingScopeError
} from '../shared/slack/messaging';

/**
 * Processing status enum (following user preference for enums over booleans)
 */
enum ProcessingStatus {
  SUCCESS = 'success',
  NO_MATCH = 'no_match',
  ERROR = 'error'
}

/**
 * Result from processing a lost-hours message
 */
export interface LostHoursResult {
  // Status of processing
  status: ProcessingStatus;

  // The response message to send back (if any)
  response: string | null;

  // The old hours value (if processed)
  oldHours?: number;

  // The new hours value (if processed)
  newHours?: number;

  // The increment amount (if processed)
  increment?: number;
}

/**
 * Process a message for lost-hours increment commands
 * @param sourceChannel - The channel where the message was posted (used to cross-post context to #lost-hours)
 */
export async function processLostHoursMessage(
  messageText: string,
  userId: string,
  sourceChannel: string,
  logger: Logger,
  config: Config
): Promise<LostHoursResult> {
  try {
    logger.debug('Processing message for lost-hours', {
      textPreview: messageText.substring(0, 50),
      userId
    });

    // Ensure we have an API token
    if (!config.slackApiToken) {
      logger.error('Cannot process lost-hours: API token is missing');
      return {
        status: ProcessingStatus.ERROR,
        response: 'Sorry, I cannot update lost hours right now (missing API token).'
      };
    }

    // Ensure we have the lost-hours channel ID configured
    const lostHoursChannelId = config.lostHoursChannelId;
    if (!lostHoursChannelId) {
      logger.debug('Lost hours feature not configured: LOST_HOURS_CHANNEL_ID not set');
      return {
        status: ProcessingStatus.NO_MATCH,
        response: null
      };
    }

    // First check for malformed syntax like += -5 or -= -5
    // This is a common user error that we want to give helpful feedback on
    const malformedRegex = createLostHoursMalformedNegativeRegex(lostHoursChannelId);
    malformedRegex.lastIndex = 0;

    if (malformedRegex.test(messageText)) {
      logger.warn('Detected malformed negative syntax in lost-hours command', {
        messageText: messageText.substring(0, 100),
        userId
      });
      return {
        status: ProcessingStatus.ERROR,
        response: 'Invalid syntax. Use `#lost-hours -= 5` to subtract hours, not `+= -5`. The operator (+/-) determines the direction.'
      };
    }

    // Now create the regex pattern with the channel ID
    // This will match Slack channel mentions like <#C12345678|lost-hours> or <#C12345678>
    const lostHoursIncrementRegex = createLostHoursIncrementRegex(lostHoursChannelId);

    // Check if message contains lost-hours increment pattern
    // Reset regex state before testing
    lostHoursIncrementRegex.lastIndex = 0;

    logger.debug('Testing lost-hours regex', {
      pattern: lostHoursIncrementRegex.toString(),
      messageText: messageText,
      expectedChannelId: lostHoursChannelId
    });

    const match = lostHoursIncrementRegex.exec(messageText);

    if (!match) {
      logger.debug('Message did not match lost-hours pattern');
      return {
        status: ProcessingStatus.NO_MATCH,
        response: null
      };
    }

    // Extract the operator and value
    const operator = match[1]; // + or -
    const rawValue = parseFloat(match[2]);

    // Validate the value (must be positive and reasonable)
    if (rawValue <= 0 || rawValue > 1000) {
      logger.warn('Invalid lost-hours value', {
        value: rawValue,
        operator,
        userId
      });
      return {
        status: ProcessingStatus.ERROR,
        response: 'Invalid value. Please use a positive number less than 1000.'
      };
    }

    // Apply the operator to get the actual change
    const changeValue = operator === '+' ? rawValue : -rawValue;

    logger.info('Detected lost-hours modification', {
      operator,
      rawValue,
      changeValue,
      userId
    });

    // Get current channel topic
    const channelInfo = await getSlackChannelInfo({
      channel: lostHoursChannelId,
      token: config.slackApiToken
    });

    const currentTopic = channelInfo.topic;
    logger.debug('Retrieved current topic', {
      topic: currentTopic
    });

    // Parse current hours from topic
    const currentHours = parseTopicForHours(currentTopic, logger);

    if (currentHours === null) {
      logger.error('Failed to parse current hours from topic', undefined, {
        topic: currentTopic
      });
      return {
        status: ProcessingStatus.ERROR,
        response: 'Sorry, I could not parse the current lost hours from the channel topic. The topic format may have changed.'
      };
    }

    // Calculate new total
    const newHours = currentHours + changeValue;

    // Prevent negative totals
    if (newHours < 0) {
      logger.warn('Lost hours cannot go negative', {
        currentHours,
        changeValue,
        userId
      });
      return {
        status: ProcessingStatus.ERROR,
        response: `Cannot subtract ${rawValue} hours. Current total is only ${formatNumberWithCommas(currentHours)} hours.`
      };
    }

    // Generate updated topic
    const newTopic = generateUpdatedTopic(currentTopic, newHours, logger);

    // Update both the channel topic and description (they should stay in sync)
    await updateSlackChannelTopic({
      channel: lostHoursChannelId,
      topic: newTopic,
      token: config.slackApiToken
    });

    await updateSlackChannelDescription({
      channel: lostHoursChannelId,
      purpose: newTopic,
      token: config.slackApiToken
    });

    logger.info('Successfully updated lost hours', {
      oldHours: currentHours,
      change: changeValue,
      newHours,
      userId
    });

    // If the message came from a different channel, cross-post context to #lost-hours
    if (sourceChannel !== lostHoursChannelId) {
      const context = extractContextFromMessage(messageText, match);
      const crossPostMessage = formatCrossPostMessage(userId, rawValue, changeValue, context);

      await sendSlackMessage({
        channel: lostHoursChannelId,
        text: crossPostMessage,
        token: config.slackApiToken
      });

      logger.info('Cross-posted lost hours context to #lost-hours', {
        sourceChannel,
        userId,
        context: context.substring(0, 100)
      });
    }

    // Format success response
    const response = formatSuccessResponse(currentHours, newHours, changeValue);

    return {
      status: ProcessingStatus.SUCCESS,
      response,
      oldHours: currentHours,
      newHours,
      increment: changeValue
    };

  } catch (error) {
    // Check for missing OAuth scope error
    if (error instanceof MissingScopeError) {
      logger.error('Missing OAuth scope for lost-hours feature', error);
      return {
        status: ProcessingStatus.ERROR,
        response: `The lost-hours feature requires additional permissions. Please add the "${error.neededScope}" OAuth scope to the Slack app and reinstall it.`
      };
    }

    logger.error(
      'Error processing lost-hours message',
      error instanceof Error ? error : new Error(String(error))
    );

    // Return error result
    return {
      status: ProcessingStatus.ERROR,
      response: 'Sorry, there was an error updating the lost hours. Please try again later.'
    };
  }
}

/**
 * Parse the current hours value from the topic string
 * Expected format: "Bugs you lost hours on, and how you solved them. Cumulatively, 1286 hours lost since June 29, 2017"
 */
function parseTopicForHours(topic: string, logger: Logger): number | null {
  try {
    // Regex to extract the hours number from the topic
    // Matches patterns like "1286 hours" or "1,286 hours" or "1286.5 hours"
    const hoursRegex = /Cumulatively,\s*([\d,]+(?:\.\d+)?)\s*hours?\s*lost/i;

    const match = hoursRegex.exec(topic);

    if (!match) {
      logger.warn('Could not match hours pattern in topic', { topic });
      return null;
    }

    // Remove commas from the number string and parse
    const hoursString = match[1].replace(/,/g, '');
    const hours = parseFloat(hoursString);

    if (isNaN(hours)) {
      logger.warn('Parsed hours value is NaN', { hoursString });
      return null;
    }

    return hours;
  } catch (error) {
    logger.error(
      'Error parsing topic for hours',
      error instanceof Error ? error : new Error(String(error))
    );
    return null;
  }
}

/**
 * Generate an updated topic with the new hours value
 */
function generateUpdatedTopic(currentTopic: string, newHours: number, logger: Logger): string {
  try {
    // Format the number with commas for readability (e.g., 1,286)
    const formattedHours = formatNumberWithCommas(newHours);

    // Replace the hours value in the topic while keeping the rest of the text
    const hoursRegex = /Cumulatively,\s*[\d,]+(?:\.\d+)?\s*hours?\s*lost/i;

    // Handle both singular and plural
    const hoursWord = newHours === 1 ? 'hour' : 'hours';
    const replacement = `Cumulatively, ${formattedHours} ${hoursWord} lost`;

    const newTopic = currentTopic.replace(hoursRegex, replacement);

    logger.debug('Generated new topic', {
      oldTopic: currentTopic,
      newTopic
    });

    return newTopic;
  } catch (error) {
    logger.error(
      'Error generating updated topic',
      error instanceof Error ? error : new Error(String(error))
    );
    // Fallback: return a basic updated topic
    return `Bugs you lost hours on, and how you solved them. Cumulatively, ${newHours} hours lost since June 29, 2017`;
  }
}

/**
 * Format a number with commas for thousands separator
 */
function formatNumberWithCommas(num: number): string {
  // Handle decimals by splitting on the decimal point
  const parts = num.toString().split('.');
  const integerPart = parts[0];
  const decimalPart = parts.length > 1 ? `.${parts[1]}` : '';

  // Add commas to integer part
  const withCommas = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');

  return withCommas + decimalPart;
}

/**
 * Format a success response message
 */
function formatSuccessResponse(oldHours: number, newHours: number, change: number): string {
  const formattedOld = formatNumberWithCommas(oldHours);
  const formattedNew = formatNumberWithCommas(newHours);
  const absChange = Math.abs(change);
  const sign = change >= 0 ? '+' : '-';

  return `Lost hours updated: ${formattedOld} → ${formattedNew} (${sign}${absChange} hours)`;
}

/**
 * Extract context from the message (text after the lost-hours pattern)
 */
function extractContextFromMessage(messageText: string, match: RegExpExecArray): string {
  // Get text after the match (e.g., "#lost-hours += 5 debugging auth" -> "debugging auth")
  const afterMatch = messageText.substring(match.index + match[0].length).trim();

  // If there's text after the pattern, return it
  if (afterMatch) {
    return afterMatch;
  }

  // Check for text before the pattern as well
  const beforeMatch = messageText.substring(0, match.index).trim();

  return beforeMatch;
}

/**
 * Format the cross-post message for #lost-hours
 */
function formatCrossPostMessage(
  userId: string,
  rawValue: number,
  changeValue: number,
  context: string
): string {
  const absValue = Math.abs(rawValue);
  const hoursWord = absValue === 1 ? 'hour' : 'hours';

  // Different wording based on whether hours were added or recovered
  const action = changeValue >= 0 ? 'lost' : 'recovered';

  if (context) {
    return `<@${userId}> ${action} ${absValue} ${hoursWord}: ${context}`;
  }

  return `<@${userId}> ${action} ${absValue} ${hoursWord}`;
}
