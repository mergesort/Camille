/**
 * Configuration
 *
 * Centralizes access to environment variables and config settings
 */

export interface Config {
  slackCommunityId: string;
  slackApiToken?: string;
  slackSigningSecret?: string;
  apiHost: string;
  alertUserId?: string;
}

export interface Env {
  SLACK_COMMUNITY_ID: string;
  SLACK_API_TOKEN?: string;
  SLACK_SIGNING_SECRET?: string;
  API_HOST: string;
  ALERT_USER_ID?: string;
  CAMILLE_KV: KVNamespace;
}

export function getConfig(env: Env): Config {
  return {
    slackCommunityId: env.SLACK_COMMUNITY_ID,
    slackApiToken: env.SLACK_API_TOKEN,
    slackSigningSecret: env.SLACK_SIGNING_SECRET,
    apiHost: env.API_HOST,
    alertUserId: env.ALERT_USER_ID,
  };
} 