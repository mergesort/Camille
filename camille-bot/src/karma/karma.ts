/**
 * Karma System
 *
 * Handles parsing and responding to karma operations in messages
 */

import { Logger } from '../shared/logging/logger';
import { KVStore } from '../shared/storage/kv-store';
import { Config } from '../shared/config/config';
import { updateUserKarma, getUserKarma, KarmaData, getKarmaLeaderboard } from './storage';
import { KVNamespace } from '@cloudflare/workers-types';
import { KARMA_KEY_PREFIX } from './storage';
import {
  KARMA_INCREMENT_REGEX,
  KARMA_DECREMENT_REGEX,
  KARMA_ADD_REGEX,
  KARMA_SUBTRACT_REGEX,
  createKarmaQueryRegex,
  createLeaderboardRegex
} from '../shared/regex/patterns';

// These regexes will be initialized with the bot ID when available
let KARMA_QUERY_REGEX: RegExp | null = null;
let LEADERBOARD_REGEX: RegExp | null = null;

// Export regexes for testing
export const getRuntimeRegexes = () => ({
  KARMA_QUERY_REGEX,
  LEADERBOARD_REGEX
});

// Configuration
// Maximum points that can be added/subtracted in a single operation
// For multiple + or - characters:
// ++ = 1 point, +++ = 2 points, ++++ = 3 points, etc.
// -- = -1 point, --- = -2 points, ---- = -3 points, etc.
const MAX_KARMA_CHANGE = 10;

// Interface for karma operation
interface KarmaOperation {
  targetUserId: string;
  change: number;
}

/**
 * Initialize regex patterns based on bot ID if available
 * Exported for testing purposes
 */
export function initializeRegexes(config?: Config, logger?: Logger): void {
  // If regexes are already initialized or no config, return
  if ((KARMA_QUERY_REGEX && LEADERBOARD_REGEX) || !config) {
    return;
  }
  
  // If we have a bot ID, create regexes using the shared helpers
  if (config.slackBotId) {
    KARMA_QUERY_REGEX = createKarmaQueryRegex(config.slackBotId);
    LEADERBOARD_REGEX = createLeaderboardRegex(config.slackBotId);
    
    if (logger) {
      logger.debug('Initialized karma regexes with bot ID', { 
        botId: config.slackBotId,
        karmaQueryRegex: KARMA_QUERY_REGEX.toString(),
        leaderboardRegex: LEADERBOARD_REGEX.toString()
      });
    }
  } else {
    // Fallback to generic regexes if no bot ID provided
    KARMA_QUERY_REGEX = createKarmaQueryRegex(undefined);
    LEADERBOARD_REGEX = createLeaderboardRegex(undefined);
    
    if (logger) {
      logger.warn('No bot ID provided, using generic karma command regexes', {
        karmaQueryRegex: KARMA_QUERY_REGEX.toString(),
        leaderboardRegex: LEADERBOARD_REGEX.toString()
      });
    }
  }
}

/**
 * Process a message for karma operations
 */
