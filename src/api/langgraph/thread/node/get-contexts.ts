import { formatDocumentsAsString } from 'langchain/util/document';
import { getOllamaEmbeddings, getQdrantVectorStore, Logger } from '@/libraries';
import { collectionName } from '../../langgraphRouter';
import { OverallStateAnnotation } from '../[id].post';

export interface GetContextsOutput {
  contexts: string[];
}

export const getContextsNode =
  (nodeLogger: Logger) =>
  async (state: typeof OverallStateAnnotation.State): Promise<typeof OverallStateAnnotation.State> => {
    const logger = nodeLogger.child({ node: 'get-contexts' });

    logger.info('Getting Vector Store...');
    const embeddings = getOllamaEmbeddings(logger);
    logger.info({ embeddings }, 'Got embeddings.');

    const vectorStore = await getQdrantVectorStore(embeddings, collectionName, logger);

    const retriever = vectorStore.asRetriever();
    logger.info({ retriever }, 'Got retriever.');

    const relevantDocs: string[] = [];

    for (const keyword of state.extract_keywords_output.keywords) {
      logger.info({ keyword }, 'Getting relevant documents...');
      const relevantDoc = await retriever.invoke(keyword);
      logger.info({ keyword, relevantDoc }, 'Got relevant documents.');

      relevantDocs.push(formatDocumentsAsString(relevantDoc));
    }

    const deduplicatedRelevantDocs = Array.from(new Set(relevantDocs));

    logger.info({ deduplicatedRelevantDocs }, 'Deduplicated Relevant documents');

    state.get_contexts_output = { contexts: deduplicatedRelevantDocs };

    return state;
  };
