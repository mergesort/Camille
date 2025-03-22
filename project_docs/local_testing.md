# Local Testing Guide for Camille Bot

This guide will walk you through setting up and testing the Camille Bot locally.

## Prerequisites

- Node.js (latest LTS version)
- npm
- A Slack workspace where you have permission to create apps

## Step 1: Set Up a Slack App

1. Go to [https://api.slack.com/apps](https://api.slack.com/apps) and click "Create New App"
2. Choose "From scratch" 
3. Give your app a name (e.g., "Camille Bot Dev") and select your development workspace
4. Click "Create App"

### Configure App Permissions

1. In the sidebar, navigate to "OAuth & Permissions"
2. Scroll down to "Scopes" and add the following Bot Token Scopes:
   - `chat:write` - Send messages as the app
   - `reactions:read` - View emoji reactions
   - `reactions:write` - Add emoji reactions
   - `channels:history` - View messages in public channels
   - `groups:history` - View messages in private channels
   - `im:history` - View messages in direct messages
   - `mpim:history` - View messages in group direct messages

## Step 2: Configure Local Environment

1. Create a `.dev.vars` file in the project root (using the `.dev.vars.example` as a template):

```
SLACK_COMMUNITY_ID=your_workspace_id
SLACK_API_TOKEN=xoxb-your-bot-token
API_HOST=http://localhost:8787
SLACK_SIGNING_SECRET=your-signing-secret
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

### API Host Configuration

For local development:
1. Set `API_HOST=http://localhost:8787` in your `.dev.vars` file
2. This is the address where your local Wrangler development server will be running

### Slack Signing Secret

The Signing Secret is used to verify that requests are coming from Slack:

1. Go to your Slack App page
2. In the sidebar, click on "Basic Information"
3. Scroll down to the "App Credentials" section
4. Look for "Signing Secret" and click "Show" to reveal it
5. Copy this secret and paste it into your `.dev.vars` file as the `SLACK_SIGNING_SECRET` value

## Step 3: Set Up Local KV Storage

For local testing, Wrangler will create a local KV namespace that simulates Cloudflare KV. Update your `wrangler.toml` file:

```toml
# ...existing configuration...

[[kv_namespaces]]
binding = "CAMILLE_KV"
id = "dummy-id-for-local-dev"
preview_id = "dummy-id-for-local-dev"
```

## Step 4: Start the Local Development Server and Set Up ngrok

To allow Slack to send events to your local server, you need to expose your local development server to the internet.

1. Start the local development server in one terminal window:
   ```bash
   npm run dev
   ```
   You should see output indicating that the server is running on port 8787

2. In a separate terminal window, install and start ngrok:
   ```bash
   npm install -g ngrok
   ngrok http 8787
   ```
   or download from [ngrok.com](https://ngrok.com/download)

3. Note the HTTPS URL provided by ngrok (e.g., `https://a1b2c3d4.ngrok.io`)

## Step 5: Enable Event Subscriptions

Now that you have a running server and public URL, you can configure Slack event subscriptions:

1. In the Slack app settings sidebar, click on "Event Subscriptions"
2. Toggle "Enable Events" to On
3. For the Request URL, enter your ngrok URL followed by `/slack/events` 
   (e.g., `https://a1b2c3d4.ngrok.io/slack/events`)
4. Slack will verify the URL by sending a challenge request to your server
   - Slack sends a POST request with a JSON payload containing a `challenge` parameter
   - Your server must respond with the same challenge value in a JSON object
   - The exact format should be: `{"challenge": "the-challenge-value-from-slack"}`
   - If verification succeeds, you'll see a green checkmark
   - If it fails, make sure your local server is running and the URL is correct
   - Check your server logs for any errors during verification
5. Once verified, under "Subscribe to bot events", add the following events:
   - `message.channels` - When a message is posted to a channel
   - `message.groups` - When a message is posted to a private channel
   - `reaction_added` - When a reaction is added to a message
   - `reaction_removed` - When a reaction is removed from a message
6. Click "Save Changes" at the bottom of the page

## Step 6: Install App to Workspace

1. In the sidebar, click on "Install App"
2. Click "Install to Workspace"
3. Review the permissions and click "Allow"
4. After installation, note your "Bot User OAuth Token" - you'll need this for configuration
5. Update your `.dev.vars` file with this token:
   ```
   SLACK_API_TOKEN=xoxb-your-bot-token
   ```
6. Restart your local development server to pick up the new token

## Step 7: Test the Bot

1. Go to a channel in your Slack workspace where the bot is installed
2. Send a test message to verify the bot is receiving events
3. When you send a message, you should see event logs in your local server console

### Testing URL Verification

When you first configure the Events API URL, Slack sends a challenge request. Your implementation should already handle this, but you can verify it works by:

1. Temporarily remove the URL from the Event Subscriptions
2. Add it back
3. Check your local logs to confirm the challenge was received and responded to

### Testing Feature Modules

As you implement each feature module, you can test them individually:

1. **Karma System**: Send messages with `++`, `--`, `+= N`, or `-= N` operators
2. **Link Tracking**: Share URLs in channels and verify they're being tracked
3. **Auto-Responder/Moderation**: Trigger phrases like "hey guys" to test responses

## Troubleshooting

- **Events not being received**: 
  - Check that your ngrok URL is correct and that the Slack app has the necessary event subscriptions
  - Each time you restart ngrok, you'll get a new URL and need to update the Request URL in Slack
  - Consider using ngrok with a fixed subdomain if you have a paid account

- **Authentication errors**: Verify your Bot Token and Signing Secret

- **Local server errors**: Check the console output for specific error messages

- **KV storage issues**: Make sure Wrangler is properly configured for local KV emulation

- **"Error: The script will never generate a response"**: 
  - This occurs when the Worker doesn't properly return a Response object
  - This is often related to async function handling. Follow these steps to resolve:
  
  1. Temporarily use a simplified Worker:
     
     Create a simple worker file (src/simple.ts):
     ```typescript
     // A simple Cloudflare Worker for Slack Event handling
     export default {
       async fetch(request: Request): Promise<Response> {
         try {
           // Return simple response for GET requests
           if (request.method === 'GET') {
             return new Response('Simple Slack event handler is running', {
               headers: { 'Content-Type': 'text/plain' }
             });
           }
           
           // Handle POST requests (Slack events)
           if (request.method === 'POST') {
             const text = await request.text();
             console.log('Received POST body:', text);
             
             try {
               const json = JSON.parse(text);
               
               // Handle URL verification challenge
               if (json.type === 'url_verification') {
                 console.log('Received challenge:', json.challenge);
                 return new Response(JSON.stringify({ challenge: json.challenge }), {
                   headers: { 'Content-Type': 'application/json' }
                 });
               }
               
               // For other event types
               return new Response('Event received', {
                 headers: { 'Content-Type': 'text/plain' }
               });
             } catch (jsonError) {
               return new Response('Invalid JSON', {
                 status: 400,
                 headers: { 'Content-Type': 'text/plain' }
               });
             }
           }
           
           // For other methods
           return new Response('Method not allowed', {
             status: 405,
             headers: { 'Content-Type': 'text/plain' }
           });
         } catch (error) {
           return new Response(`Error: ${error.message}`, {
             status: 500,
             headers: { 'Content-Type': 'text/plain' }
           });
         }
       }
     };
     ```
  
  2. Update wrangler.toml to use the simple worker:
     ```toml
     name = "camille-bot"
     main = "src/simple.ts"  # Use the simple worker
     compatibility_date = "2024-01-01"
     compatibility_flags = ["nodejs_compat"]
     ```
  
  3. After verifying the simple worker functions correctly and can pass the Slack verification challenge, apply the following lessons to your main index.ts file:
     - Make sure the `fetch` function is marked as `async`
     - Use `await` keyword for all async functions
     - Avoid using complex routing libraries if they're causing issues
     - Implement direct, simple path handling with conditions
     - Ensure all code paths return a Response object, not a Promise

  4. Common issues to check in your main codebase:
     - Ensure you're awaiting all `Promise<Response>` returned from functions
     - Check that all async functions are correctly marked as async
     - Verify no Promises are being returned without resolution
     - Avoid complex condition checking that might bypass response generation

- **Slack URL verification fails**: 
  - Make sure your server is properly handling the challenge request
  - The server must return a JSON response with the challenge value: `{"challenge": "value-from-request"}`
  - The response Content-Type must be "application/json"
  - Check your logs to see if the request is reaching your server
  - Try restarting your development server and ngrok
  - If using the default implementation, ensure the handleSlackEvent function is being called
  - Example of a Slack verification request:
    ```json
    {
      "token": "some-token",
      "challenge": "challenge-value-from-slack",
      "type": "url_verification"
    }
    ```

## Next Steps

Once you've verified local functionality, you can proceed to production deployment as outlined in the `cloudflare_deployment.md` guide. 