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
import { processLostHoursMessage } from '../../lost-hours';
import { sendSlackMessage, sendSlackEphemeralMessage, addSlackReaction, sendSlackUnfurl } from './messaging';
import { isBlueskyUrl, fetchBlueskyPost, formatUnfurl } from '../../bluesky-unfurl';
import { SlackLinkSharedEvent } from './types';

export interface SlackEventHandlerOptions {
  logger: Logger;
  config: Config;
  storage: KVStore;
}

export async function handleSlackEvent(
  request: Request,
  options: SlackEventHandlerOptions,
  ctx?: ExecutionContext
): Promise<Response> {
  const { logger, config, storage } = options;
  
  try {
    // Get headers for signature verification
    const slackSignature = request.headers.get('x-slack-signature');
    const slackTimestamp = request.headers.get('x-slack-request-timestamp');
    const slackRetryNum = request.headers.get('x-slack-retry-num');
    const slackRetryReason = request.headers.get('x-slack-retry-reason');
    
    // Read request body as text
    const bodyText = await request.text();
    
    // Log receipt of request
    logger.info("Received Slack request", { 
      bodyPreview: bodyText.substring(0, 200),
      headers: {
        signature: slackSignature ? '✓' : '✗',
        timestamp: slackTimestamp,
        retryNum: slackRetryNum,
        retryReason: slackRetryReason
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
      timestamp: body.event_time,
      retryNum: slackRetryNum,
      retryReason: slackRetryReason
    });

    const processing = processSlackEvent(body, options, {
      retryNum: slackRetryNum,
      retryReason: slackRetryReason
    });

    if (ctx) {
      logger.debug('ACKing Slack event and scheduling background processing', {
        eventId: body.event_id,
        team: body.team_id,
        type: body.event?.type || 'unknown',
        retryNum: slackRetryNum,
        retryReason: slackRetryReason
      });
      ctx.waitUntil(processing);
      return new Response("Event received", {
        headers: { 'Content-Type': 'text/plain' }
      });
    }

    await processing;
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

async function processSlackEvent(
  body: any,
  options: SlackEventHandlerOptions,
  metadata: { retryNum: string | null; retryReason: string | null }
): Promise<void> {
  const { logger } = options;

  const eventId = typeof body?.event_id === 'string' ? body.event_id : null;
  const teamId = typeof body?.team_id === 'string' ? body.team_id : 'unknown-team';
  const idempotencyKey = eventId ? `slack:event:${teamId}:${eventId}` : null;
  const startTimeMs = Date.now();

  logger.debug('Starting Slack event processing', {
    eventId,
    teamId,
    envelopeType: body?.type,
    eventType: body?.event?.type,
    eventSubtype: body?.event?.subtype,
    retryNum: metadata.retryNum,
    retryReason: metadata.retryReason
  });

  try {
    // Process message events
    if (body.event?.type === 'message' && body.event?.text) {
      await handleMessageEvent(body.event, options);
    }

    // Process message deletion events
    if (body.event?.type === 'message' && body.event?.subtype === 'message_deleted') {
      await handleMessageDeletion(body.event, options);
    }

    // Process link_shared events for unfurling
    if (body.event?.type === 'link_shared') {
      await handleLinkShared(body.event as SlackLinkSharedEvent, options);
    }
  } finally {
    logger.debug('Finished Slack event processing', {
      eventId,
      teamId,
      durationMs: Date.now() - startTimeMs
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

  // Some bot messages may not have bot_id/subtype but will have our bot user id
  if (config.slackBotId && event.user === config.slackBotId) {
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

    // Process for lost-hours tracking
    try {
      const lostHoursResult = await processLostHoursMessage(event.text, event.user, event.channel, logger, config);

      // If lost hours were processed successfully, send confirmation in thread
      if (lostHoursResult.response && config.slackApiToken) {
        await sendSlackMessage({
          channel: event.channel,
          text: lostHoursResult.response,
          thread_ts: event.thread_ts || event.ts, // Always reply in thread
          token: config.slackApiToken
        });

        logger.debug('Sent lost-hours confirmation', {
          channel: event.channel,
          oldHours: lostHoursResult.oldHours,
          newHours: lostHoursResult.newHours,
          increment: lostHoursResult.increment
        });
      }
    } catch (error) {
      logger.error('Error in lost-hours processing', error instanceof Error ? error : new Error(String(error)));
    }

    // Continue processing other features

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

/**
 * Handle a link_shared event from Slack for unfurling
 */
async function handleLinkShared(
  event: SlackLinkSharedEvent,
  options: SlackEventHandlerOptions
): Promise<void> {
  const { logger, config } = options;

  try {
    if (!config.slackApiToken) {
      logger.error('Cannot process link_shared: API token is missing');
      return;
    }

    // Filter to only Bluesky links
    const blueskyLinks = event.links.filter((link) => isBlueskyUrl(link.url));

    if (blueskyLinks.length === 0) {
      return;
    }

    logger.debug('Processing Bluesky links for unfurling', {
      channel: event.channel,
      linkCount: blueskyLinks.length
    });

    // Fetch all posts in parallel
    const results = await Promise.all(
      blueskyLinks.map(async (link) => {
        const result = await fetchBlueskyPost(link.url, logger);
        return { url: link.url, result };
      })
    );

    // Build unfurls object
    const unfurls: Record<string, ReturnType<typeof formatUnfurl>> = {};

    for (const { url, result } of results) {
      if (result.status === 'success') {
        unfurls[url] = formatUnfurl(result.post, result.postUrl);
      } else {
        logger.warn(`Failed to fetch Bluesky post for ${url}`, { error: result.message });
      }
    }

    // Send unfurls to Slack if we have any
    if (Object.keys(unfurls).length > 0) {
      await sendSlackUnfurl({
        channel: event.channel,
        ts: event.message_ts,
        unfurls,
        token: config.slackApiToken
      });

      logger.info('Sent Bluesky unfurls', {
        channel: event.channel,
        unfurlCount: Object.keys(unfurls).length
      });
    }

  } catch (error) {
    logger.error(
      'Error processing link_shared event',
      error instanceof Error ? error : new Error(String(error))
    );
  }
}
