/**
 * Link Tracking
 *
 * Handles detection, storage, and contextual responses for shared links in messages
 */

import { Logger } from '../shared/logging/logger';
import { KVStore } from '../shared/storage/kv-store';
import { storeLink, getLinkData, LinkData, normalizeUrl, LINK_KEY_PREFIX } from './storage';
import { SLACK_FORMATTED_URL_REGEX } from '../shared/regex/patterns';
import { getLogger, getStorage } from '../shared/context/app-context';

// Hosts that are allowlisted and shouldn't trigger "previously shared" notifications
export const ALLOWLISTED_HOSTS = [
  "apple.com",
  "developer.apple.com",
  "iosdevelopers.slack.com",
  "iosfolks.com",
  "mlb.tv",
  "youtube.com/watch?v=dQw4w9WgXcQ"
];

// Interface for link processing result
export interface LinkProcessingResult {
  linksFound: string[];
  response?: string;
}

/**
 * Process message for links and provide context if they've been shared before
 */
export async function processMessageLinks(
  message: {
    text: string;
    ts: string;
    channel: string;
    user: string;
    thread_ts?: string;
    permalink?: string;
  }
): Promise<LinkProcessingResult> {
  const logger = getLogger();
  const storage = getStorage();

  // Generate a unique trace ID for this message processing
  const traceId = `msg_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
  
  // Extract links from message
  const links = extractLinks(message.text);
  
  if (links.length === 0) {
    return { linksFound: [] };
  }
  
  logger.debug('Found links in message', { 
    traceId,
    linkCount: links.length,
    links: links, // Log the actual links for debugging
    messageTs: message.ts
  });
  
  // Check if any links have been shared before
  const contextResponses: Set<string> = new Set(); // Use a Set to avoid duplicate messages
  
  // Store the normalized URLs we'll need to save later
  const linksToStore: Array<{url: string, normalizedUrl: string}> = [];
  
  // Prepare promises for all link lookups to run in parallel
  const linkLookupPromises = links.map(async (url) => {
    // Normalize the URL before lookup
    const normalizedUrl = normalizeUrl(url);
    
    logger.debug('Processing link', { 
      traceId,
      original: url,
      normalized: normalizedUrl,
      storageKey: `${LINK_KEY_PREFIX}${normalizedUrl}`
    });
    
    // Add to our list of links to store after we're done with all checks
    linksToStore.push({
      url,
      normalizedUrl
    });
    
    // Check from storage
    const existingLink = await getLinkData(normalizedUrl, storage);
    
    return { url, normalizedUrl, existingLink };
  });
  
  // Wait for all link lookups to complete
  const linkResults = await Promise.all(linkLookupPromises);
  
  // Process the results
  for (const { url, normalizedUrl, existingLink } of linkResults) {
    // Skip if this link is on the allowlist
    const isAllowlisted = ALLOWLISTED_HOSTS.some(host => normalizedUrl.startsWith(host));
    if (isAllowlisted) {
      logger.debug('Skipping allowlisted host', { 
        traceId,
        url,
        normalizedUrl
      });
      continue;
    }
    
    if (existingLink) {
      logger.debug('Found existing link', {
        traceId,
        existingLink,
        currentChannel: message.channel,
        currentThread: message.thread_ts || message.ts,
        currentUser: message.user,
        messageTs: message.ts,
        existingMessageId: existingLink.messageId,
        timestamp: existingLink.timestamp,
        comparison: {
          sameChannel: existingLink.channelId === message.channel,
          sameUser: existingLink.userId === message.user,
          threadCheck: !message.thread_ts || message.thread_ts !== existingLink.messageId,
          messageIdComparison: `${message.thread_ts || message.ts} !== ${existingLink.messageId}`
        }
      });
      
      // IMPORTANT DEBUG: Check if the timestamp is recent
      // If the timestamp is within a few seconds of the current message, 
      // this is likely the same message we're currently processing
      const existingDate = new Date(existingLink.timestamp).getTime();
      const currentDate = new Date().getTime();
      const timeDiffMs = currentDate - existingDate;
      const isVeryRecent = timeDiffMs < 5000; // 5 seconds
      
      logger.debug('Timestamp analysis', {
        traceId,
        existingTimestamp: existingLink.timestamp,
        currentTimestamp: new Date().toISOString(),
        timeDiffMs,
        isVeryRecent
      });
      
      // Skip if this appears to be the same message we just processed
      if (isVeryRecent) {
        logger.debug('Skipping notification for very recent link (likely same message)', {
          traceId,
          timeDiffMs
        });
        continue;
      }
      
      // Only notify if:
      // 1. The link was shared in a different channel
      // 2. By a different user
      // 3. Not in the same thread
      if (
        existingLink.channelId !== message.channel ||
        existingLink.userId !== message.user
      ) {
        // Don't notify if this is a reply in the same thread as the original message
        if (!message.thread_ts || message.thread_ts !== existingLink.messageId) {
          const timeDiff = formatTimeDifference(
            new Date(existingLink.timestamp),
            new Date()
          );
          
          const response = `This link was previously shared by <@${existingLink.userId}> ${timeDiff} ago in <#${existingLink.channelId}>`;
          contextResponses.add(response);
          
          logger.debug('Added context response', {
            traceId,
            response,
            timeDiff
          });
        } else {
          logger.debug('Skipping notification for link in same thread', {
            traceId,
            threadTs: message.thread_ts,
            originalMessageId: existingLink.messageId
          });
        }
      } else {
        logger.debug('Skipping notification for link (same channel and user)', {
          traceId,
          channel: message.channel,
          user: message.user
        });
      }
    } else {
      logger.debug('No existing link found', {
        traceId,
        url,
        normalizedUrl
      });
    }
  }
  
  // Store all new links
  for (const { url, normalizedUrl } of linksToStore) {
    try {
      await storeLink(
        normalizedUrl,
        {
          url,
          channelId: message.channel,
          messageId: message.thread_ts || message.ts,
          userId: message.user,
          timestamp: new Date().toISOString()
        },
        storage
      );
      
      logger.debug('Stored link', {
        traceId,
        url,
        normalizedUrl,
        user: message.user,
        channel: message.channel
      });
    } catch (error) {
      logger.error(
        'Error storing link',
        error instanceof Error ? error : new Error(String(error)),
        {
          traceId,
          url,
          normalizedUrl
        }
      );
    }
  }
  
  return {
    linksFound: links,
    response: contextResponses.size > 0 ? Array.from(contextResponses).join('\n') : undefined
  };
}

