/**
 * Configuration
 *
 * Centralizes access to environment variables and config settings
 */

export interface Config {
  apiHost: string;
  lostHoursChannelId?: string;
  slackApiToken?: string;
  slackBotId?: string;
  slackCommunityId: string;
  slackSigningSecret?: string;
}

export interface Env {
  API_HOST: string;
  kv: KVNamespace;
  LOST_HOURS_CHANNEL_ID?: string;
  SLACK_API_TOKEN?: string;
  SLACK_BOT_ID?: string;
  SLACK_COMMUNITY_ID: string;
  SLACK_SIGNING_SECRET?: string;
}

export function getConfig(env: Env): Config {
  return {
    apiHost: env.API_HOST,
    lostHoursChannelId: env.LOST_HOURS_CHANNEL_ID,
    slackApiToken: env.SLACK_API_TOKEN,
    slackBotId: env.SLACK_BOT_ID,
    slackCommunityId: env.SLACK_COMMUNITY_ID,
    slackSigningSecret: env.SLACK_SIGNING_SECRET,
  };
} 