# Code Research Domain Agent

A domain agent for deep codebase analysis using [ChunkHound](https://chunkhound.github.io/) MCP tools. This agent provides semantic code search, regex pattern matching, and multi-file architecture analysis capabilities.

## Architecture

```mermaid
flowchart TB
    subgraph Supervisor["Investigation Supervisor"]
        direction TB
        CodeResearch["Code Research Agent"]
        OtherAgents["Other Domain Agents<br/>(NewRelic, Sentry, AWS, etc.)"]
    end

    subgraph MCPLayer["MCP Layer"]
        MCPClient["MultiServerMCPClient"]
        ChunkHoundMCP["ChunkHound MCP Server<br/>(HTTP: localhost:8090)"]
    end

    subgraph ChunkHoundContainer["Docker: ChunkHound"]
        SearchTool["mcp_chunkhound_search"]
        ResearchTool["mcp_chunkhound_code_research"]
        Embeddings["Ollama Embeddings<br/>(mxbai-embed-large)"]
        LLM["Ollama LLM<br/>(llama3.1:8b)"]
    end

    subgraph Storage["Shared Volume"]
        Repos["data/repos/"]
        DB["chunkhound_data"]
    end

    subgraph RepoManager["Repository Manager"]
        Clone["Clone on Startup"]
        Scheduler["Hourly Cron Update"]
    end

    CodeResearch -->|"Uses filtered tools"| MCPClient
    MCPClient -->|"HTTP"| ChunkHoundMCP
    ChunkHoundMCP --> SearchTool
    ChunkHoundMCP --> ResearchTool
    SearchTool --> Embeddings
    ResearchTool --> LLM
    ChunkHoundContainer --> Repos
    ChunkHoundContainer --> DB
    RepoManager -->|"git clone/pull"| Repos
    Scheduler -->|"0 * * * *"| RepoManager
```

## Components

### Tools

| Tool | Description | Use Case |
|------|-------------|----------|
| `mcp_chunkhound_search` | Regex and semantic code search | Finding function definitions, imports, patterns |
| `mcp_chunkhound_code_research` | Deep multi-file architecture analysis | Understanding component relationships, architectural questions |

### System Prompt (`prompts.ts`)

The agent uses a structured prompt with:

- **Autonomous mode** - Completes research without user confirmation
- **Tool guidance** - When to use regex vs semantic search
- **Workflow phases** - Understand → Search → Synthesize
- **Error handling** - Graceful degradation strategies

## Configuration

### Enable ChunkHound

```bash
# .env
CHUNKHOUND_ENABLED=true
CHUNKHOUND_URL=http://localhost:8090
```

### Configure Repositories

```bash
# .env
GITHUB_REPOSITORIES_ENABLED=true
GITHUB_REPOSITORIES_REPOS='[{"owner":"langchain-ai","repo":"langchainjs","branch":"main"}]'
```

## Data Flow

```mermaid
sequenceDiagram
    participant User
    participant Supervisor
    participant CodeResearch as Code Research Agent
    participant MCP as MCP Client
    participant ChunkHound as ChunkHound Container
    participant Ollama

    User->>Supervisor: "How does authentication work in langchainjs?"
    Supervisor->>CodeResearch: Delegate to code_research_expert

    CodeResearch->>MCP: mcp_chunkhound_search (semantic)
    MCP->>ChunkHound: HTTP POST /search
    ChunkHound->>Ollama: Generate embeddings
    Ollama-->>ChunkHound: Vector embeddings
    ChunkHound-->>MCP: Search results
    MCP-->>CodeResearch: Code snippets with file paths

    CodeResearch->>MCP: mcp_chunkhound_code_research
    MCP->>ChunkHound: HTTP POST /code_research
    ChunkHound->>Ollama: LLM analysis
    Ollama-->>ChunkHound: Architectural explanation
    ChunkHound-->>MCP: Research summary
    MCP-->>CodeResearch: Multi-file analysis

    CodeResearch-->>Supervisor: Synthesized findings
    Supervisor-->>User: Architecture explanation with code citations
```

## Prerequisites

1. **ChunkHound container running**:

   ```bash
   docker-compose up -d chunkhound
   ```

2. **Ollama models available** on host:

   ```bash
   ollama pull mxbai-embed-large:latest  # Embeddings
   ollama pull llama3.1:8b               # Code research LLM
   ```

3. **Repositories cloned** to `data/repos/`:
   - Automatic on server startup if `GITHUB_REPOSITORIES_ENABLED=true`
   - Or manually: `git clone <repo> data/repos/<owner>/<repo>`

## Testing with curl

The Code Research agent is accessed via the Investigation Supervisor endpoint. The supervisor automatically routes code-related queries to the `code_research_expert` agent.

### Basic Code Research Query

```bash
curl -X POST http://localhost:8080/agent/investigate \
  -H "Content-Type: application/json" \
  -d '{
    "query": "How does the createReactAgent function work in the langchainjs repository?"
  }'
```

### Architecture Analysis

```bash
curl -X POST http://localhost:8080/agent/investigate \
  -H "Content-Type: application/json" \
  -d '{
    "query": "Explain the architecture of the MCP client implementation. How are multiple servers managed?"
  }'
```

### With Configuration Overrides

```bash
curl -X POST http://localhost:8080/agent/investigate \
  -H "Content-Type: application/json" \
  -d '{
    "query": "Find all usages of StructuredTool in the codebase",
    "config": {
      "provider": "openai",
      "model": "gpt-4o",
      "temperature": 0,
      "timeoutMs": 120000,
      "verboseLogging": true
    }
  }'
```

### Example Response

```json
{
  "summary": "The createReactAgent function creates a ReAct agent...",
  "findings": [
    {
      "agent": "code_research_expert",
      "result": "Found in src/api/agent/domains/code-research/agent.ts:34-45..."
    }
  ],
  "recommendations": ["..."],
  "usage": {
    "totalTokens": 1234,
    "estimatedCost": 0.0123
  }
}
```

### Debugging Tips

1. **Check ChunkHound is running**:

   ```bash
   curl http://localhost:8090/health
   ```

2. **Verify repositories are cloned**:

   ```bash
   ls -la data/repos/
   ```

3. **Check server logs** for agent routing:

   ```bash
   npm run dev  # Watch logs for "Creating Code Research agent"
   ```

## Related Files

- `src/libraries/github/repositoryManager.ts` - Git clone/pull scheduler
- `src/libraries/mcp/mcpClient.ts` - ChunkHound MCP configuration
- `docker-compose.yml` - ChunkHound container definition
- `Dockerfile.chunkhound` - ChunkHound image build
