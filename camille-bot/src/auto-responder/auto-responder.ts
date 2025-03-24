/**
 * Auto-Responder Implementation
 *
 * Detects trigger phrases like "hey guys" and responds with documentation links.
 */

import { Logger } from '../shared/logging/logger';
import { Config } from '../shared/config/config';
import { KVStore } from '../shared/storage/kv-store';

// Define trigger phrases to detect
const TRIGGER_PATTERNS = [
  /\bhey\s+guys\b/i,
  /\byou\s+guys\b/i,
  /\bthanks\s+guys\b/i,
  /\bhi\s+guys\b/i,
  /\bthank\s+you\s+guys\b/i
];

// The response message to send
const INCLUSIVE_LANGUAGE_MESSAGE = "To promote inclusivity we ask people to use an alternative to guys such as y'all or folks. We all make mistakes so don't overthink it, you can learn more about <https://iosfolks.com/hey-guys|this message> or <https://iosfolks.com/camille|Camille> in our Community Guide.";

/**
 * Result from processing a message for auto-response
 */
export interface AutoResponderResult {
  // Whether this message should receive an auto-response
  shouldRespond: boolean;
  
  // The response message to send back (if any)
  response: string | null;
}

/**
 * Process a message to check if it contains trigger phrases for auto-response
 */
export async function processMessageForAutoResponse(
  messageText: string,
  userId: string,
  logger: Logger,
  config: Config
): Promise<AutoResponderResult> {
  try {
    logger.debug('Processing message for auto-response', { 
      textPreview: messageText.substring(0, 50),
      userId
    });
    
    // Default result
    const result: AutoResponderResult = {
      shouldRespond: false,
      response: null
    };
    
    // Check if message contains any trigger phrases
    const containsTrigger = TRIGGER_PATTERNS.some(pattern => 
      pattern.test(messageText)
    );
    
    if (!containsTrigger) {
      return result;
    }
    
    // Found a trigger phrase
    logger.info('Detected inclusive language trigger in message', { userId });
    
    // Set the response message
    result.shouldRespond = true;
    result.response = INCLUSIVE_LANGUAGE_MESSAGE;
    
    return result;
  } catch (error) {
    logger.error(
      'Error processing message for auto-response', 
      error instanceof Error ? error : new Error(String(error))
    );
    
    // Return default result on error
    return {
      shouldRespond: false,
      response: null
    };
  }
} 