# AGENTS.md: AI Collaboration Guide

This document provides essential guidelines for AI models interacting with this LangChain playground project. Adhering to these standards ensures consistency, maintains code quality, and helps AI agents understand the project's architecture and conventions.

## Project Overview

**LangChain Playground** - A TypeScript-based playground for LangChain.js, LangGraph, Slack bot integration, and Model Context Protocol (MCP) with multiple LLM provider support. The project provides both REST API endpoints and Slack bot integration for interacting with different language models and advanced workflow orchestration.

**Key Technologies:**

- **Framework**: [LangChain.js](https://js.langchain.com/) for building LLM applications
- **Workflow**: [LangGraph](https://langchain-ai.github.io/langgraphjs/) for advanced multi-step processes
- **Integration**: [Slack Bolt](https://www.npmjs.com/package/@slack/bolt) for Slack app functionality
- **Protocol**: [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) for LLM-powered tools
- **Server**: Fastify for REST API endpoints
- **Storage**: Redis for caching and session management
- **Databases**: Qdrant (vector database), Confluence integration

**Core Capabilities:**

1. **Multi-LLM Support**: OpenAI, Groq, Ollama with configurable models and providers
2. **Document Processing**: RAG (Retrieval-Augmented Generation) with parent document retriever
3. **Slack Bot**: Intelligent routing with intent classification and LangGraph workflows
4. **New Relic Integration**: Log analysis and investigation workflows
5. **MCP Tools**: Brave Search, Kubernetes readonly, Context7 integration

## Project Structure

```text
langchain-playground/
├── src/
│   ├── api/                   # REST API endpoints
│   │   ├── document/          # Document loading and querying (RAG)
│   │   ├── groq/              # Groq LLM provider endpoints
│   │   ├── health/            # Health check endpoints
│   │   ├── langgraph/         # LangGraph workflow endpoints
│   │   ├── ollama/            # Ollama local LLM endpoints
│   │   └── openai/            # OpenAI provider endpoints
│   ├── libraries/             # Core utilities and services
│   │   ├── langchain/         # LangChain utilities (LLM, embeddings, vector store)
│   │   ├── mcp/               # Model Context Protocol client
│   │   ├── newrelic/          # New Relic API integration
│   │   ├── slack/             # Slack utilities
│   │   ├── logger.ts          # Pino structured logging
│   │   └── redis.ts           # Redis client configuration
│   ├── middlewares/           # Fastify middleware
│   ├── slack/                 # Slack bot implementation
│   │   ├── event/             # Event handlers (app_mention, message)
│   │   │   ├── nodes/         # LangGraph nodes (intent classifier, summarizer, etc.)
│   │   │   └── stateGraph.ts  # Main LangGraph state machine
│   │   └── index.ts           # Slack app configuration
│   ├── index.ts               # Main application entry point
│   ├── serverWithFastify.ts   # REST API server
│   └── serverWithSlack.ts     # Slack bot server
├── config/                    # Configuration management
├── test/                      # Test files and setup
├── docker-compose.yml         # Development services (Redis, Qdrant, Unstructured API)
└── package.json               # Dependencies and scripts
```

## Build & Commands

- **Check everything**: `npm run typecheck && npm run lint && npm test`
- **Fix linting/formatting**: `npm run lint:fix && npm run format:fix`
- **Run all tests**: `npm test` (Jest with coverage)
- **Run single test**: `npm test -- src/path/to/file.test.ts`
- **Start development**: `npm run dev` (auto-reload with pretty logging)
- **Build for production**: `npm run build` (Rspack bundler)
- **Run production build**: `npm start`
- **Build and run Docker**: `npm run docker:build && npm run docker:run`

### Development Environment

- **API Server**: [http://localhost:8080](http://localhost:8080) (Fastify mode)
- **Slack Bot**: Connects to Slack workspace (Slack mode)
- **Redis**: localhost:6379 (caching and sessions)
- **Qdrant**: [http://localhost:6333](http://localhost:6333) (vector database)
- **Unstructured API**: [http://localhost:8082](http://localhost:8082) (document processing)
- **Services**: `docker-compose up -d` (starts Redis, Qdrant, Unstructured API)

## Code Style

- **TypeScript**: Strict mode with `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`
- **Line Length**: 120 characters maximum
- **Indentation**: 2 spaces (consistent across all files)
- **Quotes**: Single quotes preferred, double quotes for strings containing single quotes
- **Semicolons**: Required (enforced by ESLint)
- **Trailing Commas**: Always use trailing commas in multiline structures
- **Path Aliases**: Always use `@/` imports instead of relative paths
- **Import Organization**: External → builtin → internal → sibling → parent (auto-sorted)
- **Naming Conventions**: Use "URL" (not "Url"), "API" (not "Api"), "ID" (not "Id")
- **Type Safety**: NEVER use `@ts-expect-error` or `@ts-ignore` - fix type issues properly
- **Functions**: Prefer `const` over `let`, use async/await, include explicit return types
- **Comments**: Use JSDoc for complex logic; avoid redundant comments explaining obvious code

**ESLint Rules:**

- TypeScript recommended rules enabled
- Import order enforcement
- No restricted imports from `src/*` (use path aliases)
- Unused variables with `_` prefix ignored
- Test-specific relaxed rules for `*.test.ts`

## LangChain & LangGraph Patterns

**LLM Provider Management:**

```typescript
// Use centralized LLM getter functions
import { getChatOllama, getChatGroq, getChatOpenAI } from '@/libraries/langchain/llm';

const model = getChatOllama(temperature, logger);
```

**Document Processing (RAG):**

```typescript
// Parent document retriever pattern for better context
import { getParentDocumentRetriever } from '@/libraries/langchain/retrievers/parentDocument';

const retriever = await getParentDocumentRetriever(collectionName, logger);
```

**LangGraph Workflow Design:**

```typescript
// State annotation pattern for type safety
const graph = new StateGraph(OverallStateAnnotation)
  .addNode('intent-classifier', intentClassifierNode)
  .addNode('intent-router', intentRouterNode)
  .addConditionalEdges('intent-router', routeToNextIntent)
  .compile();
```

**Streaming Responses:**

- Implement streaming for long-running operations
- Use proper error handling and cleanup
- Support both API and Slack response formats

## Configuration Management

Uses `config` npm package with environment-specific files:

- **Structure**: `config/default.json`, `config/custom-environment-variables.json`
- **Server Modes**: `fastify` (REST API) or `slack` (Slack bot)
- **LLM Providers**: Configure base URLs, API keys, models, temperatures
- **External Services**: Redis, Qdrant, Unstructured API, New Relic
- **Environment Variables**: Override any config value via environment variables

**Environment Variables:**

Create a `.env` file for local development (gitignored) with the following variables:

Refer @.env.dist for the full list of environment variables.

**Minimal Setup:**

For basic functionality, you only need:

```bash
# Core
NODE_ENV=development
SERVER_MODE=fastify
PORT=8080

# At least one LLM provider
OPENAI_API_KEY=your_openai_key

# Redis for caching
REDIS_URL=redis://localhost:6379

# Vector database
QDRANT_URL=http://localhost:6333
```

**Adding New Configuration:**

When adding new configuration options, update all relevant places:

1. Add to `config/default.json` with default values
2. Add to `config/custom-environment-variables.json` for environment variable mapping
3. Update TypeScript types if using typed config access
4. Document in `README.md` and environment variable examples
5. Update Docker and deployment configurations as needed

All configuration keys MUST use consistent naming and be documented.

## API Endpoints

**Document Management (RAG):**

- `DELETE /document/reset` - Reset document store
- `PUT /document/load/directory` - Load documents from directory
- `PUT /document/load/confluence` - Load from Confluence
- `POST /document/query` - Query documents with RAG

**LLM Provider Endpoints:**

- `POST /openai/thread` - Create OpenAI conversation thread
- `POST /groq/thread` - Create Groq conversation thread
- `POST /ollama/thread` - Create Ollama conversation thread
- `GET|POST /*/thread/:id` - Get/continue specific thread

**LangGraph Workflows:**

- `POST /langgraph/thread` - Create LangGraph workflow thread
- `POST /langgraph/newrelic/investigate` - New Relic log analysis workflow
- `POST /langgraph/sentry/investigate` - Sentry issue investigation workflow

**Health & Monitoring:**

- `GET /health` - Health check endpoint

## Slack Bot Integration

**Architecture:**

- LangGraph state machine for intelligent routing
- Intent classification → Tool execution → Response generation
- Multi-step workflows with state management

**Key Nodes:**

1. **Intent Classifier**: Determines user intent from message
2. **Intent Router**: Routes to appropriate processing node
3. **MCP Tools**: Executes Model Context Protocol tools
4. **Summarize**: Creates thread summaries
5. **Translate**: Language translation
6. **Find Information**: RAG-based information retrieval
7. **General Response**: Fallback conversational responses
8. **Final Response**: Formats and sends Slack message

**Event Handling:**

- `app_mention`: Triggered when bot is mentioned
- `message`: Processes direct messages
- Thread-aware responses with proper formatting

## Testing

IMPORTANT: You need to run the test with network permission enabled.

- **Framework**: Jest with ts-jest preset and Node.js environment
- **Test Files**: `*.test.ts` in `__tests__/` directories adjacent to source code
- **Test Names**: Omit "should" from test descriptions (e.g., `it("validates input")` not `it("should validate input")`)
- **Mocking**: Mock external dependencies appropriately, auto-clear mocks enabled
- **Coverage**: Enabled with json, lcov, and text-summary reporters
- **Path Mapping**: Uses same aliases as main code (`@/src/*`, etc.)
- **Timeout**: 10 seconds default with global setup and teardown

**Test Structure Pattern:**

Use `describe` blocks to group scenarios, `beforeEach` for setup, and a shared `result` variable:

```typescript
import { beforeEach, describe, expect, it } from '@jest/globals';

import { myFunction } from '../myModule';

describe('myFunction', () => {
  let result: unknown;

  describe('with valid input', () => {
    beforeEach(() => {
      result = myFunction({ data: 'test' });
    });

    it('returns expected output', () => {
      expect(result).toStrictEqual({ success: true, data: 'test' });
    });
  });

  describe('with edge case', () => {
    beforeEach(() => {
      result = myFunction({});
    });

    it('handles empty input gracefully', () => {
      expect(result).toStrictEqual({ success: true });
    });
  });
});
```

**Key Conventions:**

- **Imports**: Import `beforeEach`, `describe`, `expect`, `it` from `@jest/globals` (alphabetically sorted)
- **Shared Result**: Declare `let result: unknown;` at the top of each `describe` block
- **Setup in beforeEach**: Perform all setup and function calls in `beforeEach`
- **Single Assertion**: Each `it` block should contain only assertions, not setup logic
- **Descriptive Describes**: Use `describe` names that explain the scenario (e.g., "with valid input", "when error occurs")
- **Prefer toStrictEqual**: Use `toStrictEqual` for object comparisons to ensure exact matching

**Test Commands:**

```bash
npm test                              # Run all tests with coverage
npm test -- --watch                   # Watch mode for development
npm test -- src/path/to/file.test.ts  # Run specific test file
npm test -- --coverage                # Explicit coverage report
```

## External Services

**Required Services (via Docker Compose):**

- **Redis**: Caching and session storage (`localhost:6379`)
- **Qdrant**: Vector database for embeddings (`localhost:6333`)
- **Unstructured API**: Document processing (`localhost:8082`)

**Optional Services:**

- **Ollama**: Local LLM inference (desktop installation recommended)
- **New Relic**: Log analysis and monitoring
- **Confluence**: Document source integration

## Security

- **Secrets Management**: NEVER commit API keys, tokens, or secrets to repository
- **Environment Variables**: Use `.env` files for local development (`.env` is gitignored)
- **Data Types**: Use appropriate TypeScript types that limit exposure of sensitive information
- **Input Validation**: Validate all user inputs with Zod schemas on both client and server
- **Rate Limiting**: Configured in Fastify setup to prevent abuse
- **CORS**: Properly configured for API endpoints with specific origins
- **HTTPS**: Use HTTPS in production environments
- **Dependencies**: Regular `npm audit` and dependency updates
- **Principle of Least Privilege**: Grant minimum necessary permissions
- **Logging**: Structured logging with Pino; avoid logging sensitive data
- **Content Security**: Slack message validation and sanitization to prevent injection attacks

## Quality Checks

Before submitting changes, run:

```bash
npm run typecheck     # TypeScript compilation check
npm run lint          # ESLint with TypeScript rules
npm run format        # Prettier formatting
npm test              # Jest test suite
npm run build         # Production build verification
```

All checks must pass. Use `npm run lint -- --fix` and `npm run format` for auto-fixes.

## Git Workflow

- **ALWAYS run quality checks**: `npm run typecheck && npm run lint && npm test` before committing
- **Fix issues automatically**: `npm run lint -- --fix && npm run format` for auto-fixable problems
- **Verify build passes**: `npm run build` before pushing to ensure production build works
- **NEVER force push**: Never use `git push --force` on main branch
- **Feature branches**: Use `git push --force-with-lease` only on feature branches if needed
- **Branch verification**: Always verify current branch before any force operations
- **Commit messages**: Use conventional commit format (enforced by commitlint)
- **Pre-commit hooks**: Husky + lint-staged automatically format and lint on commit

## Pull Request Guidelines

- **Focus**: Keep PRs focused on a single feature or concern
- **Description**: Include clear description of changes and rationale
- **Testing**: Ensure all existing tests pass and add tests for new features
- **Type Safety**: Maintain strict TypeScript compliance
- **Documentation**: Update relevant documentation for API or architecture changes
- **Performance**: Consider impact on LLM token usage and response times

## Common Patterns

**Error Handling:**

```typescript
try {
  const result = await llmOperation();
  logger.info({ result }, 'Operation completed');
  return result;
} catch (error) {
  logger.error({ error }, 'Operation failed');
  throw error;
}
```

**Configuration Access:**

```typescript
import config from 'config';

const apiKey = config.get<string>('openai.apiKey');
const model = config.get<string>('openai.model');
```

**LangChain Chain Building:**

```typescript
import { RunnableSequence } from '@langchain/core/runnables';

const chain = RunnableSequence.from([prompt, model, outputParser]);
const result = await chain.invoke({ input });
```

## Architecture Notes

- **Dual Mode**: Supports both REST API and Slack bot modes via configuration
- **Modular Design**: Clear separation between API routes, libraries, and Slack logic
- **Type Safety**: Comprehensive TypeScript usage with strict compilation
- **Scalability**: Redis-based caching and session management
- **Observability**: Structured logging and health checks
- **Extensibility**: Plugin-based architecture for new LLM providers and tools

This project demonstrates production-ready patterns for building LLM-powered applications with modern TypeScript, comprehensive testing, and enterprise integrations.
