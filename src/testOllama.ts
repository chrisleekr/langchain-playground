/**
 * Test Ollama
 *
 * How to run:
 *   $ npm run dev:script src/testOllama.ts ./data/ "What is the capital city of France?"
 *
 * Uses RunnableSequence instead of deprecated createStuffDocumentsChain and createRetrievalChain.
 *
 * @see https://js.langchain.com/docs/tutorials/rag
 */
import config from 'config';
import { ChatOllama, OllamaEmbeddings } from '@langchain/ollama';
import { MemoryVectorStore } from '@langchain/classic/vectorstores/memory';
import { UnstructuredDirectoryLoader } from '@langchain/community/document_loaders/fs/unstructured';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { RunnableSequence, RunnablePassthrough } from '@langchain/core/runnables';
import { StringOutputParser } from '@langchain/core/output_parsers';
import { Document } from '@langchain/core/documents';

import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import { logger } from '@/libraries/logger';

// Helper to format documents as string
const formatDocs = (docs: Document[]): string => {
  return docs.map(doc => doc.pageContent).join('\n\n');
};

console.log(config);
(async () => {
  // Get argument from command lines
  // Example: npm run dev /path/to/directory "What is the capital of France?"
  const directoryPath = process.argv[2];
  const humanMessage = process.argv[3];

  try {
    logger.info('Connecting to the Ollama server...');
    const chatModel = new ChatOllama({
      baseUrl: config.get('ollama.baseUrl'),
      model: config.get('ollama.model')
    });

    // docker run -p 8000:8000 -d --rm --name unstructured-api downloads.unstructured.io/unstructured-io/unstructured-api:latest --port 8000 --host 0.0.0.0
    const directoryLoader = new UnstructuredDirectoryLoader(directoryPath, {
      apiUrl: config.get('unstructuredAPI.url')
    });

    logger.info({ directoryPath }, 'Loading documents from the directory:');
    const docs = await directoryLoader.load();
    logger.info({ count: docs.length }, 'Loaded documents from the directory');

    // Split text into chunks with RecursiveCharacterTextSplitter from @langchain/textsplitters
    logger.info('Splitting text into chunks...');
    const textSplitter = new RecursiveCharacterTextSplitter({
      chunkSize: 1000,
      chunkOverlap: 200
    });

    const splitDocs = await textSplitter.splitDocuments(docs);
    logger.info({ count: splitDocs.length }, 'Documents split into chunks');

    logger.info('Creating embeddings from the documents...');
    const embeddings = new OllamaEmbeddings({
      baseUrl: config.get('ollama.baseUrl'),
      model: config.get('ollama.embeddingModel')
    });

    logger.info('Creating a vector store from the documents...');
    const vectorstore = await MemoryVectorStore.fromDocuments(splitDocs, embeddings);
    logger.info('Vector store created');

    // Create retriever
    const retriever = vectorstore.asRetriever({ k: 4 });
    logger.info('Retriever created');

    // Create prompt template
    const promptTemplate =
      config.get('ollama.documentSystemTemplate') !== ''
        ? <string>config.get('ollama.documentSystemTemplate')
        : `You must use the context. Answer the following question based only on the provided context:

<context>
{context}
</context>

Question: {input}`;

    const prompt = ChatPromptTemplate.fromTemplate(promptTemplate);

    // Build RAG chain using RunnableSequence
    logger.info('Creating RAG chain...');
    const ragChain = RunnableSequence.from([
      {
        context: retriever.pipe(formatDocs),
        input: new RunnablePassthrough()
      },
      prompt,
      chatModel,
      new StringOutputParser()
    ]);
    logger.info('RAG chain created');

    logger.info('Invoking the RAG chain...');
    const result = await ragChain.invoke(humanMessage);
    logger.info({ result }, 'RAG chain response');
  } catch (err) {
    logger.error({ err }, 'An error has occurred.');
    process.exit(1);
  }
})();
