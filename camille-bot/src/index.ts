import { Env, getConfig } from './shared/config/config';
import { CloudflareLogger } from './shared/logging/logger';
import { CloudflareKVStore } from './shared/storage/kv-store';
import { handleSlackEvent } from './shared/slack/events';

// Create a logger for the main context
const logger = new CloudflareLogger('camille-bot');

// Define the main handler
export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    try {
      const url = new URL(request.url);
      const path = url.pathname;
      const method = request.method;
      
      // Log the request details
      console.log(`Request received: ${method} ${path}`);
      
      // Debug endpoint for troubleshooting
      if (path === '/debug') {
        const headers = Object.fromEntries([...request.headers.entries()]);
        const details = {
          method: method,
          url: request.url,
          path: path,
          headers: headers
        };
        
        return new Response(JSON.stringify(details, null, 2), {
          headers: { 'Content-Type': 'application/json' }
        });
      }
      
      // Root endpoint - health check
      if (method === 'GET' && path === '/') {
        return new Response('Camille Bot is running!', {
          headers: { 'Content-Type': 'text/plain' },
        });
      }
      
      // Test endpoint
      if (method === 'GET' && path === '/test') {
        return new Response('Test endpoint is working!', {
          headers: { 'Content-Type': 'text/plain' },
        });
      }
      
      // Slack events endpoint
      if (path === '/slack/events') {
        console.log('Handling /slack/events endpoint');
        
        // GET requests to the events endpoint
        if (method === 'GET') {
          return new Response('Slack Events endpoint is ready. POST requests only.', {
            headers: { 'Content-Type': 'text/plain' }
          });
        }
        
        // POST requests (actual Slack events)
        if (method === 'POST') {
          try {
            // Initialize dependencies
            const config = getConfig(env);
            const storage = new CloudflareKVStore(env.kv);
            const eventLogger = new CloudflareLogger('slack-events');
            
            // Call the event handler and await its response
            const response = await handleSlackEvent(request, {
              logger: eventLogger,
              config,
              storage,
            });
            
            return response;
          } catch (eventError: unknown) {
            // Handle any errors that occur during event processing
            console.error('Error in Slack event handler:', eventError);
            return new Response(`Error processing Slack event: ${eventError instanceof Error ? eventError.message : String(eventError)}`, {
              status: 500,
              headers: { 'Content-Type': 'text/plain' },
            });
          }
        }
        
        // Method not allowed for other methods to /slack/events
        return new Response('Method not allowed for Slack Events endpoint', {
          status: 405,
          headers: { 'Content-Type': 'text/plain' }
        });
      }
      
      // Fallback for unhandled paths
      return new Response(`Endpoint not found: ${path}`, {
        status: 404,
        headers: { 'Content-Type': 'text/plain' },
      });
    } catch (error: unknown) {
      // Log any errors
      console.error('Unhandled error:', error);
      
      // Return a generic error response
      return new Response(`An error occurred: ${error instanceof Error ? error.message : String(error)}`, {
        status: 500,
        headers: { 'Content-Type': 'text/plain' },
      });
    }
  },
}; 