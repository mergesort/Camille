/**
 * X/Twitter to xcancel.com Transformer Implementation
 *
 * Detects x.com and twitter.com links and transforms them to xcancel.com
 */

import { Logger } from '../shared/logging/logger';
import { X_TWITTER_URL_REGEX } from '../shared/regex/patterns';
import { getLogger } from '../shared/context/app-context';

/**
 * Result from processing a message for X/Twitter links
 */
export interface XTransformerResult {
  // Whether the message contains X/Twitter links
  hasXLinks: boolean;
  
  // The transformed links (if any)
  transformedLinks: string[];
  
  // Original links
  originalLinks: string[];
}

/**
 * Process a message to detect X/Twitter links and transform them to xcancel.com
 */
export async function processXLinks(
  messageText: string
): Promise<XTransformerResult> {
  const logger = getLogger();

  try {
    logger.debug('Processing message for X/Twitter links', { 
      textPreview: messageText.substring(0, 50)
    });
    
    // Default result
    const result: XTransformerResult = {
      hasXLinks: false,
      transformedLinks: [],
      originalLinks: []
    };
    
    try {
      // Use matchAll for more consistent results
      const matches = [...messageText.matchAll(new RegExp(X_TWITTER_URL_REGEX))].map(m => m[0]);
      
      if (matches.length === 0) {
        return result;
      }
      
      // Process each match
      const allTransformedLinks: string[] = [];
      
      for (const match of matches) {
        result.originalLinks.push(match);
        
        // Transform to xcancel.com
        const transformed = transformXToXcancel(match);
        allTransformedLinks.push(transformed);
      }
      
      // Deduplicate the transformed links using our shared function
      result.transformedLinks = deduplicateUrls(allTransformedLinks);
      
      if (result.transformedLinks.length > 0) {
        result.hasXLinks = true;
        logger.info('Transformed X/Twitter links', { 
          count: result.transformedLinks.length,
          originalLinks: result.originalLinks,
          transformedLinks: result.transformedLinks
        });
      }
    } catch (regexError) {
      logger.error(
        'Error processing message for X/Twitter links with regex', 
        regexError instanceof Error ? regexError : new Error(String(regexError))
      );
    }
    
    return result;
  } catch (error) {
    logger.error(
      'Error processing message for X/Twitter links', 
      error instanceof Error ? error : new Error(String(error))
    );
    
    // Return default result on error
    return {
      hasXLinks: false,
      transformedLinks: [],
      originalLinks: []
    };
  }
}

/**
 * Deduplicate an array of URLs
 * Exposed for testing
 */
export function deduplicateUrls(urls: string[]): string[] {
  return [...new Set(urls)];
}

/**
 * Transform an X/Twitter URL to xcancel.com
 */
export function transformXToXcancel(url: string): string {
  // Clean Slack formatting if present
  let cleanUrl = url.replace(/[<>]/g, '').trim();
  
  // Handle URLs with pipe format from Slack (e.g., http://example.com|example.com)
  if (cleanUrl.includes('|')) {
    cleanUrl = cleanUrl.split('|')[0];
  }
  
  try {
    // Add protocol if not present for parsing purposes
    let parsableUrl = cleanUrl;
    if (!parsableUrl.startsWith('http://') && !parsableUrl.startsWith('https://')) {
      parsableUrl = 'https://' + parsableUrl;
    }
    
    const parsedUrl = new URL(parsableUrl);
    
    // Check if it's just the domain (with or without trailing slash)
    if ((parsedUrl.pathname === '/' || parsedUrl.pathname === '') && !parsedUrl.search && !parsedUrl.hash) {
      // Check if original URL had a trailing slash
      if (cleanUrl.endsWith('/')) {
        return 'https://xcancel.com/';
      }
      // Return without trailing slash
      return 'https://xcancel.com';
    }
    
    // Replace domain with xcancel.com and preserve path, search and hash
    return 'https://xcancel.com' + parsedUrl.pathname + parsedUrl.search + parsedUrl.hash;
  } catch (error) {
    // Fallback if URL parsing fails
    // Replace domain directly
    return cleanUrl.replace(/(?:https?:\/\/)?(?:www\.)?(?:twitter\.com|x\.com)/i, 'https://xcancel.com');
  }
} 