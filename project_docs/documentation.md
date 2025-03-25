# Camille Bot Documentation

## Introduction
Camille Bot is a Slack bot that helps with community management tasks such as monitoring karma, tracking links, providing help, and enhancing community interactions. Built on Cloudflare Workers with TypeScript, it provides a lightweight and efficient solution for Slack communities.

## Core Architecture

### Project Structure
```
camille-bot/
├── src/                  # Source code
│   ├── index.ts          # Main entry point
│   ├── karma/            # Karma tracking functionality
│   ├── link-tracking/    # Link tracking functionality
│   ├── help/             # Help command implementation
│   ├── autoresponders/   # Automatic response functionality
│   ├── shared/           # Shared utilities
│   │   ├── config/       # Configuration management
│   │   ├── logging/      # Logging infrastructure
│   │   ├── slack/        # Slack integration
│   │   └── storage/      # Data persistence
│   └── __tests__/        # Top-level tests
├── scripts/              # Development scripts
├── project_docs/         # Project documentation
├── tsconfig.json         # TypeScript configuration
├── wrangler.toml         # Cloudflare Workers configuration
└── wrangler.dev.toml     # Development configuration
```

### Technology Stack
- **Runtime**: Cloudflare Workers
- **Language**: TypeScript
- **Storage**: Cloudflare KV
- **Testing**: Jest
- **Development**: Wrangler & ngrok for local testing

## Key Features

### Karma System
The karma system allows community members to give or take points from each other:

- **Karma Modification**: 
  - `@username++` - Add 1 karma
  - `@username--` - Remove 1 karma
  - `@username += N` - Add N karma (max 10)
  - `@username -= N` - Remove N karma (max 10)
- **Karma Command**: `@camille karma @username` to check karma
- **Leaderboard**: `@camille leaderboard` to see top karma users
- **Response Format**: Uses personality-rich messages with randomized templates:
  - Positive messages for karma increases (e.g., "You rock @user! Now at 5 camillecoins.")
  - Negative messages for karma decreases (e.g., "Tssss @user. Dropped your karma to 3.")
  - Proper "camillecoin/camillecoins" pluralization
- **Hacking**: Users are prevented from giving themselves karma

### Link Tracking
Tracks shared links and provides context when links are reshared:

- Detects URLs in messages
- Normalizes URLs to ensure consistent storage (http/https, www prefixes, trailing slashes)
- Stores link sharing context (user, channel, message timestamp)
- Provides cross-channel link notifications
- Creates proper Slack permalinks to original messages
- Handles message deletions to clean up stale link references
- Thread-aware link tracking

### Autoresponders & Auto-moderation
Provides automatic responses and content moderation for common messages and patterns:

- **Greetings**: Responds with a friendly greeting and wave emoji when users say "hello"
- **Inclusive Language**:
  - Automatically detects non-inclusive language patterns like "hey guys"
  - Provides gentle suggestions for more inclusive alternatives
  - Promotes a welcoming community environment
- **Content Transformation**:
  - Automatically provides account-free versions of shared X/Twitter links
  - Improves content accessibility for all users
- **Real-time Monitoring**:
  - Monitors messages in real-time for moderation patterns
  - Provides immediate, constructive feedback
  - Maintains a positive community atmosphere

### Help System
Provides command guidance to users:

- **Command Format**: `@camille help` 
- Shows available commands and their usage
- Displays as an ephemeral message (visible only to the requesting user)
- Bot-specific command recognition
- Organized sections for:
  - Karma System commands
  - Autoresponder features
  - General help and tips

## Implementation Details

### Event Handling
The Slack event handler provides:
- Signature verification for security
- Challenge response handling for URL verification
- Structured event processing
- Message event routing to feature handlers
- Support for in-line, threaded, and ephemeral responses based on message type

### Storage Layer
Abstracts Cloudflare KV storage operations:
- Simple get/set/delete operations
- JSON serialization/deserialization
- Type safety with generics
- TTL-based expiration for links

### Logging System
Provides structured logging that works in both development and production:
- Level-based logging (DEBUG, INFO, WARN, ERROR)
- Context awareness
- Timestamps
- Error details with stack traces

### Configuration
Centralized access to environment variables and settings:
- Type-safe configuration
- Bot ID-aware command processing
- Environment variable mapping

### Slack Messaging
Provides a set of utilities for sending various types of messages to Slack:
- `sendSlackMessage`: Sends regular messages to channels/threads
- `sendSlackEphemeralMessage`: Sends ephemeral messages visible only to specific users
- `addSlackReaction`: Adds emoji reactions to messages
- Message formatting options for various content types
- Thread awareness and linking

## Environment Variables
The following environment variables are required:
- `API_HOST`: The host URL for the API
- `SLACK_API_TOKEN`: Slack API token
- `SLACK_BOT_ID`: The bot's Slack User ID (for command recognition)
- `SLACK_COMMUNITY_ID`: Slack workspace ID
- `SLACK_SIGNING_SECRET`: Slack signing secret for request verification

## Development & Testing

### Local Development
For local development and testing with real Slack events, we provide tools to set up a local environment:

```bash
# One-time setup of development KV namespace
npm run setup-dev-kv

# Start local development with ngrok
npm run dev-local
```

These scripts handle:
- Creating a development KV namespace
- Setting up ngrok to create a public URL for your local server
- Configuring the proper environment for local testing

See the [Local Testing Guide](./local_testing.md) for detailed instructions.

### Running Tests
Camille Bot includes a comprehensive test suite:

```bash
# Run all tests
npm test

# Run specific test suites
npm test -- --testPathPattern=link-tracking
npm test -- --testPathPattern=karma
```

### Deployment
Deploy to Cloudflare Workers:

```bash
npm run deploy
```

## Security Considerations
- Slack request signatures are verified to prevent spoofing
- Sensitive configuration is stored in environment variables
- Request timestamps are checked to prevent replay attacks
- Bot ID verification ensures commands are processed only when explicitly mentioned

## Future Enhancements
- Enhanced auto-moderation capabilities:
  - Additional language patterns and responses
  - Customizable moderation rules
  - Community feedback integration
- Expanded admin tooling:
  - Admin dashboard for community insights
  - Automated moderation reports
  - Custom admin commands
- Message threading and context awareness
- Community engagement metrics
- Advanced reporting and insights
