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

## Development Commands

- **Development**: `npm run dev` (auto-reload with pretty logging)
- **Build**: `npm run build` (Rspack bundler)
- **Production**: `npm start`
- **Type Check**: `npm run typecheck`
- **Lint**: `npm run lint` / `npm run lint:fix`
- **Format**: `npm run format`
- **Test**: `npm test` (Jest with coverage)
- **Docker**: `npm run docker:build` / `npm run docker:run`
- **Services**: `docker-compose up -d` (start Redis, Qdrant, Unstructured API)

## TypeScript & Code Style

- **Language**: TypeScript with strict mode enabled (`target: ES2022`, `module: nodenext`)
- **Path Aliases**: Use path mapping (`@/src/*`, `@/api/*`, `@/libraries/*`, etc.)
- **Module System**: ESM with NodeNext resolution
- **Import Organization**: Auto-sorted imports, external → builtin → internal → sibling → parent
- **Naming**: Use meaningful names; prefer "URL" (not "Url"), "API" (not "Api"), "ID" (not "Id")
- **Error Handling**: No floating promises, strict boolean expressions
- **Functions**: Prefer functional programming, `const` over `let`, async/await patterns
- **Comments**: JSDoc for complex logic and public APIs; avoid redundant comments

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

**Required Environment Variables:**

```bash
# Server configuration
PORT=8080
SERVER_MODE=fastify  # or 'slack'

# LLM Provider APIs (at least one required)
OPENAI_API_KEY=your_openai_key
GROQ_API_KEY=your_groq_key

# External services
REDIS_URL=redis://localhost:6379
QDRANT_URL=http://localhost:6333

# Slack (if using slack mode)
SLACK_BOT_TOKEN=xoxb-your-bot-token
SLACK_SIGNING_SECRET=your_signing_secret
```

## API Endpoints

**Document Management (RAG):**

- `DELETE /document/reset` - Reset document store
- `PUT /document/parent/load/directory` - Load documents from directory
- `PUT /document/parent/load/confluence` - Load from Confluence
- `POST /document/parent/query` - Query documents with RAG

**LLM Provider Endpoints:**

- `POST /openai/thread` - Create OpenAI conversation thread
- `POST /groq/thread` - Create Groq conversation thread
- `POST /ollama/thread` - Create Ollama conversation thread
- `GET|POST /*/thread/:id` - Get/continue specific thread

**LangGraph Workflows:**

- `POST /langgraph/thread` - Create LangGraph workflow thread
- `POST /langgraph/newrelic/investigate` - New Relic log analysis workflow

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

- **Framework**: Jest with ts-jest preset and Node.js environment
- **Structure**: `*.test.ts` files alongside source or in `__tests__/` directories
- **Coverage**: Enabled with text, lcov, and json reporters
- **Path Mapping**: Configured to use same aliases as main code
- **Setup**: Global setup and teardown for test environment
- **Timeout**: 10 seconds default with auto-clear mocks

**Test Commands:**

```bash
npm test                    # Run all tests with coverage
npm test -- --watch        # Watch mode
npm test -- path/to/test   # Run specific test
```

## External Services

**Required Services (via Docker Compose):**

- **Redis**: Caching and session storage (`redis:6379`)
- **Qdrant**: Vector database for embeddings (`qdrant:6333`)
- **Unstructured API**: Document processing (`unstructured-api:8000`)

**Optional Services:**

- **Ollama**: Local LLM inference (desktop installation recommended)
- **New Relic**: Log analysis and monitoring
- **Confluence**: Document source integration

## Security & Best Practices

- **API Keys**: Never commit secrets; use environment variables
- **Input Validation**: Zod schemas for request validation where applicable
- **Rate Limiting**: Configured in Fastify setup
- **CORS**: Properly configured for API endpoints
- **Logging**: Structured logging with Pino, including request correlation
- **Error Handling**: Centralized error middleware
- **Content Security**: Slack message validation and sanitization

## Quality Checks

Before submitting changes, run:

```bash
npm run typecheck     # TypeScript compilation check
npm run lint          # ESLint with TypeScript rules
npm run format        # Prettier formatting
npm test              # Jest test suite
npm run build         # Production build verification
```

All checks must pass. Use `npm run lint:fix` and `npm run format` for auto-fixes.

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
