#!/bin/bash

# Check if ngrok is installed
if ! command -v ngrok &> /dev/null; then
    echo "ngrok is not installed. Please install it from https://ngrok.com/download"
    exit 1
fi

# Start ngrok in the background
echo "Starting ngrok..."
ngrok http 8787 > /dev/null &
NGROK_PID=$!

# Give ngrok a moment to start
sleep 2

# Get the ngrok URL
NGROK_URL=$(curl -s http://localhost:4040/api/tunnels | grep -o '"public_url":"[^"]*' | grep -o 'https://[^"]*')

if [ -z "$NGROK_URL" ]; then
    echo "Failed to get ngrok URL"
    kill $NGROK_PID
    exit 1
fi

echo "ngrok URL: $NGROK_URL"

# Update wrangler.dev.toml with the ngrok URL - using a more flexible pattern
# This will replace any URL after API_HOST = " with the new ngrok URL
if [[ "$OSTYPE" == "darwin"* ]]; then
    # macOS (BSD) sed requires an empty string with -i
    sed -i '' -E "s|(API_HOST = \")[^\"]+(\")|\1$NGROK_URL\2|" wrangler.dev.toml
else
    # Linux/GNU sed works with -i directly
    sed -i -E "s|(API_HOST = \")[^\"]+(\")|\1$NGROK_URL\2|" wrangler.dev.toml
fi

echo "Updated wrangler.dev.toml with ngrok URL: $NGROK_URL"
echo "Starting local development server..."

# Start the wrangler dev server
npm run start-local

# Cleanup
kill $NGROK_PID 