#!/bin/bash

# Create a development KV namespace
echo "Creating development KV namespace..."
KV_OUTPUT=$(npx wrangler kv:namespace create "camille_dev_kv" --preview)

# Extract the KV namespace ID
KV_ID=$(echo "$KV_OUTPUT" | grep -o 'id = "[^"]*' | grep -o '"[^"]*' | sed 's/"//g')
PREVIEW_ID=$(echo "$KV_OUTPUT" | grep -o 'preview_id = "[^"]*' | grep -o '"[^"]*' | sed 's/"//g')

if [ -z "$KV_ID" ] || [ -z "$PREVIEW_ID" ]; then
    echo "Failed to create KV namespace"
    exit 1
fi

echo "Created KV namespace with ID: $KV_ID"
echo "Preview ID: $PREVIEW_ID"

# Update wrangler.dev.toml with the KV namespace ID
sed -i.bak "s/id = \"dev_kv_namespace_id\"/id = \"$KV_ID\"/" wrangler.dev.toml
sed -i.bak "s/preview_id = \"dev_kv_namespace_id\"/preview_id = \"$PREVIEW_ID\"/" wrangler.dev.toml

echo "Updated wrangler.dev.toml with KV namespace IDs"
echo "Development environment setup complete!"