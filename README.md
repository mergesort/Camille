# Camille 🦎

Camille is an extensible Slack bot designed to enhance community management and interaction in your Slack workspace. Built on Cloudflare Workers with TypeScript, it provides a lightweight and efficient solution for managing karma, tracking shared links, and fostering inclusive communication.

## Features

### 🌟 Karma System
- Give or take karma points from users with simple commands
- Track user karma scores across channels
- View karma leaderboards
- Anti-gaming measures to prevent self-karma

### 🔗 Link Tracking
- Track shared links across channels
- Provide context when links are reshared
- Cross-channel link notifications
- Thread-aware link tracking

### 🤝 Community Management
- Automatic responses to common phrases
- Content transformation (e.g., X/Twitter links to reader-friendly versions)
- Real-time message monitoring

### ⏰ Lost Hours Tracking
- Track cumulative hours lost to bugs and debugging
- Simple syntax: mention #lost-hours with +N or -N
- Automatically updates channel topic and description
- Works from any channel in the workspace

### 💡 Help System
- Easy-to-use help commands
- Comprehensive command documentation
- Organized by feature category

## Getting Started

### Prerequisites
- Node.js (latest LTS version)
- npm
- A Slack workspace where you can create apps

### Installation

1. Clone the repository:
```bash
git clone https://github.com/mergesort/Camille.git
cd Camille/camille-bot
```

2. Install dependencies:
```bash
npm install
```

3. Create your configuration files:
```bash
cp .dev.vars.example .dev.vars
cp wrangler.toml.example.toml wrangler.dev.toml
```

4. Edit required configuration values:

- `API_HOST`: The host URL for the API
- `SLACK_API_TOKEN`: Slack Bot User OAuth Token
- `SLACK_BOT_ID`: The bot's Slack User ID
- `SLACK_COMMUNITY_ID`: Your Slack workspace ID
- `SLACK_SIGNING_SECRET`: Slack signing secret for request verification

5. Set up your development environment:
```bash
npm run setup-dev-kv
```

6. Start the development server:

```bash
npm run dev-local
```

For more detailed instructions, see: [Local Testing](/project_docs/local_testing.md)

## Documentation

Detailed documentation is available in the `project_docs` directory:
- [Running Documentation](./project_docs/documentation.md)
- [Local Testing Guide](./project_docs/local_testing.md)
- [Cloudflare Deployment Guide](./project_docs/cloudflare_deployment.md)

## Development

### Running Tests
```bash
# Run all tests
npm test

# Run specific test suites
npm test -- --testPathPattern=link-tracking
npm test -- --testPathPattern=karma
```

### Local Development
For local development with real Slack events:
```bash
npm run dev-local
```

### Deployment
Deploy to Cloudflare Workers:
```bash
npm run deploy
```

## Contributing

Contributions are welcome! Please feel free to submit a pull request.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Credits

This rewrite of Camille was inspired by the original [Camille](https://github.com/bugkrusha/Camille), primarily maintained by the gracious and wonderful combo of [Ian Keen](https://github.com/IanKeen) and [Jazbo Beason](https://github.com/bugkrusha). Special thanks to them all of the hard work over the years, and foundation that made this project possible.

## Support

If you encounter any issues or have questions, please file an issue on the project's issue tracker. 