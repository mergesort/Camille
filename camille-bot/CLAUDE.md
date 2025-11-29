# Camille Bot Development Guide

## Project Overview

Camille is a Slack bot built on Cloudflare Workers with TypeScript. It provides karma management, link tracking, auto-responses, and community management features.

## Architecture

- **Platform**: Cloudflare Workers (serverless)
- **Storage**: Cloudflare KV (key-value store)
- **Language**: TypeScript with strict mode
- **Testing**: Jest
- **Deployment**: Wrangler CLI

## Directory Structure

```
src/
├── auto-responder/     # Automatic responses to common phrases
├── greetings/          # Greeting detection and responses
├── help/               # Help command system
├── karma/              # Karma point system
├── link-tracking/      # Cross-channel link tracking
├── x-transformer/      # X/Twitter link transformation
├── shared/             # Shared utilities and types
│   ├── config/         # Configuration management
│   ├── logging/        # Logging utilities
│   ├── regex/          # Centralized regex patterns
│   ├── slack/          # Slack API integration
│   └── storage/        # KV storage abstraction
└── index.ts            # Main entry point
```

## Code Conventions

### Feature Organization

- Each feature has its own directory with:
  - Main implementation file (e.g., `karma.ts`)
  - Storage layer if needed (e.g., `storage.ts`)
  - Test directory (`__tests__/`)
  - Index file for exports (`index.ts`)

### Dependency Injection Pattern

All handlers receive dependencies as parameters:

```typescript
interface Dependencies {
  logger: Logger;
  config: Config;
  storage: KVStore;
}
```

Never access global state or create dependencies inside feature code.

### Regex Patterns

- All regex patterns are centralized in `src/shared/regex/patterns.ts`
- Use the pattern factory functions for bot-specific regexes
- Document regex patterns with JSDoc comments explaining what they match

### Testing

- Tests are co-located with features in `__tests__/` directories
- Use descriptive test names: `test('should handle karma increment with multiple plus signs', ...)`
- Mock all external dependencies (Slack API, KV storage)
- Test both success and error cases

### Type Safety

- Strict TypeScript mode is enabled
- No `any` types - use `unknown` and type guards instead
- Prefer explicit types over inference for public APIs
- Use Zod schemas for runtime validation when needed

## Key Patterns

### Slack Event Handling

The main flow:
1. Request arrives at `/slack/events`
2. Signature verification happens first
3. URL verification challenges are handled
4. Events are parsed and routed to appropriate handlers
5. Handlers use the dependency injection pattern

### Storage Keys

Follow the naming convention:
- `karma:{userId}` - User karma data
- `link:{normalizedUrl}` - Link tracking data

Use constants for key prefixes (defined in storage files).

### Error Handling

- Always catch and log errors
- Return user-friendly error messages to Slack
- Use try-catch blocks in async handlers
- Log with appropriate context (feature name, user ID, etc.)

## Development Workflow

### Running Locally

```bash
npm run dev-local
```

This uses `wrangler dev` with local KV storage.

### Running Tests

```bash
# All tests
npm test

# Specific feature
npm test -- --testPathPattern=karma

# Watch mode
npm test -- --watch
```

### Code Formatting

```bash
npm run format
```

Prettier is configured for the project.

### Building

```bash
npm run build
```

TypeScript compiles to `dist/` directory.

## Configuration

Configuration is managed through:
- `.dev.vars` - Local environment variables
- `wrangler.toml` - Cloudflare Workers configuration
- Environment variables injected at runtime

Never hardcode:
- Slack tokens or secrets
- User IDs or workspace IDs
- API endpoints

Access through the `Config` object.

## Slack API Integration

### Message Formatting

- Slack user mentions: `<@U12345|username>`
- Slack URLs: `<https://example.com|Link Text>`
- Use helpers in `src/shared/slack/utils.ts` for parsing

### Posting Messages

- Use `sendSlackMessage()` from `src/shared/slack/messaging.ts`
- Always include proper error handling
- Consider thread context (use `thread_ts` when replying)

## Adding New Features

1. Create feature directory under `src/`
2. Implement main logic in `feature-name.ts`
3. Add storage layer if needed in `storage.ts`
4. Create tests in `__tests__/`
5. Export public API through `index.ts`
6. Register handler in `src/shared/slack/events.ts`
7. Add regex patterns to `src/shared/regex/patterns.ts` if needed
8. Update help system in `src/help/help.ts`

## Common Tasks

### Adding a Regex Pattern

1. Add to `src/shared/regex/patterns.ts`
2. Document with JSDoc comments
3. Export the pattern
4. Use in feature code

### Adding a Storage Key Type

1. Define key prefix constant in feature's `storage.ts`
2. Create TypeScript interfaces for stored data
3. Implement get/set functions with proper error handling
4. Add Zod schemas for runtime validation if complex data

### Adding a Slash Command

Bot commands follow the pattern: `@botname command [args]`

1. Create regex with `createBotCommandRegex()` helper
2. Add command handler in feature code
3. Register in event handler
4. Add to help documentation

## Testing Guidelines

### Unit Tests

- Test pure functions in isolation
- Mock all external dependencies
- Test edge cases and error conditions
- Use descriptive test names

### Integration Tests

- Test feature workflows end-to-end
- Mock only external APIs (Slack, etc.)
- Test with realistic data
- Verify storage interactions

### Test Data

- Use realistic Slack IDs (e.g., `U12345678`)
- Use realistic timestamps
- Test with various message formats
- Include edge cases (empty strings, special characters)

## Performance Considerations

- Cloudflare Workers have execution time limits
- KV operations are eventually consistent
- Batch KV operations when possible
- Keep responses fast (< 3 seconds)
- Use appropriate cache TTLs

## Security

- Always verify Slack request signatures
- Never log sensitive data (tokens, secrets)
- Sanitize user input before storage
- Use proper error messages (don't leak internals)
- Validate all incoming data

## Debugging

### Local Debugging

- Console logs appear in wrangler output
- Use the `/debug` endpoint to inspect requests
- Check KV storage state with wrangler CLI

### Production Debugging

- Check Cloudflare Workers logs
- Use the logger with appropriate log levels
- Add request IDs for tracing

## Common Issues

### Regex Not Matching

- Slack formats mentions as `<@U12345|username>` or `<@U12345>`
- URLs are wrapped: `<https://example.com>`
- Test regexes with actual Slack-formatted text

### KV Storage Issues

- KV is eventually consistent (slight delays possible)
- Keys have size limits (512 bytes)
- Values have size limits (25 MB)
- Use proper error handling for all KV operations

### Type Errors

- Strict mode catches most issues
- Use type guards for unknown data
- Validate external data with Zod schemas
- Don't use type assertions (`as`) without validation

## Resources

- [Cloudflare Workers Docs](https://developers.cloudflare.com/workers/)
- [Slack API Docs](https://api.slack.com/)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)
- Project docs in `../project_docs/`
