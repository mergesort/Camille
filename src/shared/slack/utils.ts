/**
 * Slack Utilities
 *
 * Common functions for interacting with Slack
 */

import { Config } from '../config/config';
import { Logger } from '../logging/logger';
import * as crypto from 'node:crypto';

export interface SlackApiClient {
  postMessage(params: SlackPostMessageParams): Promise<any>;
}

export interface SlackPostMessageParams {
  channel: string;
  text: string;
  blocks?: any[];
  thread_ts?: string;
}

/**
 * Create a simple client for calling Slack APIs
 */
export function createSlackClient(token: string): SlackApiClient {
  return {
    postMessage: async (params) => {
      const response = await fetch('https://slack.com/api/chat.postMessage', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(params)
      });
      
      return await response.json();
    }
  };
}

/**
 * Verifies that a request is coming from Slack
 * 
 * Implements Slack's request signing process:
 * https://api.slack.com/authentication/verifying-requests-from-slack
 */
export function verifySlackSignature(
  signature: string,
  timestamp: string,
  body: string,
  signingSecret: string
): boolean {
  // Check for required parameters
  if (!signature || !timestamp || !signingSecret) {
    return false;
  }

  // Check timestamp freshness (within 5 minutes)
  const currentTime = Math.floor(Date.now() / 1000);
  if (Math.abs(currentTime - parseInt(timestamp)) > 60 * 5) {
    return false; // Request is older than 5 minutes
  }

  // Create the signature base string
  const baseString = `v0:${timestamp}:${body}`;

  // Create the expected signature
  const hmac = crypto.createHmac('sha256', signingSecret);
  const computedSignature = `v0=${hmac.update(baseString).digest('hex')}`;

  // Compare signatures using a constant-time comparison to prevent timing attacks
  return crypto.timingSafeEqual(
    Buffer.from(computedSignature),
    Buffer.from(signature)
  );
} 