/**
 * Slack Error Classes
 *
 * Custom error types for Slack API operations
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
