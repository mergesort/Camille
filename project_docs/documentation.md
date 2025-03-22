# Camille Bot Documentation

## Project Overview

Camille Bot is a Slack integration built on Cloudflare Workers that provides community management and assistance features. The bot is designed with a modular architecture to allow for easy extension of features over time.

## Technical Architecture

### Infrastructure

- **Platform**: Cloudflare Workers
- **Language**: TypeScript
- **Data Storage**: Cloudflare KV
- **Deployment**: Wrangler CLI
- **Environment**: Node.js compatibility mode

### Directory Structure

```
camille-bot/
├── src/                    # Source code
│   ├── index.ts            # Main entry point
│   ├── shared/             # Shared utilities and core functionality
│   │   ├── config/         # Configuration management
│   │   ├── logging/        # Logging infrastructure
│   │   ├── slack/          # Slack integration
│   │   │   ├── events.ts   # Event handling
│   │   │   └── utils.ts    # Slack utilities
│   │   └── storage/        # Data persistence
│   └── features/           # Feature-specific modules (future)
├── dist/                   # Compiled JavaScript
├── project_docs/           # Project documentation
├── tsconfig.json           # TypeScript configuration
├── wrangler.toml           # Cloudflare Workers configuration
├── .dev.vars               # Local development variables (secret)
└── .dev.vars.example       # Example development variables
```

## Core Components

### Request Handler (index.ts)

The main entry point handles all HTTP requests, routing them to the appropriate handlers based on path and method. It provides:

- Path-based routing
- Method-specific handling
- Error capture and reporting
- Initialization of dependencies (config, logging, storage)

### Slack Event Handling (shared/slack/events.ts)

Processes incoming Slack events with:

- Signature verification for security
- Challenge response handling for URL verification
- Structured event processing
- Event persistence for debugging

### Storage Layer (shared/storage/kv-store.ts)

Abstracts Cloudflare KV storage operations:

- Simple get/set/delete operations
- JSON serialization/deserialization
- Type safety with generics
- Future extensibility

### Logging System (shared/logging/logger.ts)

Provides structured logging that works in both development and production:

- Level-based logging (DEBUG, INFO, WARN, ERROR)
- Context awareness
- Timestamps
- JSON formatting
- Error details with stack traces

### Configuration (shared/config/config.ts)

Centralizes access to environment variables and settings:

- Type-safe configuration
- Environment variable mapping
- Default values

### Slack Utilities (shared/slack/utils.ts)

Helper functions for Slack integration:

- Request signature verification
- Simple API client for sending messages

## Setup and Deployment

### Local Development

1. Clone the repository
2. Install dependencies:
   ```
   npm install
   ```
3. Create a `.dev.vars` file based on `.dev.vars.example`
4. Start the local development server:
   ```
   npm run dev
   ```

### Production Deployment

1. Build the project:
   ```
   npm run build
   ```
2. Deploy to Cloudflare Workers:
   ```
   npm run deploy
   ```

## Slack App Configuration

1. Create a Slack app at https://api.slack.com/apps
2. Set up Bot Token Scopes:
   - `chat:write`
   - Other scopes as needed for features
3. Enable Event Subscriptions
4. Set the Request URL to `https://your-worker-url.workers.dev/slack/events`
5. Subscribe to bot events:
   - `message.channels` (example - actual events depend on features)
6. Install the app to your workspace

## Environment Variables

The following environment variables are required:

- `SLACK_COMMUNITY_ID`: Slack workspace/community ID
- `SLACK_API_TOKEN`: Bot token for API calls
- `SLACK_SIGNING_SECRET`: Signing secret for request verification
- `API_HOST`: Host URL for the API

## Security Considerations

- Slack request signatures are verified to prevent spoofing
- Sensitive configuration is stored in environment variables
- Request timestamps are checked to prevent replay attacks

## Extending the Bot

To add new features:

1. Create a new module in the `src/features/` directory
2. Implement the feature logic
3. Update the event handler in `src/shared/slack/events.ts` to route events to your feature
4. Add any necessary API endpoints to `src/index.ts`

## Troubleshooting

- Use the `/debug` endpoint to inspect incoming requests
- Check Cloudflare Worker logs in the dashboard
- Review event logs stored in KV storage
