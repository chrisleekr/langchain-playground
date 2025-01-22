// import { formatDocumentsAsString } from 'langchain/util/document';
// import { getOllamaEmbeddings, getChromaVectorStore, Logger } from '@/libraries';
// import { collectionName } from '../../langgraphRouter';
// import { AgentState } from '../[id].post';

// export const getContextsNode = (nodeLogger: Logger) => async (state: AgentState) => {
//   const logger = nodeLogger.child({ node: 'get-contexts' });

//   logger.info('Getting Vector Store...');
//   const embeddings = getOllamaEmbeddings(logger);
//   logger.info({ embeddings }, 'Got embeddings.');

//   const vectorStore = await getChromaVectorStore(embeddings, collectionName, logger);

//   const retriever = vectorStore.asRetriever();
//   logger.info({ retriever }, 'Got retriever.');

//   const relevantDocs: string[] = [];

//   for (const keyword of state.extractKeywordsOutput.keywords) {
//     const relevantDoc = await retriever.invoke(keyword);
//     logger.info({ keyword, relevantDoc }, 'Relevant documents');

//     relevantDocs.push(formatDocumentsAsString(relevantDoc));
//   }

//   const deduplicatedRelevantDocs = Array.from(new Set(relevantDocs));

//   logger.info({ deduplicatedRelevantDocs }, 'Deduplicated Relevant documents');

//   state.getContextsOutput = { contexts: deduplicatedRelevantDocs };

//   return {
//     ...state
//   };
// };
