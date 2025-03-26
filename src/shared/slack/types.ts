/**
 * Slack API Types
 * 
 * Common types for Slack API responses and data structures
 */

export interface SlackApiResponse {
  ok: boolean;
  error?: string;
}

export type SlackResponse<T = {}> = SlackApiResponse & T & {
  warning?: string;
  response_metadata?: {
    next_cursor: string;
    warnings?: string[];
  };
}

export interface SlackUser {
  id: string;
  is_admin: boolean;
  is_owner: boolean;
  name?: string;
  deleted?: boolean;
}

export interface SlackConversation {
  id: string;
  name: string;
  is_channel: boolean;
  is_group: boolean;
  is_im: boolean;
  is_private: boolean;
  members?: string[];
}

export interface SlackUserInfo {
  id: string;
  is_admin: boolean;
  is_owner: boolean;
}

export interface SlackUsersListResponse extends SlackApiResponse {
  members: SlackUser[];
  response_metadata: {
    next_cursor: string;
  };
}

export interface SlackConversationCreateResponse extends SlackApiResponse {
  channel?: {
    id: string;
    name: string;
  };
}

export interface SlackMessageResponse extends SlackApiResponse {
  channel: string;
  ts: string;
  message: {
    text: string;
    blocks?: any[];
  };
} 