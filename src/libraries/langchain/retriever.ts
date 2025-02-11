import { ParentDocumentRetriever } from 'langchain/retrievers/parent_document';

import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter';
import { Chroma } from '@langchain/community/vectorstores/chroma';
import { Logger, RedisDocstore } from '@/libraries';

/**
 * Creates a ParentDocumentRetriever instance.
 *
 * https://js.langchain.com/docs/how_to/parent_document_retriever/#with-reranking
 *
 * @param vectorStore - The vector store to use for similarity search.
 * @param collectionName - The name of the collection to use for storing and retrieving documents.
 * @param logger - The logger to use for logging.
 * @returns A Promise that resolves to a ParentDocumentRetriever instance.
 */
const getParentDocumentRetriever = async (vectorStore: Chroma, collectionName: string, logger: Logger): Promise<ParentDocumentRetriever> => {
  const redisStore = new RedisDocstore(collectionName);
  logger.info('Created RedisDocstore');

  // By setting the options in scoreThresholdOptions we can force the ParentDocumentRetriever to use the ScoreThresholdRetriever under the hood. This sets the vector store inside ScoreThresholdRetriever as the one we passed when initializing ParentDocumentRetriever, while also allowing us to also set a score threshold for the retriever.
  // const childDocumentRetriever = ScoreThresholdRetriever.fromVectorStore(vectorStore, {
  //   minSimilarityScore: 0.41,
  //   maxK: 5,
  //   kIncrement: 2
  // });

  // The ParentDocumentRetriever strikes that balance by splitting and storing small chunks of data. During retrieval, it first fetches the small chunks but then looks up the parent ids for those chunks and returns those larger documents.
  logger.info('Creating ParentDocumentRetriever...');
  const retriever = new ParentDocumentRetriever({
    vectorstore: vectorStore,
    docstore: redisStore,
    // childDocumentRetriever,
    parentSplitter: new RecursiveCharacterTextSplitter({
      chunkSize: 1500, // Balanced chunk size
      chunkOverlap: 200 // Moderate overlap
    }),
    childSplitter: new RecursiveCharacterTextSplitter({
      chunkSize: 500, // Smaller chunks for better matching
      chunkOverlap: 100 // Moderate overlap
    }),
    childK: 4, // Increased for better recall
    parentK: 2 // Allow up to 2 most relevant parent documents
  });

  logger.info({ retriever }, 'Created ParentDocumentRetriever.');
  return retriever;
};

export { getParentDocumentRetriever };
