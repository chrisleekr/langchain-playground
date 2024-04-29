import { ParentDocumentRetriever } from 'langchain/retrievers/parent_document';
import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter';
import { Chroma } from '@langchain/community/vectorstores/chroma';
import { Logger, RedisDocstore } from '@/libraries';

const getParentDocumentRetriever = async (vectorStore: Chroma, collectionName: string, logger: Logger): Promise<ParentDocumentRetriever> => {
  const redisStore = new RedisDocstore(collectionName);
  logger.info({ redisStore }, 'Created RedisDocstore.');

  // The ParentDocumentRetriever strikes that balance by splitting and storing small chunks of data. During retrieval, it first fetches the small chunks but then looks up the parent ids for those chunks and returns those larger documents.
  logger.info('Creating ParentDocumentRetriever...');
  const retriever = new ParentDocumentRetriever({
    vectorstore: vectorStore,
    docstore: redisStore,
    parentSplitter: new RecursiveCharacterTextSplitter({
      chunkSize: 2000,
      chunkOverlap: 500
    }),
    childSplitter: new RecursiveCharacterTextSplitter({
      chunkSize: 500,
      chunkOverlap: 50
    }),
    // Optional `k` parameter to search for more child documents in VectorStore.
    // Note that this does not exactly correspond to the number of final (parent) documents
    // retrieved, as multiple child documents can point to the same parent.
    childK: 10,
    // Optional `k` parameter to limit number of final, parent documents returned from this
    // retriever and sent to LLM. This is an upper-bound, and the final count may be lower than this.
    parentK: 3
  });

  logger.info({ retriever }, 'Created ParentDocumentRetriever.');
  return retriever;
};

export { getParentDocumentRetriever };