export async function processKarmaMessage(
  message: string,
  userId: string,
  storage: KVStore,
  logger: Logger,
  config?: Config
): Promise<{ response?: string; operations?: KarmaOperation[]; selfKarmaAttempt?: boolean }> {
  logger.debug('Processing message for karma operations', { 
    messagePreview: message.substring(0, 50),
    hasBotId: config?.slackBotId ? true : false,
    botId: config?.slackBotId || 'none'
  });
  
  // Initialize regexes with bot ID if available and not already initialized
  initializeRegexes(config, logger);
  
  // Check if this is a karma query directed at our bot
  if (KARMA_QUERY_REGEX && KARMA_QUERY_REGEX.test(message)) {
    const match = message.match(KARMA_QUERY_REGEX);
    logger.debug('Karma query regex test result', { 
      matches: !!match,
      messagePreview: message.substring(0, 100),
      regex: KARMA_QUERY_REGEX.toString()
    });
    
    if (match) {
      const targetUserId = match[1];
      logger.debug('Karma query detected', { 
        targetUserId,
        messagePreview: message.substring(0, 50)
      });
      return await handleKarmaQuery(targetUserId, storage, logger);
    }
  } else {
    logger.debug('Message did not match karma query regex', {
      messagePreview: message.substring(0, 100),
      regex: KARMA_QUERY_REGEX?.toString() || 'regex not initialized'
    });
  }
  
  // Check if this is a leaderboard request directed at our bot
  if (LEADERBOARD_REGEX && LEADERBOARD_REGEX.test(message)) {
    logger.debug('Leaderboard request detected', {
      messagePreview: message.substring(0, 50),
      regex: LEADERBOARD_REGEX.toString()
    });
    return await handleLeaderboardRequest(storage, logger);
  } else {
    logger.debug('Message did not match leaderboard regex', {
      messagePreview: message.substring(0, 100),
      regex: LEADERBOARD_REGEX?.toString() || 'regex not initialized'
    });
  }
  
  // Check for self-karma attempts before finding other operations
  const selfKarmaAttempt = checkForSelfKarmaAttempt(message, userId);
  
  // Find all karma operations in the message
  const operations = extractKarmaOperations(message, userId);
  
  // If no operations, return early with self-karma flag if detected
  if (operations.length === 0) {
    return { selfKarmaAttempt: selfKarmaAttempt || undefined };
  }
  
  // Apply all operations
  const results = await applyKarmaOperations(operations, userId, storage, logger);
  
  // Prepare response
  return {
    response: formatKarmaResponse(results),
    operations,
    selfKarmaAttempt: selfKarmaAttempt || undefined
  };
}

/**
 * Extract karma operations from a message
 */
function extractKarmaOperations(message: string, senderUserId: string): KarmaOperation[] {
  const operations: KarmaOperation[] = [];
  const processedUsers = new Set<string>(); // To prevent duplicate operations on the same user
  
  // Process increments (++, +++, etc.)
  let match;
  while ((match = KARMA_INCREMENT_REGEX.exec(message)) !== null) {
    const targetUserId = match[1];
    const plusChars = match[2];
    
    // Calculate points based on the number of + characters (minimum 1, maximum MAX_KARMA_CHANGE)
    // ++ = 1 point, +++ = 2 points, ++++ = 3 points, etc.
    const additionalPoints = Math.min(plusChars.length - 2, MAX_KARMA_CHANGE - 1);
    const points = 1 + additionalPoints;
    
    // Prevent self-karma and duplicates
    if (targetUserId !== senderUserId && !processedUsers.has(targetUserId)) {
      operations.push({ targetUserId, change: points });
      processedUsers.add(targetUserId);
    }
  }
  
  // Process decrements (--, ---, etc.)
  KARMA_DECREMENT_REGEX.lastIndex = 0; // Reset regex state
  while ((match = KARMA_DECREMENT_REGEX.exec(message)) !== null) {
    const targetUserId = match[1];
    const minusChars = match[2];
    
    // Calculate points based on the number of - characters (minimum 1, maximum MAX_KARMA_CHANGE)
    // -- = -1 point, --- = -2 points, ---- = -3 points, etc.
    const additionalPoints = Math.min(minusChars.length - 2, MAX_KARMA_CHANGE - 1);
    const points = 1 + additionalPoints;
    
    // Prevent self-karma and duplicates
    if (targetUserId !== senderUserId && !processedUsers.has(targetUserId)) {
      operations.push({ targetUserId, change: -points });
      processedUsers.add(targetUserId);
    }
  }
  
  // Process add operations (+=N)
  KARMA_ADD_REGEX.lastIndex = 0;
  while ((match = KARMA_ADD_REGEX.exec(message)) !== null) {
    const targetUserId = match[1];
    // Floor the decimal value and cap at MAX_KARMA_CHANGE
    const points = Math.min(Math.floor(parseFloat(match[2])), MAX_KARMA_CHANGE);
    
    // Prevent self-karma and duplicates
    if (targetUserId !== senderUserId && !processedUsers.has(targetUserId)) {
      operations.push({ targetUserId, change: points });
      processedUsers.add(targetUserId);
    }
  }
  
  // Process subtract operations (-=N)
  KARMA_SUBTRACT_REGEX.lastIndex = 0;
  while ((match = KARMA_SUBTRACT_REGEX.exec(message)) !== null) {
    const targetUserId = match[1];
    // Floor the decimal value and cap at MAX_KARMA_CHANGE
    const points = Math.min(Math.floor(parseFloat(match[2])), MAX_KARMA_CHANGE);
    
    // Prevent self-karma and duplicates
    if (targetUserId !== senderUserId && !processedUsers.has(targetUserId)) {
      operations.push({ targetUserId, change: -points });
      processedUsers.add(targetUserId);
    }
  }
  
  return operations;
}

