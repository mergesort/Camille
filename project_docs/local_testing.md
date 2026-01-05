# Local Testing Guide for Camille Bot

This guide will walk you through setting up and testing the Camille Bot locally.

## Prerequisites

- Node.js (latest LTS version)
- npm
- [ngrok](https://ngrok.com/) installed (for exposing local server to Slack)
- A Slack workspace where you have permission to create apps

## Step 1: Set Up a Slack App

1. Go to [https://api.slack.com/apps](https://api.slack.com/apps) and click "Create New App"
2. Choose "From scratch" 
3. Give your app a name (e.g., "Camille Bot Dev") and select your development workspace
4. Click "Create App"

### Configure App Permissions

1. In the sidebar, navigate to "OAuth & Permissions"
2. Scroll down to "Scopes" and add the following Bot Token Scopes:
   - `channels:history` - View messages in public channels
   - `channels:read` - View basic channel info and list channels (required for lost-hours feature)
   - `channels:write.topic` - Set the topic of public channels (required for lost-hours feature)
   - `chat:write` - Send messages as the app
   - `chat:write.customize` - Send messages with a customized username and avatar
   - `chat:write.public` - Send messages to channels the bot isn't a member of
   - `groups:history` - View messages in private channels
   - `groups:read` - View basic information about private channels
   - `groups:write` - Manage private channels and create new ones
   - `im:history` - View messages in direct messages
   - `mpim:history` - View messages in group direct messages
   - `reactions:read` - View emoji reactions
   - `reactions:write` - Add and edit emoji reactions
   - `users:read` - View people in the workspace

## Step 2: Configure Local Environment

1. Create a `.dev.vars` file in the project root (using the `.dev.vars.example` as a template):

```
API_HOST="your-ngrok-url-will-be-set-automatically"
LOST_HOURS_CHANNEL_ID="C12345678"  # Optional: Channel ID for lost-hours tracking feature
SLACK_API_TOKEN="xoxb-your-bot-token"
SLACK_COMMUNITY_ID="your-slack-workspace-id"
SLACK_SIGNING_SECRET="your-signing-secret"
```

### Getting Your Slack Community ID

The Slack Community ID (also called Workspace ID) is a unique identifier for your Slack workspace:

1. Open Slack in a web browser (not the desktop app)
2. Look at the URL in your browser - it will be in this format:
   `https://app.slack.com/client/T01234ABCD/...`
3. The part that starts with `T` followed by alphanumeric characters (e.g., `T01234ABCD`) is your Slack Community ID
4. Alternatively, you can also find your workspace ID:
   - Go to your Slack administration page: `https://[your-workspace].slack.com/admin`
   - Scroll down to find the Workspace ID listed in the "About this workspace" section

### Getting Your Slack API Token

The Slack API Token (Bot User OAuth Token) is used for authenticating API requests:

1. Go to your Slack App page at [https://api.slack.com/apps](https://api.slack.com/apps)
2. Select your app
3. In the sidebar, click on "OAuth & Permissions"
4. Look for the "Bot User OAuth Token" section - this token starts with `xoxb-`
5. Copy this token and paste it into your `.dev.vars` file as the `SLACK_API_TOKEN` value
   - Note: If you haven't installed the app to your workspace yet, you'll need to do that first by clicking "Install to Workspace" at the top of the OAuth & Permissions page

### Slack Signing Secret

The Signing Secret is used to verify that requests are coming from Slack:

1. Go to your Slack App page
2. In the sidebar, click on "Basic Information"
3. Scroll down to the "App Credentials" section
4. Look for "Signing Secret" and click "Show" to reveal it
5. Copy this secret and paste it into your `.dev.vars` file as the `SLACK_SIGNING_SECRET` value

## Step 3: Set Up Development Configuration

We provide a simplified approach for local development that handles the KV namespace creation and ngrok setup automatically.

### Automated Setup (Recommended)

We've added script commands to streamline the local development process:

To start local development with ngrok:
   ```bash
   npm run dev-local
   ```
   This script:
   - Starts ngrok to create a tunnel to your local server
   - Automatically updates the development configuration with the ngrok URL
   - Starts the local development server using Wrangler
   - The script will output the ngrok URL that you'll need to configure Slack

### Manual Setup (Alternative)

If you prefer a manual approach:

1. First, create a development KV namespace:
   ```bash
   npx wrangler kv:namespace create "camille_dev_kv" --preview
   ```
   Note the ID and preview_id values from the output.

2. Update `wrangler.dev.toml` with these values:
   ```toml
   name = "camille-bot-dev"
   main = "src/index.ts"
   compatibility_date = "2024-09-23"
   compatibility_flags = ["nodejs_compat"]

   [vars]
   SLACK_COMMUNITY_ID = "your-slack-workspace-id"
   API_HOST = "your-ngrok-url"

   [[kv_namespaces]]
   binding = "kv"
   id = "your-kv-namespace-id"
   preview_id = "your-preview-id"
   ```

3. Start ngrok in a separate terminal:
   ```bash
   ngrok http 8787
   ```

4. Copy the ngrok URL (e.g., `https://a1b2c3d4.ngrok.io`)

5. Update the `API_HOST` in your `wrangler.dev.toml` file

6. Start the local server:
   ```bash
   npm run start-local
   ```

## Step 4: Enable Event Subscriptions

Now that you have a running server and public URL, you can configure Slack event subscriptions:

1. In the Slack app settings sidebar, click on "Event Subscriptions"
2. Toggle "Enable Events" to On
3. For the Request URL, enter your ngrok URL followed by `/slack/events` 
   (e.g., `https://a1b2c3d4.ngrok.io/slack/events`)
4. Slack will verify the URL by sending a challenge request to your server
   - If verification succeeds, you'll see a green checkmark
   - If it fails, make sure your local server is running and the URL is correct
   - Check your server logs for any errors during verification
5. Once verified, under "Subscribe to bot events", add the following events:
   - `message.channels` - When a message is posted to a channel
   - `message.groups` - When a message is posted to a private channel
   - `message.im` - When a message is posted in a direct message
   - `reaction_added` - When a reaction is added to a message
   - `reaction_removed` - When a reaction is removed from a message
6. Click "Save Changes" at the bottom of the page

## Step 5: Install App to Workspace

1. In the sidebar, click on "Install App"
2. Click "Install to Workspace"
3. Review the permissions and click "Allow"
4. After installation, note your "Bot User OAuth Token" - you'll need this for configuration
5. Update your `.dev.vars` file with this token:
   ```
   SLACK_API_TOKEN=xoxb-your-bot-token
   ```
6. Restart your local development server to pick up the new token

## Step 6: Test the Bot

1. Go to a channel in your Slack workspace where the bot is installed
2. Send a test message to verify the bot is receiving events
3. When you send a message, you should see event logs in your local server console

### Testing Feature Modules

As you implement each feature module, you can test them individually:

1. **Karma System**: Send messages with `++`, `--`, `+= N`, or `-= N` operators
2. **Link Tracking**: Share URLs in channels and verify they're being tracked
3. **Auto-Responder/Moderation**: Trigger phrases like "hey guys" to test responses

## Troubleshooting

- **Events not being received**: 
  - Check that your ngrok URL is correct and that the Slack app has the necessary event subscriptions
  - Each time you restart ngrok, you'll get a new URL and need to update the Request URL in Slack
  - Our `dev-local` script handles this automatically, but you'll still need to update your Slack app configuration

- **Authentication errors**: Verify your Bot Token and Signing Secret

- **Local server errors**: Check the console output for specific error messages

- **Slack URL verification fails**: 
  - Make sure your server is properly handling the challenge request
  - Check your logs to see if the request is reaching your server
  - Try restarting your development server and ngrok
  - If using the default implementation, ensure the handleSlackEvent function is being called

## Next Steps

Once you've verified local functionality, you can proceed to production deployment as outlined in the `cloudflare_deployment.md` guide. 

## Running Tests

Camille Bot includes a comprehensive test suite to ensure proper functionality. Tests are built using Jest and can be run using npm commands.

### Running All Tests

To run all tests:

```bash
npm test
```

This will execute all test suites defined in the project.

### Running Specific Test Suites

To run tests for specific modules (for faster development feedback), use the `--testPathPattern` flag:

```bash
# Run only link tracking tests
npm test -- --testPathPattern=link-tracking

# Run only karma tests
npm test -- --testPathPattern=karma

# Run only help system tests
npm test -- --testPathPattern=help
```

### Test File Organization

Test files are organized in `__tests__` directories within each feature module:

- `src/link-tracking/__tests__/` - Tests for link tracking functionality
- `src/karma/__tests__/` - Tests for karma system
- `src/help/__tests__/` - Tests for help commands

### Best Practices

1. Run the specific test suite for the feature you're working on during development
2. Run the complete test suite before deploying to production
3. Add new tests when implementing new features or fixing bugs
4. Ensure all tests pass before submitting changes

### Debugging Tests

For detailed test output, add the `--verbose` flag:

```bash
npm test -- --verbose
```

To watch files for changes and automatically re-run tests:

```bash
npm test -- --watch
``` 