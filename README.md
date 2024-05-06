# A LangChain playground using TypeScript

This is a simple example of how to use LangChain with TypeScript.

## How to start

```bash
docker-compose up -d --build
```

This will launch the following services:

- [ollama](https://ollama.com/): Ollama enables the execution of LLM models locally.
- [openweb-ui](https://docs.openwebui.com/): OpenWeb UI is a self-hosted WebUI that interacts with Ollama.
- [unstructured-api](https://github.com/Unstructured-IO/unstructured-api): The Unstructured API is designed to ingest/digest files of various types and sizes.
- [chroma](https://www.trychroma.com/): Chroma serves as an embedding database.
- [redis](https://redis.io/): Redis is an open-source in-memory data structure store.

## Endpoints

TBD

## Todo

- [ ] Add more examples
- [ ] Add tests
- [ ] Make better documentations
