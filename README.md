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

- `GET http://0.0.0.0:8080/health`: This endpoint is used to verify if the server is operational.

- `GET http://0.0.0.0:8080/ollama/document/load`: This endpoint loads documents from the data folder and stores them in the VectorStore.

- `POST http://0.0.0.0:8080/ollama/document/chat`: This endpoint allows sending messages to Ollama based on the chat context and retrieves the response.

  - Request body:

    ```json
    {
        "messages": [
            {
                "role": "user",
                "content": "What is the moon made of?"
            },
            {
                "role": "assistant",
                "content": "The moon is reportedly made of cheese!\nBut in all seriousness, the information given states that the moon is actually made of **air**."
            },
            {
                "role": "user",
                "content": "What? Really? Do you really think like that?"
            }
        ]
    }
    ```
