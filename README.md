# A LangChain playground using TypeScript

A playground for LangChain.js, LangGraph, Slack, Model Context Protocol (MCP) and other LLM-related tools.

This project provides both REST API endpoints or Slack bot integration for interacting with different language models and LangChain and LangGraph workflows.

## Architecture

### Core components

- [langchain.js](https://js.langchain.com/): Framework for building applications with LLMs.
- [langgraph](https://langchain-ai.github.io/langgraphjs/): Framework for building applications with advanced workflow orchestration for multi-step processes.
- [slack/bolt](https://www.npmjs.com/package/@slack/bolt): Integration with Slack for building Slack apps.
- [Model Context Protocol (MCP)](https://modelcontextprotocol.io/): MCP is a protocol for building LLM-powered tools.

### LLM providers

- [openai](https://openai.com/)
- [ollama](https://ollama.com/)
- [groq](https://groq.com/)

### Document Loaders

- [DirectoryLoader](https://js.langchain.com/docs/integrations/document_loaders/file_loaders/directory/): Loads documents from a directory via Unstructured API.
- [ConfluenceLoader](https://js.langchain.com/docs/integrations/document_loaders/web_loaders/confluence/): Loads documents from Confluence.
- [GitHubLoader](https://js.langchain.com/docs/integrations/document_loaders/web_loaders/github/): TODO.

### Services

- [ollama](https://ollama.com/): Ollama enables the execution of LLM models locally.
- [openweb-ui](https://docs.openwebui.com/): OpenWeb UI is a self-hosted WebUI that interacts with Ollama.
- [unstructured-api](https://github.com/Unstructured-IO/unstructured-api): The Unstructured API is designed to ingest/digest files of various types and sizes.
- [qdrant](https://qdrant.tech/): Qdrant serves as a vector database.
- [chroma](https://www.trychroma.com/): Chroma serves as an embedding database. Not used anymore.
- [redis](https://redis.io/): Redis is an open-source in-memory data structure store.

## Server mode

- `fastify`: serves as a web server in `src/api`
- `slack`: serves as a Slack app in `src/slack`

## Answer from Retriever-Augmented Generation (RAG)

In this project, there are following routes to answer user's question from the document RAG retrieval.

Routes:

- `DELETE /document/reset`: Reset the document RAG retrieval.
- `PUT /document/parent/load/directory`: Load documents from a directory using Unstructured API + Parent document retriever.
- `PUT /document/parent/load/confluence`: Load documents from Confluence + Parent document retriever.
- `POST /document/parent/query`: Answer user's question from the document RAG retrieval.

### Document loader process

<img width="851" height="268" alt="Document loader process" src="https://github.com/user-attachments/assets/f72bf705-a89d-4016-8320-22d7f03dcc55" />

### Document query process

<img width="852" height="233" alt="Image" src="https://github.com/user-attachments/assets/678294fe-e229-4bd6-ab8a-0a952fa4804a" />

## Slack integration

In this project, I used [slack/bolt](https://www.npmjs.com/package/@slack/bolt) and LangGraph to build a Slack app.

- When a user mentions the bot in a channel, the bot will respond with a message.
- It will execute the following steps:
  - Intent classifier: Classify the intent of the user's message.
  - Intent router: Route the user's message to the appropriate node.
  - Get message history: Get the message history of the channel.
  - MCP tools: Use MCP tools to get information from Model Context Protocol.
  - Summarise thread: Summarise the thread.
  - Translate message: Translate the message to the user's language.
  - Find information: Find information from the RAG database.
  - General response: Generate a general response.
  - Final response: Respond to the user's message.

## How to start

```bash
docker-compose up -d --build
```

## Endpoints

TBD

## Todo

- [ ] Add more examples
- [ ] Add tests
- [ ] Make better documentations