/**
 * Process message deletion events
 * When a message is deleted, we need to check if it contained tracked links
 * and delete them from storage
 */
export async function processMessageDeletion(
  event: {
    ts: string;
    channel: string;
    previous_message?: {
      text: string;
      ts: string;
      user: string;
      thread_ts?: string;
    }
  }
): Promise<void> {
  const logger = getLogger();
  const storage = getStorage();

  // Generate a unique trace ID for this deletion processing
  const traceId = `del_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
  
  // If we don't have the previous message content, we can't do anything
  if (!event.previous_message) {
    logger.debug('Message deletion: No previous message content available', { 
      traceId,
      messageTs: event.ts
    });
    return;
  }
  
  // Extract links from the deleted message
  const links = extractLinks(event.previous_message.text);
  
  if (links.length === 0) {
    logger.debug('Message deletion: No links found in deleted message', { 
      traceId,
      messageTs: event.ts
    });
    return;
  }
  
  logger.debug('Message deletion: Found links in deleted message', { 
    traceId,
    linkCount: links.length,
    links: links,
    messageTs: event.ts
  });
  
  // Process each link
  for (const url of links) {
    try {
      const normalizedUrl = normalizeUrl(url);
      const linkData = await getLinkData(normalizedUrl, storage);
      
      // Only delete if this is the original message that shared the link
      if (linkData && linkData.messageId === event.ts) {
        // TODO: Implement link deletion
        // For now, we'll just log that we would delete it
        logger.info('Would delete link', {
          traceId,
          url,
          normalizedUrl,
          messageTs: event.ts
        });
      }
    } catch (error) {
      logger.error(
        'Error processing link deletion',
        error instanceof Error ? error : new Error(String(error)),
        {
          traceId,
          url,
          messageTs: event.ts
        }
      );
    }
  }
}

/**
 * Extract links from message text
 */
function extractLinks(text: string): string[] {
  const matches = text.match(SLACK_FORMATTED_URL_REGEX);
  return matches ? Array.from(new Set(matches)) : [];
}

/**
 * Format a time difference into a human-readable string
 */
function formatTimeDifference(from: Date, to: Date): string {
  const diffMs = to.getTime() - from.getTime();
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);
  
  if (diffDays > 0) {
    return `${diffDays} day${diffDays === 1 ? '' : 's'}`;
  }
  
  if (diffHours > 0) {
    return `${diffHours} hour${diffHours === 1 ? '' : 's'}`;
  }
  
  if (diffMinutes > 0) {
    return `${diffMinutes} minute${diffMinutes === 1 ? '' : 's'}`;
  }
  
  return `${diffSeconds} second${diffSeconds === 1 ? '' : 's'}`;
} 