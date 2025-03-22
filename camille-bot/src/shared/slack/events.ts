/**
 * Slack Events Handler
 *
 * Handles incoming Slack events and routes them to the appropriate feature modules
 */

import { Logger } from '../logging/logger';
import { Config } from '../config/config';
import { KVStore } from '../storage/kv-store';
import { verifySlackSignature } from './utils';

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
    
    // In the future, we'll have logic to handle different event types
    // For now, just store the event for debugging
    if (body.event_id) {
      await storage.set(`event:${body.event_id}`, {
        timestamp: new Date().toISOString(),
        body
      });
      logger.debug("Stored event data in KV");
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