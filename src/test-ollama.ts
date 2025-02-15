/**
 * Test Ollama
 *
 * How to run:
 *   $ npm run dev:script src/test-ollama.ts ./data/ "What is the capital city of France?"
 */
import config from 'config';
import { ChatOllama, OllamaEmbeddings } from '@langchain/ollama';
import { MemoryVectorStore } from 'langchain/vectorstores/memory';
import { UnstructuredDirectoryLoader } from '@langchain/community/document_loaders/fs/unstructured';
import { createStuffDocumentsChain } from 'langchain/chains/combine_documents';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { createRetrievalChain } from 'langchain/chains/retrieval';

import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter';
import { logger } from '@/libraries/logger';

console.log(config);
(async () => {
  // Get argument from command lines
  // Example: npm run dev /path/to/directory "What is the capital of France?"
  const directoryPath = process.argv[2];
  const humanMessage = process.argv[3];

  try {
    logger.info('Connecting to the Ollama server...');
    const chatModel = new ChatOllama({
      baseUrl: config.get('ollama.baseUrl'), // Default value
      model: config.get('ollama.model')
    });

    // docker run -p 8000:8000 -d --rm --name unstructured-api downloads.unstructured.io/unstructured-io/unstructured-api:latest --port 8000 --host 0.0.0.0
    const directoryLoader = new UnstructuredDirectoryLoader(directoryPath, {
      apiUrl: config.get('unstructuredAPI.url')
    });

    logger.info({ directoryPath }, 'Loading documents from the directory:');
    const docs = await directoryLoader.load();
    logger.info({ docs }, 'Loaded documents from the directory:');

    /* Additional steps : Split text into chunks with any TextSplitter. You can then use it as context or save it to memory afterwards. */
    logger.info('Splitting text into chunks...');
    // Text Splitter — RecursiveCharacterTextSplitter: A tool from LangChain used to split long documents into smaller chunks for easier processing.
    const textSplitter = new RecursiveCharacterTextSplitter({
      chunkSize: 1000,
      chunkOverlap: 200
    });
    logger.info({ textSplitter }, 'Splitting text into chunks...done');

    logger.info('Splitting documents into chunks...');
    const splitDocs = await textSplitter.splitDocuments(docs);
    // console.log({ splitDocs });
    logger.info({ splitDocs }, 'Splitting documents into chunks...done');

    logger.info('Creating embeddings from the documents...');
    const embeddings = new OllamaEmbeddings({
      baseUrl: config.get('ollama.baseUrl'), // Default value
      model: config.get('ollama.embeddingModel')
    });
    logger.info({ embeddings }, 'Creating embeddings from the documents...done');

    logger.info('Creating a vector store from the documents...');
    const vectorstore = await MemoryVectorStore.fromDocuments(splitDocs, embeddings);
    logger.info({ vectorstore }, 'Creating a vector store from the documents...done');

    const prompt = ChatPromptTemplate.fromTemplate(
      config.get('ollama.documentSystemTemplate') !== ''
        ? <string>config.get('ollama.documentSystemTemplate')
        : `You must use the context. Do not make Answer the following question based only on the provided context:

<context>
{context}
</context>

Question: {input}`
    );

    logger.info({ prompt }, 'Creating a document chain...');
    const documentChain = await createStuffDocumentsChain({
      llm: chatModel,
      prompt
    });
    logger.info({ documentChain }, 'Creating a document chain...done');

    logger.info('Creating a retriever...');
    const retriever = vectorstore.asRetriever();
    logger.info({ retriever }, 'Creating a retriever...done');

    logger.info('Creating a retrieval chain...');
    const retrievalChain = await createRetrievalChain({
      combineDocsChain: documentChain,
      retriever
    });
    logger.info({ retrievalChain }, 'Creating a retrieval chain...done');

    logger.info('Invoking the retrieval chain...');
    const result = await retrievalChain.invoke({
      input: humanMessage
    });
    logger.info({ result }, 'Invoking the retrieval chain...done');

    logger.info(result.answer, 'Answer:');
  } catch (err) {
    logger.error({ err }, 'An error has occurred.');

    process.exit(1);
  }
})();
