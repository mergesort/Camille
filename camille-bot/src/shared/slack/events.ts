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
  
  // Skip bot messages and message_changed events
  if (event.bot_id || event.subtype === 'message_changed') {
    return;
  }
  
  try {
    // Ensure the API token exists for sending messages
    if (!config.slackApiToken) {
      logger.error('Cannot process message: API token is missing');
      return;
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
      await sendSlackMessage({
        channel: event.channel,
        text: helpResult.response,
        thread_ts: event.thread_ts || event.ts,
        token: config.slackApiToken
      });
      
      logger.debug('Sent help response', {
        channel: event.channel,
        responsePreview: helpResult.response.substring(0, 50)
      });
      
      // If help was processed, don't process other commands
      return;
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
        thread_ts: event.thread_ts || event.ts,
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
 * Send a message to a Slack channel
 */
async function sendSlackMessage(options: {
  channel: string;
  text: string;
  thread_ts?: string;
  token: string;
}): Promise<void> {
  const { channel, text, thread_ts, token } = options;
  
  const payload = {
    channel,
    text,
    ...(thread_ts ? { thread_ts } : {})
  };
  
  const response = await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify(payload)
  });
  
  if (!response.ok) {
    const errorData = await response.text();
    throw new Error(`Failed to send Slack message: ${errorData}`);
  }
}

/**
 * Add a reaction emoji to a message
 */
async function addSlackReaction(options: {
  channel: string;
  timestamp: string;
  reaction: string;
  token: string;
}): Promise<void> {
  const { channel, timestamp, reaction, token } = options;
  
  const payload = {
    channel,
    timestamp,
    name: reaction
  };
  
  const response = await fetch('https://slack.com/api/reactions.add', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify(payload)
  });
  
  if (!response.ok) {
    const errorData = await response.text();
    throw new Error(`Failed to add reaction: ${errorData}`);
  }
} 