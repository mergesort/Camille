# Cloudflare Deployment Guide for Camille Bot

This guide will walk you through deploying the Camille Bot to Cloudflare Workers.

## Prerequisites

- A Cloudflare account
- The Wrangler CLI installed and configured
- A fully tested local version of the Camille Bot
- A Slack app configured as described in the local testing guide

## Step 1: Set Up Cloudflare Workers

### Create a Cloudflare Account

1. If you don't have one already, sign up for a Cloudflare account at [cloudflare.com](https://www.cloudflare.com)
2. Once logged in, navigate to the "Workers & Pages" section

### Configure Wrangler for Deployment

1. Make sure Wrangler is installed globally:
   ```bash
   npm install -g wrangler
   ```

2. Log in to your Cloudflare account with Wrangler:
   ```bash
   wrangler login
   ```
   This will open a browser window to authenticate with Cloudflare.

## Step 2: Create KV Namespace

1. Create a KV namespace for the Camille Bot:
   ```bash
   wrangler kv:namespace create "kv"
   ```

2. This will output configuration that looks like:
   ```
   Add the following to your wrangler.toml:
   [[kv_namespaces]]
   binding = "kv"
   id = "612eb6b40758414cb48e9cc7a97339ed"
   ```

3. Create a preview namespace for local development:
   ```bash
   wrangler kv:namespace create "kv" --preview
   ```

4. Update your `wrangler.toml` with both namespaces:
   ```toml
   name = "camille-bot"
   main = "src/index.ts"
   compatibility_date = "2024-01-01"

   [vars]
   SLACK_COMMUNITY_ID = ""
   API_HOST = ""

   [[kv_namespaces]]
   binding = "kv"
   id = "612eb6b40758414cb48e9cc7a97339ed"
   preview_id = "yyyyyyyyyyyyyyyyyyyyyyyyyyyy" # Your preview namespace ID
   ```

## Step 3: Configure Environment Variables

Cloudflare Workers uses environment variables for configuration, which you'll need to set up:

1. Set the required variables using Wrangler:
   ```bash
   wrangler secret put SLACK_API_TOKEN
   ```
   When prompted, enter your Slack Bot User OAuth Token.

   ```bash
   wrangler secret put SLACK_SIGNING_SECRET
   ```
   When prompted, enter your Slack Signing Secret.

2. Alternatively, you can add non-secret environment variables to `wrangler.toml`:
   ```toml
   [vars]
   SLACK_COMMUNITY_ID = "T01234ABCD" # Your workspace ID
   API_HOST = "https://camille-bot.your-subdomain.workers.dev"
   ```

## Step 4: Configure Bot ID (Required for Proper Command Handling)

To ensure the bot only responds to commands directed specifically at it, you need to configure the `SLACK_BOT_ID` environment variable:

1. Obtain your bot's Slack User ID:
   - Open your Slack workspace in a browser
   - Right-click on your bot in the members list or a message from your bot
   - Select "Copy Link" or "Copy Member ID" (depending on Slack interface)
   - The ID is the part that starts with "U" or "B" (e.g., "U01234ABCD")
   
   Alternatively, you can use the Slack API tester:
   - Go to https://api.slack.com/methods/auth.test/test
   - Use your bot token to test the API
   - Look for the "user_id" field in the response

2. Add the ID to your `wrangler.toml` file:
   ```toml
   [vars]
   SLACK_COMMUNITY_ID = "T01234ABCD"
   SLACK_BOT_ID = "U01234ABCD" # Your bot's user ID
   API_HOST = "https://camille-bot.your-subdomain.workers.dev"
   ```

3. Or set it as a secret (if preferred):
   ```bash
   wrangler secret put SLACK_BOT_ID
   ```

### Important Notes About Bot ID

- **Without this configuration**: The bot will respond to commands directed at ANY user that match the command format, not just when the bot is specifically mentioned.
- **With this configuration**: The bot will only respond when directly mentioned with its Slack User ID (e.g., "@Camille help").
- **Updating the Bot ID**: If you rename or recreate your Slack app, you may need to update this ID. Simply follow the steps above to get the new ID and update your configuration.

## Step 5: Build and Deploy

1. Build your TypeScript project:
   ```bash
   npm run build
   ```

2. Deploy to Cloudflare Workers:
   ```bash
   npm run deploy
   ```
   or
   ```bash
   wrangler deploy
   ```

3. Wrangler will output the URL where your worker is deployed, for example:
   ```
   https://camille-bot.your-subdomain.workers.dev
   ```

## Step 6: Update Slack App Configuration

1. Go to your Slack App's configuration page
2. Navigate to "Event Subscriptions"
3. Update the Request URL to your Cloudflare Worker URL plus the endpoint path:
   ```
   https://camille-bot.your-subdomain.workers.dev/slack/events
   ```
4. Slack will verify the URL to ensure it responds correctly

## Step 7: Verify Deployment

1. Test your bot by sending messages in your Slack workspace
2. Check Cloudflare Worker logs:
   - Go to the Cloudflare Dashboard
   - Navigate to Workers & Pages
   - Select your worker
   - Click on "Logs" to view execution logs

## Troubleshooting

### Common Issues

1. **Worker returns 500 errors**:
   - Check environment variables are set correctly
   - Verify KV namespace configuration
   - Check worker logs for detailed error information

2. **Slack events not being received**:
   - Verify the Request URL in Slack's Event Subscriptions
   - Ensure bot permissions are correctly configured
   - Check that the worker is properly handling the verification challenge

3. **KV storage issues**:
   - Verify the KV namespace bindings in your wrangler.toml
   - Check access permissions for your worker

### Debugging

1. Use Cloudflare's logging system:
   ```typescript
   // In your code
   console.log("Debug info:", someVariable);
   ```

2. View logs in the Cloudflare Dashboard under Workers → Your Worker → Logs

## Advanced Configuration

### Custom Domains

1. Go to the Cloudflare Dashboard
2. Navigate to Workers & Pages
3. Select your worker
4. Click on "Triggers" and then "Custom Domains"
5. Add your domain (must be managed by Cloudflare)

### Usage Limits

The free tier of Cloudflare Workers includes:
- 100,000 requests per day
- 10ms CPU time per invocation
- 128MB of memory
- 1GB of KV storage

If you need more resources, consider upgrading to a paid plan.

## Maintenance

### Updating Your Bot

1. Make changes to your code locally
2. Test thoroughly using the local development setup
3. Build and deploy:
   ```bash
   npm run build && npm run deploy
   ```

### Monitoring

Monitor your worker's performance using the Cloudflare Dashboard metrics:
- Go to Workers & Pages
- Select your worker
- Click on "Metrics" to view performance data

## Security Considerations

1. **Environment Variables**: Use Wrangler secrets for sensitive information
2. **Slack Signature Verification**: Ensure your code properly validates Slack request signatures
3. **Access Controls**: Restrict access to your worker's administrative functions 