/**
 * Apply karma operations to users
 */
async function applyKarmaOperations(
  operations: KarmaOperation[],
  updatedBy: string,
  storage: KVStore,
  logger: Logger
): Promise<Map<string, KarmaData>> {
  const results = new Map<string, KarmaData>();
  
  for (const op of operations) {
    try {
      const result = await updateUserKarma(
        op.targetUserId,
        op.change,
        updatedBy,
        storage
      );
      
      results.set(op.targetUserId, result);
      logger.debug('Updated karma', { 
        targetUser: op.targetUserId, 
        change: op.change, 
        newTotal: result.points 
      });
    } catch (error) {
      logger.error(
        'Error updating karma', 
        error instanceof Error ? error : new Error(String(error)),
        { 
          targetUserId: op.targetUserId,
          change: op.change
        }
      );
    }
  }
  
  return results;
}

/**
 * Format a karma response message
 */
function formatKarmaResponse(results: Map<string, KarmaData>): string {
  if (results.size === 0) {
    return 'No karma changes were applied.';
  }
  
  const parts = [];
  
  for (const [userId, data] of results.entries()) {
    const change = data.lastChange || 0;
    const message = getKarmaChangeMessage(userId, data.points, change);
    parts.push(message);
  }
  
  return parts.join(' ');
}

/**
 * Get a randomized message for karma changes
 */
function getKarmaChangeMessage(userId: string, points: number, change: number): string {
  const pluralizedScoreString = points === 1 ? "camillecoin" : "camillecoins";
  
  // Positive messages
  const positiveMessages = [
    (userId: string, points: number) => `You rock <@${userId}>! Now at ${points}.`,
    (userId: string, points: number) => `Nice job, <@${userId}>! Your karma just bumped to ${points}.`,
    (userId: string, points: number) => `Awesome <@${userId}>! You're now at ${points} ${pluralizedScoreString}.`
  ];
  
  // Negative messages
  const negativeMessages = [
    (userId: string, points: number) => `booooo <@${userId}>! Now at ${points}.`,
    (userId: string, points: number) => `Tssss <@${userId}>. Dropped your karma to ${points}.`,
    (userId: string, points: number) => `Sorry, but I have to drop <@${userId}>'s karma down to ${points} ${pluralizedScoreString}.`
  ];
  
  // Select random message based on whether change is positive or negative
  const messages = change >= 0 ? positiveMessages : negativeMessages;
  const randomIndex = Math.floor(Math.random() * messages.length);
  
  return messages[randomIndex](userId, points);
}

/**
 * Handle a karma query for a specific user
 */
async function handleKarmaQuery(
  targetUserId: string,
  storage: KVStore,
  logger: Logger
): Promise<{ response: string }> {
  logger.debug('Handling karma query', { targetUser: targetUserId });
  
  const karma = await getUserKarma(targetUserId, storage);
  
  if (!karma) {
    return { response: `<@${targetUserId}> has no karma yet.` };
  }
  
  return { response: `<@${targetUserId}> has ${karma.points} karma points.` };
}

/**
 * Check if a user is attempting to give themselves karma
 */
function checkForSelfKarmaAttempt(message: string, userId: string): boolean {
  // Reset all regex states
  KARMA_INCREMENT_REGEX.lastIndex = 0;
  KARMA_DECREMENT_REGEX.lastIndex = 0;
  KARMA_ADD_REGEX.lastIndex = 0;
  KARMA_SUBTRACT_REGEX.lastIndex = 0;
  
  // Check for increment attempts
  let match;
  while ((match = KARMA_INCREMENT_REGEX.exec(message)) !== null) {
    if (match[1] === userId) return true;
  }
  
  // Check for decrement attempts
  KARMA_DECREMENT_REGEX.lastIndex = 0;
  while ((match = KARMA_DECREMENT_REGEX.exec(message)) !== null) {
    if (match[1] === userId) return true;
  }
  
  // Check for add operations
  KARMA_ADD_REGEX.lastIndex = 0;
  while ((match = KARMA_ADD_REGEX.exec(message)) !== null) {
    if (match[1] === userId) return true;
  }
  
  // Check for subtract operations
  KARMA_SUBTRACT_REGEX.lastIndex = 0;
  while ((match = KARMA_SUBTRACT_REGEX.exec(message)) !== null) {
    if (match[1] === userId) return true;
  }
  
  return false;
}

