/**
 * Slack Events Handler
 *
 * Handles incoming Slack events and routes them to the appropriate feature modules
 */

import { Logger } from '../logging/logger';
import { Config } from '../config/config';
import { KVStore } from '../storage/kv-store';
import { verifySlackSignature } from './utils';
import { processKarmaMessage } from '../../karma';
import { processMessageLinks, processMessageDeletion } from '../../link-tracking';
import { processHelpCommand } from '../../help';
import { processGreeting } from '../../greetings';
import { processMessageForAutoResponse } from '../../auto-responder/auto-responder';
import { processXLinks } from '../../x-transformer/x-transformer';
import { sendSlackMessage, sendSlackEphemeralMessage, addSlackReaction } from './messaging';

export interface SlackEventHandlerOptions {
  logger: Logger;
  config: Config;
  storage: KVStore;
}

export async function handleSlackEvent(
  request: Request,
  options: SlackEventHandlerOptions
): Promise<Response> {
  const { logger, config, storage } = options;
  
  try {
    // Get headers for signature verification
    const slackSignature = request.headers.get('x-slack-signature');
    const slackTimestamp = request.headers.get('x-slack-request-timestamp');
    
    // Read request body as text
    const bodyText = await request.text();
    
    // Log receipt of request
    logger.info("Received Slack request", { 
      bodyPreview: bodyText.substring(0, 200),
      headers: {
        signature: slackSignature ? '✓' : '✗',
        timestamp: slackTimestamp
      }
    });
    
    // Verify the request is from Slack
    if (
      config.slackSigningSecret && 
      slackSignature && 
      slackTimestamp && 
      !verifySlackSignature(
        slackSignature,
        slackTimestamp,
        bodyText,
        config.slackSigningSecret
      )
    ) {
      logger.warn("Failed Slack signature verification", {
        timestamp: slackTimestamp
      });
      
      return new Response('Invalid signature', { status: 401 });
    }
    
    // Parse JSON
    const body = JSON.parse(bodyText);
    
    // Handle URL verification challenge
    if (body.type === 'url_verification') {
      logger.info("Handling URL verification challenge", {
        challenge: body.challenge
      });
      
      // Return challenge response
      return new Response(
        JSON.stringify({ challenge: body.challenge }),
        { headers: { 'Content-Type': 'application/json' } }
      );
    }
    
    // For other events, log and acknowledge
    logger.info("Received Slack event", {
      type: body.event?.type || "unknown",
      team: body.team_id,
      eventId: body.event_id,
      timestamp: body.event_time
    });
    
    // Process message events
    if (body.event?.type === 'message' && body.event?.text) {
      await handleMessageEvent(body.event, options);
    }
    
    // Process message deletion events
    if (body.event?.type === 'message' && body.event?.subtype === 'message_deleted') {
      await handleMessageDeletion(body.event, options);
    }
    
    return new Response("Event received", {
      headers: { 'Content-Type': 'text/plain' }
    });
  } catch (error: unknown) {
    logger.error(
      "Error in Slack event handler", 
      error instanceof Error ? error : new Error(String(error))
    );
    
    return new Response(`Error: ${error instanceof Error ? error.message : String(error)}`, {
      status: 500,
      headers: { 'Content-Type': 'text/plain' }
    });
  }
}

/**
 * Handle a message event from Slack
 */
