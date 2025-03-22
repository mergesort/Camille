/**
 * Logger
 *
 * A unified logging system that works both locally and in production.
 * - In development: Logs appear in the terminal
 * - In production: Logs appear in the Cloudflare dashboard
 * 
 * Uses structured JSON format for consistent parsing and filtering.
 */

export enum LogLevel {
  DEBUG = 'DEBUG',
  INFO = 'INFO',
  WARN = 'WARN',
  ERROR = 'ERROR',
}

export interface Logger {
  debug(message: string, meta?: Record<string, any>): void;
  info(message: string, meta?: Record<string, any>): void;
  warn(message: string, meta?: Record<string, any>): void;
  error(message: string, error?: Error, meta?: Record<string, any>): void;
}

export class CloudflareLogger implements Logger {
  private context: string;

  constructor(context: string) {
    this.context = context;
  }

  debug(message: string, meta?: Record<string, any>): void {
    this.log(LogLevel.DEBUG, message, undefined, meta);
  }

  info(message: string, meta?: Record<string, any>): void {
    this.log(LogLevel.INFO, message, undefined, meta);
  }

  warn(message: string, meta?: Record<string, any>): void {
    this.log(LogLevel.WARN, message, undefined, meta);
  }

  error(message: string, error?: Error, meta?: Record<string, any>): void {
    this.log(LogLevel.ERROR, message, error, meta);
  }

  private log(level: LogLevel, message: string, error?: Error, meta?: Record<string, any>): void {
    const logData: Record<string, any> = {
      level,
      context: this.context,
      message,
      timestamp: new Date().toISOString(),
      ...meta,
    };

    if (error) {
      logData.error = {
        message: error.message,
        stack: error.stack,
        name: error.name,
      };
    }

    // Use console.log for both local development and Cloudflare production
    // - In local dev: Logs appear in terminal
    // - In production: Logs appear in Cloudflare dashboard
    console.log(JSON.stringify(logData));
  }
} 