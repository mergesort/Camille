/**
 * Slack Messaging Functions
 *
 * Utilities for sending messages and reactions to Slack
 */

/**
 * Custom error class for missing Slack OAuth scopes
 */
export class MissingScopeError extends Error {
  constructor(
    public readonly neededScope: string,
    public readonly operation: string
  ) {
    super(
      `Missing OAuth scope: "${neededScope}" is required for ${operation}. ` +
      `Please add this scope in your Slack app settings (OAuth & Permissions) and reinstall the app.`
    );
    this.name = 'MissingScopeError';
  }
}

/**
 * Check if a Slack API error is a missing scope error and throw a helpful message
 */
function checkForMissingScopeError(
  data: { ok: boolean; error?: string; needed?: string },
  operation: string,
  fallbackScope: string
): void {
  if (!data.ok && data.error === 'missing_scope') {
    throw new MissingScopeError(data.needed || fallbackScope, operation);
  }
}

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
 * Find a channel by name
 */
export async function findChannelByName(options: {
  channelName: string;
  token: string;
}): Promise<string | null> {
  const { channelName, token } = options;

  // Remove # prefix if present
  const normalizedName = channelName.replace(/^#/, '');

  const response = await fetch('https://slack.com/api/conversations.list?types=public_channel,private_channel&limit=1000', {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  });

  const data = await response.json() as {
    ok: boolean;
    channels?: Array<{ id: string; name: string; [key: string]: any }>;
    error?: string;
    needed?: string;
  };

  // Check for missing scope error first
  checkForMissingScopeError(data, 'listing channels', 'channels:read');

  if (!data.ok || !data.channels) {
    throw new Error(`Failed to list channels: ${data.error || 'Unknown error'}`);
  }

  // Find the channel by name
  const channel = data.channels.find(ch => ch.name === normalizedName);

  return channel ? channel.id : null;
}

/**
 * Get a Slack channel's information including topic
 */
export async function getSlackChannelInfo(options: {
  channel: string;
  token: string;
}): Promise<{ topic: string }> {
  const { channel, token } = options;

  const response = await fetch(`https://slack.com/api/conversations.info?channel=${channel}`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  });

  const data = await response.json() as {
    ok: boolean;
    channel?: { topic: { value: string } };
    error?: string;
    needed?: string;
  };

  // Check for missing scope error first
  checkForMissingScopeError(data, 'getting channel info', 'channels:read');

  if (!data.ok || !data.channel) {
    throw new Error(`Failed to get channel info: ${data.error || 'Unknown error'}`);
  }

  return {
    topic: data.channel.topic.value
  };
}

/**
 * Update a Slack channel's topic
 */
export async function updateSlackChannelTopic(options: {
  channel: string;
  topic: string;
  token: string;
}): Promise<void> {
  const { channel, topic, token } = options;

  const payload = {
    channel,
    topic
  };

  const response = await fetch('https://slack.com/api/conversations.setTopic', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify(payload)
  });

  const data = await response.json() as { ok: boolean; error?: string; needed?: string };

  // Check for missing scope error first
  checkForMissingScopeError(data, 'updating channel topic', 'channels:write.topic');

  if (!data.ok) {
    throw new Error(`Failed to update channel topic: ${data.error || 'Unknown error'}`);
  }
}