async function handleMessageEvent(
  event: any,
  options: SlackEventHandlerOptions
): Promise<void> {
  const { logger, storage, config } = options;
  
  // Skip processing if no text
  if (!event.text) {
    return;
  }

  // Skip processing bot messages to avoid loops
  if (event.bot_id || event.subtype === 'bot_message') {
    return;
  }
  
  try {
    // Ensure the API token exists for sending messages
    if (!config.slackApiToken) {
      logger.error('Cannot process message: API token is missing');
      return;
    }
    
    // Process for X/Twitter links
    const xLinksResult = await processXLinks(
      event.text,
      logger
    );
    
    // If there are X/Twitter links, transform and reply with xcancel links
    if (xLinksResult.hasXLinks && xLinksResult.transformedLinks.length > 0) {
      // Create a message with the transformed links
      let responseText = '';
      
      if (xLinksResult.transformedLinks.length === 1) {
        responseText = `Here's a link that doesn't require a Twitter/X account: ${xLinksResult.transformedLinks[0]}`;
      } else {
        responseText = `Here are links that don't require a Twitter/X account:\n${xLinksResult.transformedLinks.join('\n')}`;
      }
      
      await sendSlackMessage({
        channel: event.channel,
        text: responseText,
        thread_ts: event.thread_ts || event.ts,
        token: config.slackApiToken,
        unfurl_links: false // Prevent links from unfurling
      });
      
      logger.debug('Sent xcancel links response', {
        channel: event.channel,
        responsePreview: responseText.substring(0, 50)
      });
    }
    
    // Process for help command
    const helpResult = await processHelpCommand(
      event.text,
      storage,
      logger,
      config
    );
    
    // If there's a help response, send it back to the channel
    if (helpResult.response) {
      await sendSlackEphemeralMessage({
        channel: event.channel,
        text: helpResult.response,
        user: event.user,
        token: config.slackApiToken
      });
      
      logger.debug('Sent ephemeral help response', {
        channel: event.channel,
        user: event.user,
        responsePreview: helpResult.response.substring(0, 50)
      });
      
      // If help was processed, don't process other commands
      return;
    }
    
    // Process for greetings
    const greetingResult = await processGreeting(
      event.text,
      event.user,
      logger,
      config
    );
    
    // If it's a greeting, add a wave reaction
    if (greetingResult.isGreeting && greetingResult.shouldAddReaction) {
      await addSlackReaction({
        channel: event.channel,
        timestamp: event.ts,
        reaction: 'wave',
        token: config.slackApiToken
      });
      
      logger.debug('Added wave reaction to greeting', {
        channel: event.channel,
        user: event.user
      });
    }
    
    // If there's a greeting response, send it back to the channel
    if (greetingResult.response) {
      await sendSlackMessage({
        channel: event.channel,
        text: greetingResult.response,
        thread_ts: event.thread_ts || event.ts,
        token: config.slackApiToken
      });
      
      logger.debug('Sent greeting response', {
        channel: event.channel,
        responsePreview: greetingResult.response.substring(0, 50)
      });
      
      // If greeting was processed, don't process other commands
      return;
    }
    
    // Process for auto-responder
    const autoResponderResult = await processMessageForAutoResponse(
      event.text,
      event.user,
      logger,
      config
    );
    
    // If there's an auto-response, send it back as a thread
    if (autoResponderResult.shouldRespond && autoResponderResult.response) {
      await sendSlackMessage({
        channel: event.channel,
        text: autoResponderResult.response,
        thread_ts: event.thread_ts || event.ts,
        token: config.slackApiToken,
        unfurl_links: false  // Prevent links from unfurling
      });
      
      logger.debug('Sent auto-response', {
        channel: event.channel,
        responsePreview: autoResponderResult.response.substring(0, 50)
      });
      
      // Continue processing other features even after auto-response
    }
    
    // Process for karma operations
    const karmaResult = await processKarmaMessage(
      event.text,
      event.user,
      storage,
      logger,
      config
    );
    
    // Debug log raw message text to help diagnose issues
    logger.debug('Message for karma processing', { 
      text: event.text,
      user: event.user
    });
    
    // If there's a karma response, send it back to the channel
    if (karmaResult.response) {
      await sendSlackMessage({
        channel: event.channel,
        text: karmaResult.response,
        ...(event.thread_ts ? { thread_ts: event.thread_ts } : {}), // Only include thread_ts when in a thread
        token: config.slackApiToken
      });
      
      logger.debug('Sent karma response', {
        channel: event.channel,
        responsePreview: karmaResult.response.substring(0, 50)
      });
    }
    
    // If there was a self-karma attempt, add a blob-lol reaction
    if (karmaResult.selfKarmaAttempt) {
      await addSlackReaction({
        channel: event.channel,
        timestamp: event.ts,
        reaction: 'blob-lol',
        token: config.slackApiToken
      });
      
      logger.debug('Added reaction for self-karma attempt', {
        channel: event.channel,
        user: event.user
      });
    }
    
    // Process links in the message
    const linkResult = await processMessageLinks(
      {
        text: event.text,
        ts: event.ts,
        channel: event.channel,
        user: event.user,
        thread_ts: event.thread_ts,
        permalink: event.permalink // This might not be provided directly by Slack
      },
      storage,
      logger
    );
    
    // If there's a link context response, send it back to the channel
    if (linkResult.response) {
      await sendSlackMessage({
        channel: event.channel,
        text: linkResult.response,
        thread_ts: event.thread_ts || event.ts,
        token: config.slackApiToken
      });
      
      logger.debug('Sent link context response', {
        channel: event.channel,
        linkCount: linkResult.linksFound.length,
        responsePreview: linkResult.response.substring(0, 50)
      });
    }
    
  } catch (error) {
    logger.error(
      'Error processing message event',
      error instanceof Error ? error : new Error(String(error))
    );
  }
}

/**
 * Handle a message deletion event from Slack
 */
async function handleMessageDeletion(
  event: any,
  options: SlackEventHandlerOptions
): Promise<void> {
  const { logger, storage } = options;
  
  try {
    logger.debug('Processing message deletion event', {
      channel: event.channel,
      ts: event.ts,
      hasPreviousMessage: !!event.previous_message
    });
    
    // Process the message deletion to clean up any links
    await processMessageDeletion(
      {
        ts: event.ts,
        channel: event.channel,
        previous_message: event.previous_message
      },
      storage,
      logger
    );
    
  } catch (error) {
    logger.error(
      'Error processing message deletion event',
      error instanceof Error ? error : new Error(String(error))
    );
  }
}