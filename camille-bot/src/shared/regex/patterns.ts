/**
 * Regex Patterns
 *
 * Shared regex patterns used across features
 */

/**
 * Create a bot command regex for a specific command
 * @param botId The bot's Slack ID
 * @param command The command name (e.g., 'help', 'where')
 * @param captureContent Whether to capture content after the command
 * @returns A RegExp that matches the specific bot command
 */
export function createBotCommandRegex(
  botId: string | undefined, 
  command: string, 
  captureContent = false
): RegExp {
  const pattern = botId 
    ? `^<@${botId}(?:\\|[^>]+)?>\\s+${command}${captureContent ? '(?:\\s+(.*))?$' : '$'}`
    : `^<@[A-Z0-9]+(?:\\|[^>]+)?>\\s+${command}${captureContent ? '(?:\\s+(.*))?$' : '$'}`;
  
  return new RegExp(pattern, 'i');
}

// ============================
// SLACK FORMATTING PATTERNS
// ============================

/**
 * Slack mention regex pattern
 * Matches Slack user mentions like <@U12345|username>
 */
export const SLACK_MENTION_REGEX = /<@([A-Z0-9]+)(?:\|[^>]+)?>/g;

// ============================
// URL PATTERNS
// ============================

/**
 * Comprehensive URL regex pattern
 * Matches URLs with or without protocols (http/https/www)
 * Handles various TLDs and subdomains
 * This is the preferred pattern for all URL matching in the codebase
 */
export const EXTENDED_URL_REGEX = /(?:https?:\/\/)?(?:www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,63}\b(?:[-a-zA-Z0-9()@:%_\+.~#?&//=]*)/gi;

/**
 * X/Twitter URL regex pattern
 * Matches URLs from twitter.com or x.com domains
 */
export const X_TWITTER_URL_REGEX = /(?:https?:\/\/)?(?:www\.)?(twitter\.com|x\.com)(?:\/[^\s]*)?/gi;

// ============================
// KARMA PATTERNS
// ============================

/**
 * Karma increment pattern
 * Matches @username++ format for giving karma
 */
export const KARMA_INCREMENT_REGEX = /<@([A-Z0-9]+)(?:\|[^>]+)?>\s*\+\+/g;

/**
 * Karma decrement pattern
 * Matches @username-- format for removing karma
 */
export const KARMA_DECREMENT_REGEX = /<@([A-Z0-9]+)(?:\|[^>]+)?>\s*--/g;

/**
 * Karma add pattern
 * Matches @username+= N format for adding N karma points
 */
export const KARMA_ADD_REGEX = /<@([A-Z0-9]+)(?:\|[^>]+)?>\s*\+=\s*(\d+(?:\.\d+)?)/g;

/**
 * Karma subtract pattern
 * Matches @username-= N format for subtracting N karma points
 */
export const KARMA_SUBTRACT_REGEX = /<@([A-Z0-9]+)(?:\|[^>]+)?>\s*-=\s*(\d+(?:\.\d+)?)/g;

/**
 * Create a karma query regex
 * Matches @botname karma @username format
 * @param botId The bot's Slack ID
 */
export function createKarmaQueryRegex(botId: string | undefined): RegExp {
  const pattern = botId
    ? `<@${botId}(?:\\|[^>]+)?>\\s+karma\\s+<@([A-Z0-9]+)(?:\\|[^>]+)?>`
    : `<@[A-Z0-9]+(?:\\|[^>]+)?>\\s+karma\\s+<@([A-Z0-9]+)(?:\\|[^>]+)?>`;
  
  return new RegExp(pattern, 'i');
}

/**
 * Create a leaderboard request regex
 * Matches @botname leaderboard format
 * @param botId The bot's Slack ID
 */
export function createLeaderboardRegex(botId: string | undefined): RegExp {
  const pattern = botId
    ? `<@${botId}(?:\\|[^>]+)?>\\s+leaderboard`
    : `<@[A-Z0-9]+(?:\\|[^>]+)?>\\s+leaderboard`;
  
  return new RegExp(pattern, 'i');
} 