/**
 * Handle a request for the karma leaderboard
 */
async function handleLeaderboardRequest(
  storage: KVStore,
  logger: Logger
): Promise<{ response: string }> {
  logger.debug('Handling leaderboard request');
  
  try {
    // Fetch the leaderboard data from storage
    const leaderboardData = await getKarmaLeaderboard(storage);
    
    if (!leaderboardData || leaderboardData.length === 0) {
      return { response: "The karma leaderboard is currently empty!" };
    }
    
    // Format the leaderboard into a Slack message
    const formattedMessage = await formatLeaderboardMessage(leaderboardData, storage, logger);
    
    return { response: formattedMessage };
  } catch (error) {
    logger.error(
      'Error handling leaderboard request',
      error instanceof Error ? error : new Error(String(error))
    );
    return { response: "Sorry, there was an error retrieving the karma leaderboard." };
  }
}

/**
 * Format the leaderboard data into a message
 */
async function formatLeaderboardMessage(
  leaderboardData: Array<{ userId: string; karma: KarmaData }>,
  storage: KVStore,
  logger: Logger
): Promise<string> {
  // Sort the leaderboard by karma points (highest first)
  const sortedData = [...leaderboardData].sort((a, b) => 
    b.karma.points - a.karma.points
  );
  
  // Fetch user information from Slack for better display
  const userInfoPromises = sortedData.map(async (entry) => {
    try {
      const userInfo = await getUserInfo(entry.userId, storage, logger);
      return {
        ...entry,
        displayName: userInfo?.real_name || userInfo?.name || `<@${entry.userId}>`
      };
    } catch (error) {
      logger.error(
        'Error fetching user info',
        error instanceof Error ? error : new Error(String(error)),
        { userId: entry.userId }
      );
      return {
        ...entry,
        displayName: `<@${entry.userId}>`
      };
    }
  });
  
  const usersWithNames = await Promise.all(userInfoPromises);
  
  // Create a formatted message with medals for top performers
  let message = "*:trophy: Karma Leaderboard :trophy:*\n\n";
  
  usersWithNames.forEach((user, index) => {
    let prefix = `${index + 1}. `;
    
    // Add medal emoji for top 3
    if (index === 0) prefix = ":first_place_medal: ";
    else if (index === 1) prefix = ":second_place_medal: ";
    else if (index === 2) prefix = ":third_place_medal: ";
    
    message += `${prefix}*${user.displayName}* - ${user.karma.points} point${user.karma.points !== 1 ? 's' : ''}\n`;
  });
  
  return message;
}

/**
 * Get user information from Slack API
 */
async function getUserInfo(
  userId: string,
  storage: KVStore,
  logger: Logger
): Promise<any> {
  try {
    // In Cloudflare Workers, env vars are passed in through the env object
    // Using the SLACK_API_TOKEN here via process.env is a bug
    // Cloudflare provides KV and secrets but doesn't use Node.js process.env
    
    // Since we can't easily pass the env object through all the function calls,
    // we'll need to handle this condition gracefully
    // This typically would come from process.env in Node.js or from a secrets binding in Cloudflare
    
    const token = process.env.SLACK_API_TOKEN;
    if (!token) {
      logger.error("Slack API token not available, consider updating this logic to get tokens from Cloudflare secrets");
      return null;
    }
    
    const response = await fetch(`https://slack.com/api/users.info?user=${userId}`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    
    const data = await response.json() as { ok: boolean; user?: any; error?: string };
    
    if (!data.ok) {
      logger.error(`Slack API error for user ${userId}:`, new Error(data.error || 'Unknown error'));
      return null;
    }
    
    return data.user;
  } catch (error) {
    logger.error(
      `Error fetching user info for ${userId}:`,
      error instanceof Error ? error : new Error(String(error))
    );
    return null;
  }
} 