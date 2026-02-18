/**
 * Slack Messaging Functions
 * 
 * Utilities for sending messages and reactions to Slack
 */

/**
 * Send a message to a Slack channel
 */
export async function sendSlackMessage(options: {
  channel: string;
  text: string;
  thread_ts?: string;
  token: string;
  unfurl_links?: boolean;
}): Promise<void> {
  const { channel, text, thread_ts, token, unfurl_links = true } = options;
  
  const payload = {
    channel,
    text,
    ...(thread_ts ? { thread_ts } : {}),
    unfurl_links
  };
  
  const response = await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify(payload)
  });
  
  if (!response.ok) {
    const errorData = await response.text();
    throw new Error(`Failed to send Slack message: ${errorData}`);
  }
}

/**
 * Send an ephemeral message to a specific user in a Slack channel
 * This message will only be visible to the specified user
 */
export async function sendSlackEphemeralMessage(options: {
  channel: string;
  text: string;
  user: string;
  token: string;
  unfurl_links?: boolean;
}): Promise<void> {
  const { channel, text, user, token, unfurl_links = true } = options;
  
  const payload = {
    channel,
    text,
    user,
    unfurl_links
  };
  
  const response = await fetch('https://slack.com/api/chat.postEphemeral', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify(payload)
  });
  
  if (!response.ok) {
    const errorData = await response.text();
    throw new Error(`Failed to send Slack ephemeral message: ${errorData}`);
  }
}

/**
 * Add a reaction emoji to a message
 */
export async function addSlackReaction(options: {
  channel: string;
  timestamp: string;
  reaction: string;
  token: string;
}): Promise<void> {
  const { channel, timestamp, reaction, token } = options;

  const payload = {
    channel,
    timestamp,
    name: reaction
  };

  const response = await fetch('https://slack.com/api/reactions.add', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errorData = await response.text();
    throw new Error(`Failed to add reaction: ${errorData}`);
  }
}

/**
 * Unfurl attachment type for chat.unfurl API
 */
export interface UnfurlAttachment {
  title?: string;
  title_link?: string;
  author_name?: string;
  author_icon?: string;
  author_link?: string;
  text?: string;
  image_url?: string;
  thumb_url?: string;
  color?: string;
  footer?: string;
  footer_icon?: string;
  ts?: number;
}

/**
 * Send unfurls for links shared in a Slack message
 */
export async function sendSlackUnfurl(options: {
  channel: string;
  ts: string;
  unfurls: Record<string, UnfurlAttachment>;
  token: string;
}): Promise<void> {
  const { channel, ts, unfurls, token } = options;

  const payload = {
    channel,
    ts,
    unfurls
  };

  const response = await fetch('https://slack.com/api/chat.unfurl', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify(payload)
  });

  const data = await response.json() as { ok: boolean; error?: string };

  if (!data.ok) {
    throw new Error(`Failed to unfurl links: ${data.error || 'Unknown error'}`);
  }
} 