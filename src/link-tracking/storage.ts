/**
 * Link Tracking Storage
 *
 * Handles persistence of link data with automatic expiration
 */

import { KVStore, KVStoreOptions } from '../shared/storage/kv-store';

// Prefix for link keys in storage
export const LINK_KEY_PREFIX = 'link:';

// Interface for link data
export interface LinkData {
  url: string;
  channelId: string;
  messageId: string;
  userId: string;
  timestamp: string; // ISO date string
  thread_ts?: string; // Parent thread timestamp if message is in a thread
}

// One week in seconds (for TTL)
const ONE_WEEK_IN_SECONDS = 7 * 24 * 60 * 60;

/**
 * Store a link with expiration
 * If preserveOriginal is true (default), it will not overwrite an existing entry
 */
export async function storeLink(
  url: string,
  data: LinkData,
  storage: KVStore,
  preserveOriginal: boolean = true
): Promise<void> {
  const normalizedUrl = normalizeUrl(url);
  const storageKey = `${LINK_KEY_PREFIX}${normalizedUrl}`;
  
  if (preserveOriginal) {
    // Check if an entry already exists
    const existingData = await storage.get<LinkData>(storageKey);
    if (existingData) {
      // Don't overwrite the original reference
      return;
    }
  }
  
  const options: KVStoreOptions = {
    expirationTtl: ONE_WEEK_IN_SECONDS
  };
  
  await storage.set(storageKey, data, options);
}

/**
 * Get link data
 */
export async function getLinkData(
  url: string,
  storage: KVStore
): Promise<LinkData | null> {
  return await storage.get<LinkData>(`${LINK_KEY_PREFIX}${normalizeUrl(url)}`);
}

/**
 * Normalize URL by removing tracking parameters and standardizing formats
 */
export function normalizeUrl(url: string): string {
  // First, clean any potential Slack formatting from URLs
  url = url.replace(/[<>]/g, '').trim();
  
  // Handle URLs with pipe format from Slack (e.g., http://example.com|example.com)
  if (url.includes('|')) {
    url = url.split('|')[0];
  }
  
  // Add protocol if not present for parsing purposes
  let parsableUrl = url;
  if (!parsableUrl.startsWith('http://') && !parsableUrl.startsWith('https://')) {
    parsableUrl = 'https://' + parsableUrl;
  }
  
  try {
    const parsedUrl = new URL(parsableUrl);
    
    // Always set protocol to https for consistent normalization
    parsedUrl.protocol = 'https:';
    
    // Remove tracking parameters
    const paramsToRemove = [
      'utm_source',
      'utm_medium',
      'utm_campaign',
      'utm_term',
      'utm_content',
      'utm_id',
      "s",
      "t"
    ];
    
    const params = parsedUrl.searchParams;
    paramsToRemove.forEach(param => {
      if (params.has(param)) {
        params.delete(param);
      }
    });
    
    // Normalize hostname (remove 'www.' prefix if present)
    let hostname = parsedUrl.hostname;
    if (hostname.startsWith('www.')) {
      hostname = hostname.substring(4);
    }
    
    // Normalize path
    let pathname = parsedUrl.pathname;
    
    // Handle trailing slashes - for bare domains, we want to remove them
    if (pathname === '/') {
      pathname = '';
    }
    
    // For storage key purposes, construct a URL without protocol
    const pathAndParams = pathname + (parsedUrl.search || '');
    const normalizedUrl = hostname + pathAndParams;
    
    return normalizedUrl;
  } catch (error) {
    // If URL parsing fails, try to clean it as best we can
    // Remove any trailing punctuation that might have been captured
    return url.replace(/[.,;:!?]$/, '');
  }
} 