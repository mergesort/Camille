# Camille Bot Rewrite – Product Specification & Technical Design 


## Product Specification 


### 1. Overview 

**Project Name:**  Camille Bot Rewrite

**Objective:**  Rebuild the existing Swift-based Slack bot as a TypeScript application deployable on Cloudflare Workers. This rewrite will improve maintainability, broaden community contributions, and set the stage for future enhancements.
**Background:** 

The current bot is written in Swift and uses Redis for persistence. It handles key tasks such as:
 
- **Karma (Points) System:**  Tracking user “points” via operations like `++`, `--`, `+= N`, and `-= N`.
 
- **Link Tracking and Context:**  Detecting, de-duplicating, and storing link metadata and providing context when links are re-posted.
 
- **Auto-Moderation and Greeting:**  Responding to messages with trigger phrases to guide community interaction and offer friendly greetings.


Due to a dwindling Swift expert community, moving to TypeScript will streamline maintenance and enable future feature additions.


### 2. Goals and Objectives 

 
- **Preserve Core Functionality:** 

Ensure full parity with existing features (karma tracking, link context, auto-moderation/greeting).
 
- **Enhance Maintainability:** 

Leverage TypeScript and modern tooling for improved readability, testing, and extension of the codebase.
 
- **Deploy on Cloudflare Workers:** 

Utilize Cloudflare’s serverless platform for scalability and low latency while abstracting the storage layer to allow future changes.
 
- **Enable Future Enhancements:** 

Build a modular and extensible system to easily introduce new features, such as an auto-responder that posts documentation links when a message includes “hey guys.”


### 3. Functional Requirements 


#### 3.1 Karma (Points) System 

 
- **Operations:** 
 
	- Support increments and decrements via operator patterns (`++`, `--`, `+= N`, `-= N`).
 
	- Cap per-operation changes to avoid abuse.
 
	- Prevent self-karma and consolidate multiple adjustments from a single message.
 
- **Reporting:** 
 
	- Respond to queries about a user’s karma total.
 
	- Provide leaderboard functionality to display top users.


#### 3.2 Link Tracking and Context 

 
- **Link Recognition:** 
 
	- Parse messages for URLs.
 
	- Strip unwanted query parameters (e.g., UTM tags) to standardize stored URLs.
 
	- Avoid duplicate tracking by de-duplicating links.
 
- **Contextual Responses:** 
 
	- When a link is re-shared within a set timeframe, respond with context (e.g., “this link was also mentioned in…”).
 
	- Apply configurable conditions (cross-channel, same-channel, expiration policies).


#### 3.3 Auto-Responder & Auto-Moderation 

 
- **Auto-Responder:** 
 
	- Detect the phrase “hey guys” using simple string matching and regex patterns.
 
	- Reply in a thread with preconfigured documentation links.
 
	- Configure trigger phrases and associated links via module settings.
 
- **Auto-Moderation:** 
 
	- Monitor messages for phrases such as “you guys” or “thanks guys.”
 
	- Post gentle reminders to encourage more inclusive language.
 
- **Greeting Service:** 

	- Respond to direct greetings such as "hello" or "hi" with a friendly message and appropriate emoji reaction.

	- The message will follow a template of "Well ["heya", "hey", "hi", "hello", "gday", "howdy"].random() back at you {message.user}"

	- There will also be a wave action emoji added to the user's "hello" message.


#### 3.4 Extensibility 

 
- **Modular Design:** 
 
	- Each feature (karma, link tracking, auto-responder/auto-moderation, greetings) is implemented as an independent module.
 
	- Shared code (utilities, storage, logging, Slack integration) is centralized for reuse.
 
- **Configuration:** 
 
	- Use environment variables for Slack community configuration (e.g., `SLACK_COMMUNITY_ID`, `SLACK_API_TOKEN`, etc.) through Cloudflare’s latest API approach.
 
	- Avoid feature flags but support a centralized configuration module for necessary environment values.


### 4. Non-Functional Requirements 

 
- **Performance:** 
 
	- Ensure responses stay within Cloudflare Workers’ CPU and memory constraints.
 
- **Scalability:** 
 
	- Handle an estimated peak load of 1–10 messages per second on the free tier.
 
- **Security:** 
 
	- Validate incoming Slack requests using signature verification middleware.
 
	- Secure environment configurations and storage access.
 
- **Maintainability:** 
 
	- Follow modern TypeScript best practices and use modular architecture.
 
	- Provide comprehensive documentation and unit tests.
 
- **Observability:** 
 
	- Utilize Cloudflare’s built-in logging (wrapped in a facade) for error tracking and debugging.
 
	- Capture detailed error metadata and support Slack DM alerts for significant errors.



---



## Technical Design 


