# Camille Bot

A TypeScript rewrite of the Camille Slack bot, running on Cloudflare Workers.

## Features

- Karma (Points) System
- Link Tracking and Context
- Auto-Moderation and Greeting

## Development Setup

### Prerequisites

- Node.js (latest LTS version)
- npm 

### Installation

1. Clone the repository
2. Install dependencies:

```bash
npm install
```

### Configuration

Create `.dev.vars` file in the project root for local development:

```
SLACK_COMMUNITY_ID=your_community_id
SLACK_API_TOKEN=your_slack_token
API_HOST=your_api_host
```

For Cloudflare Workers KV, you'll need to set up a KV namespace. See [Cloudflare Workers documentation](https://developers.cloudflare.com/workers/runtime-apis/kv) for details.

### Running Locally

```bash
npm run dev
```

### Testing

```bash
npm test
```

### Deployment

Configure your Cloudflare account and project:

```bash
npx wrangler login
```

Then deploy:

```bash
npm run deploy
```

## Project Structure

- `/src` - Source code
  - `/karma` - Karma points system
  - `/link-tracking` - Link tracking features
  - `/auto-responder` - Auto-responder feature
  - `/auto-moderation` - Auto-moderation feature
  - `/greetings` - Greeting functionality
  - `/shared` - Shared utilities
    - `/config` - Configuration
    - `/logging` - Logging
    - `/slack` - Slack integration
    - `/storage` - Storage abstraction

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request. 