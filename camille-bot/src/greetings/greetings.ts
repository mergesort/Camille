/**
 * Greetings Module Implementation
 *
 * This module handles greeting responses when users directly greet the bot.
 */

import { Logger } from '../shared/logging/logger';
import { Config } from '../shared/config/config';
import { KVStore } from '../shared/storage/kv-store';

// Greeting words to detect
const GREETING_PATTERNS = [
  /\b(hello|hi|hey|howdy|gday|g'day|greetings|hola|bonjour|sup|yo|heya)\b/i
];

// Possible greeting responses
const GREETING_RESPONSES = [
  'heya',
  'hey',
  'hi',
  'hello',
  'gday',
  'howdy'
];

/**
 * Result from processing a potential greeting message
 */
export interface GreetingResult {
  // Whether this was a greeting directed at the bot
  isGreeting: boolean;
  
  // The response message to send back (if any)
  response: string | null;
  
  // Whether an emoji reaction should be added
  shouldAddReaction: boolean;
}

/**
 * Process a message to check if it's a greeting directed at the bot
 */
export async function processGreeting(
  messageText: string,
  userId: string,
  logger: Logger,
  config: Config
): Promise<GreetingResult> {
  try {
    logger.debug('Processing message for greetings', { 
      textPreview: messageText.substring(0, 50),
      userId
    });
    
    // Default result
    const result: GreetingResult = {
      isGreeting: false,
      response: null,
      shouldAddReaction: false
    };
    
    // Check if message is directed at the bot
    // Either by direct mention or in a DM
    const botMentioned = messageText.includes(`<@${config.slackBotId}>`);
    
    // If bot is not directly mentioned, ignore
    if (!botMentioned) {
      return result;
    }
    
    // Check if message contains a greeting pattern
    const containsGreeting = GREETING_PATTERNS.some(pattern => 
      pattern.test(messageText)
    );
    
    if (!containsGreeting) {
      return result;
    }
    
    // It's a greeting!
    logger.info('Detected greeting to bot', { userId });
    
    // Select a random greeting response
    const randomResponse = GREETING_RESPONSES[
      Math.floor(Math.random() * GREETING_RESPONSES.length)
    ];
    
    result.isGreeting = true;
    result.response = `${randomResponse} back at you <@${userId}>`;
    result.shouldAddReaction = true;
    
    return result;
  } catch (error) {
    logger.error(
      'Error processing greeting', 
      error instanceof Error ? error : new Error(String(error))
    );
    
    // Return default result on error
    return {
      isGreeting: false,
      response: null,
      shouldAddReaction: false
    };
  }
} 