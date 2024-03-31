import { ParentDocumentRetriever } from 'langchain/retrievers/parent_document';
import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter';
import { Embeddings } from '@langchain/core/embeddings';
import { Logger, getVectorStore, RedisDocstore } from '@/libraries';

const getRetriever = async (embeddings: Embeddings, collectionName: string, logger: Logger): Promise<ParentDocumentRetriever> => {
  logger.info('Getting Chroma Vector Store...');
  const chromaClient = await getVectorStore(embeddings, collectionName, logger);

  logger.info('Ensuring collection exists...');
  const collection = await chromaClient.ensureCollection();
  logger.info({ collection }, 'Ensured collection exists');

  const redisStore = new RedisDocstore(collectionName);

  logger.info({ redisStore }, 'Created RedisDocstore.');
  logger.info('Creating ParentDocumentRetriever...');

  // The ParentDocumentRetriever strikes that balance by splitting and storing small chunks of data. During retrieval, it first fetches the small chunks but then looks up the parent ids for those chunks and returns those larger documents.
  const retriever = new ParentDocumentRetriever({
    vectorstore: chromaClient,
    docstore: redisStore,
    parentSplitter: new RecursiveCharacterTextSplitter({
      chunkSize: 2000,
      chunkOverlap: 200
    }),
    childSplitter: new RecursiveCharacterTextSplitter({
      chunkSize: 500,
      chunkOverlap: 50
    }),
    // Optional `k` parameter to search for more child documents in VectorStore.
    // Note that this does not exactly correspond to the number of final (parent) documents
    // retrieved, as multiple child documents can point to the same parent.
    childK: 20,
    // Optional `k` parameter to limit number of final, parent documents returned from this
    // retriever and sent to LLM. This is an upper-bound, and the final count may be lower than this.
    parentK: 5
  });

  logger.info({ retriever }, 'Created ParentDocumentRetriever.');
  return retriever;
};

export { getRetriever };