### 1. Monorepo and Project Structure 

 
- **Repository Layout:** 
 
	- Use a monorepo with dedicated folders for each feature:

 
		- `/karma`
 
		- `/link-tracking`
 
		- `/auto-responder`
 
		- `/auto-moderation`
 
		- `/greetings`
 
	- **Shared Folder:** 
 
		- Common utilities such as storage, logging, configuration, and the Slack integration layer.
 
- **Environment Configuration:** 
 
	- Utilize Cloudflare’s latest environment API. An example interface:



```typescript
export interface Env {
	API_HOST: string;
	SLACK_COMMUNITY_ID: string;
	SLACK_API_TOKEN: string;
	ALERT_USER_ID?: string;
}

export default {
	async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		// Code implementation goes here
		return new Response(`API host: ${env.API_HOST}`);
	},
} satisfies ExportedHandler<Env>;
```


### 2. Slack Integration 

 
- **SDK:** 
 
	- Adopt the official Slack SDK if it meets our requirements.
 
	- Wrap the SDK in our integration layer to standardize event parsing and response handling.
 
	- Implement middleware to verify Slack request signatures for security.
 
- **Endpoint Routing:** 
 
	- Expose a single endpoint (e.g. `/slack/events`) to receive all Slack events.
 
	- Route internally using a lightweight router (e.g. itty-router).


### 3. Storage Abstraction 

 
- **KV Facade:** 
 
	- Implement a simple key–value API with methods: `get`, `set`, and `delete`.
 
	- Initially integrate with Cloudflare Workers KV.
 
	- Design the facade to allow future swapping of storage backends with minimal changes.


### 4. Routing and Middleware 

 
- **Single HTTP Endpoint:** 
 
	- All Slack events hit one endpoint, where a lightweight router dispatches requests.
 
- **Middleware:** 
 
	- Include middleware for tasks such as:

 
		- Verifying Slack request signatures.
 
		- Normalizing and parsing incoming payloads.
 
		- Logging request metadata for debugging purposes.


### 5. Feature Modules 


#### 5.1 Auto-Responder 

 
- **Functionality:** 
 
	- Monitor for the trigger phrase “hey guys” using string matching and regex.
 
	- Post a threaded reply with configurable documentation links.
 
	- Allow the documentation links to be updated via configuration.


#### 5.2 Auto-Moderation and Greetings 

 
- **Auto-Moderation:** 
 
	- Detect phrases like “you guys” and “thanks guys.”
 
	- Respond with guidance to use more inclusive language in a thread.
 
- **Greeting Service:** 
 
	- Recognize direct greetings and respond with a friendly message and emoji reaction.


#### 5.3 Karma (Points) System 

 
- **Operations:** 
 
	- Handle user point adjustments using various operator syntaxes.
 
	- Enforce caps on adjustments and prevent self-karma.
 
	- Consolidate multiple adjustments and support leaderboard queries.


#### 5.4 Link Tracking 

 
- **Functionality:** 
 
	- Detect URLs in incoming messages.
 
	- Remove extraneous query parameters and de-duplicate URLs.
 
	- Store metadata (timestamp, channel ID, permalink) in KV.
 
	- Respond with context if a link has been shared recently.


### 6. Logging and Error Handling 

 
- **Logging:** 
 
	- Use Cloudflare’s built-in logging, wrapped in a facade to allow for future changes.
 
- **Error Handling:** 
 
	- Capture detailed error metadata (including payloads) in logs.
 
	- Implement a mechanism to send Slack DM alerts (target user specified via `ALERT_USER_ID`) when significant errors occur.
 
	- No retry mechanisms or escalation protocols are implemented at this stage—logging and metadata capture are prioritized.


### 7. Testing Strategy 

 
- **Unit Testing:** 
 
	- Use Jest (or another common testing library) for unit tests.
 
	- Port over Camille’s existing matching tests to ensure full coverage of core functionality.
 
	- Include tests for our storage facade and individual feature modules.
 
	- Simulate minimal representative Slack event payloads; no need to mock the entire Slack SDK.
 
- **Integration Testing:** 
 
	- Initially focus on unit tests; integration tests can be added later if needed.


### 8. Deployment 

 
- **Tooling:** 
 
	- Use Cloudflare’s Wrangler tool for building and deploying Workers.
 
- **Documentation:** 
 
	- Provide a separate deployment tutorial detailing:

 
		- Setting up Wrangler.
 
		- Configuring environment variables.
 
		- Deploying the application.
 
		- Verifying functionality.
 
- **Compatibility:** 
 
	- Target the latest TypeScript version compatible with Cloudflare Workers to leverage modern features while meeting platform constraints.


### 9. Performance and Scalability 

 
- **Load Estimates:** 
 
	- Expect peak traffic of 1–10 messages per second, which is well within Cloudflare Workers’ capabilities on the free tier.
 
- **Design Considerations:** 
 
	- Optimize modules to operate within Cloudflare’s CPU and memory limits.
 
	- Monitor performance using Cloudflare’s dashboard and logs to catch any unexpected bottlenecks.