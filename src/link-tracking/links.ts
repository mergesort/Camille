/**
 * Link Tracking
 *
 * Handles detection, storage, and contextual responses for shared links in messages
 */

import { Logger } from '../shared/logging/logger';
import { KVStore } from '../shared/storage/kv-store';
import { storeLink, getLinkData, LinkData, normalizeUrl, LINK_KEY_PREFIX } from './storage';
import { SLACK_FORMATTED_URL_REGEX } from '../shared/regex/patterns';

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
  },
  storage: KVStore,
  logger: Logger
): Promise<LinkProcessingResult> {
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
      
      // Create a permalink reference
      // Slack message permalinks follow the format:
      // https://slack.com/archives/{channelId}/p{messageId without the dot}
      // For threaded messages, add the thread_ts as a query parameter
      let linkReference = '';
      if (existingLink.channelId && existingLink.messageId) {
        // Convert the messageId by removing the dot (Slack format)
        const formattedMessageId = existingLink.messageId.replace('.', '');
        
        // Create a proper Slack permalink
        let permalink = `https://slack.com/archives/${existingLink.channelId}/p${formattedMessageId}`;
        
        // If this was in a thread, add the thread parameters
        if (existingLink.thread_ts) {
          permalink += `?thread_ts=${existingLink.thread_ts}&cid=${existingLink.channelId}`;
          
          logger.debug('Added thread parameters to permalink', {
            traceId,
            threadTs: existingLink.thread_ts,
            channelId: existingLink.channelId
          });
        }
        
        // Use Slack's link format: <URL|text>
        linkReference = ` <${permalink}|this message>`;
        
        logger.debug('Created permalink', {
          traceId,
          channelId: existingLink.channelId,
          messageId: existingLink.messageId,
          threadTs: existingLink.thread_ts,
          formattedMessageId,
          permalink,
          isThreaded: !!existingLink.thread_ts
        });
      }
      
      // Create context-specific messages based on where the link was shared
      if (existingLink.channelId !== message.channel) {
        // Cross-channel reshare
        const contextMessage = `:camille-hi-there: That link is also being discussed in${linkReference} in <#${existingLink.channelId}>`;
        contextResponses.add(contextMessage);
      } else if (message.thread_ts && existingLink.thread_ts === message.thread_ts) {
        // Same thread reshare - matches when both have the same parent thread
        const contextMessage = `:camille-hi-there: That link was previously shared in this thread by <@${existingLink.userId}>`;
        contextResponses.add(contextMessage);
      } else {
        // Different thread or top-level message in same channel
        const contextMessage = `:camille-hi-there: That link is also being discussed in${linkReference} in this channel`;
        contextResponses.add(contextMessage);
      }
    } else {
      logger.debug('No existing link found', { traceId, url, normalizedUrl });
    }
  }
  
  // Prepare promises for storing all links in parallel
  const storeLinkPromises = linksToStore.map(({ url, normalizedUrl }) => {
    const linkData = {
      url,
      channelId: message.channel,
      messageId: message.ts,
      userId: message.user,
      timestamp: new Date().toISOString(),
      thread_ts: message.thread_ts // Store the thread_ts if this message is in a thread
    };
    
    // Return the promise to store in KV
    return storeLink(normalizedUrl, linkData, storage);
  });
  
  // Store all links in parallel
  await Promise.all(storeLinkPromises);
  
  // Prepare response if any context was found
  const response = contextResponses.size > 0 
    ? Array.from(contextResponses).join('\n')
    : undefined;
  
  logger.debug('Link processing complete', {
    traceId,
    foundLinks: links.length,
    contextResponses: contextResponses.size,
    hasResponse: !!response
  });
  
  return {
    linksFound: links,
    response
  };
}

/**
 * Extract links from message text
 */
function extractLinks(text: string): string[] {
  // First, identify code blocks and create a version of the text with URLs in code blocks removed
  // This will preserve the original text structure for regex matching, but prevent URLs in code blocks from being extracted
  
  // Handle multi-line code blocks (```code```)
  let processedText = text;
  const multiLineCodeBlockRegex = /```[\s\S]*?```/g;
  const multiLineCodeBlocks = processedText.match(multiLineCodeBlockRegex) || [];
  
  multiLineCodeBlocks.forEach(block => {
    // Replace the content of the code block with spaces to maintain string length and positions
    processedText = processedText.replace(block, ' '.repeat(block.length));
  });
  
  // Handle inline code blocks (`code`)
  const inlineCodeBlockRegex = /`[^`]*?`/g;
  const inlineCodeBlocks = processedText.match(inlineCodeBlockRegex) || [];
  
  inlineCodeBlocks.forEach(block => {
    // Replace the content of the code block with spaces to maintain string length and positions
    processedText = processedText.replace(block, ' '.repeat(block.length));
  });
  
  // Extract Slack-formatted URLs
  // Slack formats URLs as <URL> or <URL|display text>
  const slackLinks: string[] = [];
  
  let match;
  while ((match = SLACK_FORMATTED_URL_REGEX.exec(processedText)) !== null) {
    // match[1] contains the URL part of the Slack link format
    if (match[1] && !match[1].startsWith("@") && !match[1].startsWith("#")) {
      // Skip user mentions (<@U12345>) and channel mentions (<#C12345>)
      slackLinks.push(match[1]);
    }
  }
  
  // Return unique links
  return Array.from(new Set(slackLinks));
}

/**
 * Format ISO date string to a readable format
 */
function formatDate(isoString: string): string {
  try {
    const date = new Date(isoString);
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short', 
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch (error) {
    return isoString;
  }
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
  },
  storage: KVStore,
  logger: Logger
): Promise<void> {
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
  
  // Prepare promises for all link lookups to run in parallel
  const linkLookupPromises = links.map(async (url) => {
    // Normalize the URL before lookup
    const normalizedUrl = normalizeUrl(url);
    const storageKey = `${LINK_KEY_PREFIX}${normalizedUrl}`;
    
    // Check if this link is in storage
    const existingLink = await getLinkData(normalizedUrl, storage);
    
    // If the link exists and was created by this message, delete it
    if (existingLink && 
        existingLink.messageId === event.previous_message!.ts && 
        existingLink.channelId === event.channel) {
      
      logger.debug('Message deletion: Deleting link reference', { 
        traceId,
        url,
        normalizedUrl,
        messageTs: event.ts,
        storageKey
      });
      
      await storage.delete(storageKey);
      return true;
    }
    
    logger.debug('Message deletion: Link reference not found or from different message', { 
      traceId,
      url,
      normalizedUrl,
      messageTs: event.ts,
      foundLink: !!existingLink,
      matchesMessage: existingLink ? existingLink.messageId === event.previous_message!.ts : false,
      matchesChannel: existingLink ? existingLink.channelId === event.channel : false
    });
    
    return false;
  });
  
  // Wait for all operations to complete
  const deletionResults = await Promise.all(linkLookupPromises);
  
  // Count how many links were deleted
  const deletedCount = deletionResults.filter(Boolean).length;
  
  logger.debug('Message deletion: Processing complete', {
    traceId,
    deletedCount,
    totalLinksFound: links.length
  });
} 