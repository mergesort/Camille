/**
 * Help Command
 *
 * Provides documentation for available bot commands
 */

import { Logger } from '../shared/logging/logger';
import { KVStore } from '../shared/storage/kv-store';
import { Config } from '../shared/config/config';

// This will only be initialized when a specific bot ID is provided
let HELP_COMMAND_REGEX: RegExp | null = null;

/**
 * Process a message for help command
 */
export async function processHelpCommand(
  message: string,
  storage: KVStore,
  logger: Logger,
  config: Config
): Promise<{ response?: string }> {
  logger.debug('Checking for help command', { messagePreview: message.substring(0, 50) });
  
  // Initialize the regex if we have a bot ID and it hasn't been initialized yet
  if (!HELP_COMMAND_REGEX && config.slackBotId) {
    // This will match "@camille help" only when directed at our specific bot ID
    HELP_COMMAND_REGEX = new RegExp(`^<@${config.slackBotId}(?:\\|[^>]+)?>\\s+help$`, 'i');
    logger.debug('Initialized help command regex with bot ID', { botId: config.slackBotId });
  } else if (!HELP_COMMAND_REGEX) {
    // Fallback to a generic regex if no bot ID is provided
    HELP_COMMAND_REGEX = /^<@[A-Z0-9]+(?:\|[^>]+)?>\s+help$/i;
    logger.warn('No bot ID provided, using generic help command regex');
  }
  
  // Check if this is a help command directed at our bot
  if (!HELP_COMMAND_REGEX.test(message)) {
    return {};
  }
  
  logger.info('Help command detected');
  
  // Return the help message
  return {
    response: formatHelpMessage()
  };
}

/**
 * Format the help message with all available commands
 */
function formatHelpMessage(): string {
  return `
*Available Commands*

*Karma System*
• \`@username++\` - Give 1 karma point to a user
• \`@username--\` - Remove 1 karma point from a user
• \`@username+= N\` - Give N karma points to a user (max 10)
• \`@username-= N\` - Remove N karma points from a user (max 10)
• \`@camille karma @username\` - Check a user's karma points
• \`@camille leaderboard\` - View the karma leaderboard

*Autoresponders*
• When you say "hello" or similar greetings to @camille, she'll respond with a friendly greeting and wave
• When someone uses "hey guys" or similar phrases, Camille will kindly suggest more inclusive alternatives
• When someone shares a Twitter/X link, Camille will provide a version that doesn't require an account

*Help*
• \`@camille help\` - Show this help message

*Tips*
• You cannot give karma to yourself
• You can only apply one karma operation per user in a message
• Multiple karma modification operations in one message are supported (for different users)
• If you want to give karma privately, you can run Camille's commands in your DM with Camille
`.trim();
} 