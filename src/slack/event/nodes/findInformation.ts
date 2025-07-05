import { StructuredOutputParser } from '@langchain/core/output_parsers';
import z from 'zod';
import { PromptTemplate } from '@langchain/core/prompts';
import { RunnableSequence } from '@langchain/core/runnables';
import { getChatOllama, getOllamaEmbeddings, getQdrantVectorStore, logger } from '@/libraries';
import { collectionName } from '@/api/langgraph/langgraphRouter';
import { formatDocumentsAsString } from '@/middlewares';
import { OverallStateAnnotation } from '../constants';

export const findInformationNode = async (state: typeof OverallStateAnnotation.State): Promise<typeof OverallStateAnnotation.State> => {
  const { messageHistory, event } = state;

  logger.info({ messageHistory }, 'Find information from RAG');

  const model = getChatOllama(0, logger);

  const keywordParser = StructuredOutputParser.fromZodSchema(
    z.object({
      reasoningOutput: z.string().describe('The reasoning output of the information found'),
      keywords: z.array(z.string()).describe('The keywords to search for')
    })
  );

  const keywordPrompt = PromptTemplate.fromTemplate(`
    You are a helpful assistant that extracts specific, contextual keywords for information retrieval.

    YOU MUST DO THE FOLLOWING:
    1. Generate 3-5 specific keywords that are most relevant to finding information about the user's question
    2. Focus on domain-specific terms, entities, and concepts rather than generic words
    3. Consider synonyms and related terms that might appear in relevant documents
    4. Avoid overly generic terms like "information", "data", "system" unless they're essential
    5. You must always return valid JSON. Do not return any additional text.

    Format instructions:
    {format_instructions}

    Message history:
    {message_history}
  `);

  const keywordChain = RunnableSequence.from([keywordPrompt, model, keywordParser]);

  const keywordResult = await keywordChain.invoke({
    message_history: messageHistory.length > 0 ? messageHistory.join('\n') : event.text,
    format_instructions: keywordParser.getFormatInstructions()
  });

  logger.info({ keywordResult }, 'findInformationNode after invoke');

  state.findInformationFromRagOutput = {
    reasoningOutput: keywordResult.reasoningOutput,
    keywords: keywordResult.keywords,
    relevantInformation: [],
    summary: ''
  };

  logger.info({ state: { ...state, client: undefined } }, 'findInformationNode before getting relevant information');

  const embeddings = getOllamaEmbeddings(logger);

  const vectorStore = await getQdrantVectorStore(embeddings, collectionName, logger);

  // Use a more sophisticated retrieval strategy
  const retriever = vectorStore.asRetriever({
    searchType: 'similarity',
    k: 1
  });

  const combinedQuery = keywordResult.keywords.join(' OR ');

  const relevantDocs = await retriever.invoke(combinedQuery);

  if (relevantDocs.length > 0) {
    state.findInformationFromRagOutput.relevantInformation.push(formatDocumentsAsString(relevantDocs));
    logger.info({ keyword: combinedQuery, relevantDocs }, 'findInformationNode relevant information');
  } else {
    // Fall back to individual keywords
    logger.info({ keywordResult }, 'findInformationNode fall back to individual keywords');
    for (const keyword of keywordResult.keywords) {
      const relevantDoc = await retriever.invoke(keyword);
      if (relevantDoc.length > 0) {
        state.findInformationFromRagOutput.relevantInformation.push(formatDocumentsAsString(relevantDoc));
        logger.info({ keyword, relevantDoc }, 'findInformationNode relevant information');
      }
    }
  }

  logger.info({ relevantInformation: state.findInformationFromRagOutput.relevantInformation }, 'findInformationNode relevant information');

  const summarisePrompt = PromptTemplate.fromTemplate(`
    You are a helpful assistant that summarizes the information found from the RAG.

    Do not return any additional text. Just return the information in markdown format.
    You must always return list of sources for the information found.
    If relevant information is not related with the message history, then ignore it.

    Message history:
    {message_history}

    Relevant information:
    {relevant_information}
  `);

  const summariseChain = RunnableSequence.from([summarisePrompt, model]);

  const summariseResult = await summariseChain.invoke({
    message_history: messageHistory.length > 0 ? messageHistory.join('\n') : event.text,
    relevant_information: state.findInformationFromRagOutput.relevantInformation.join('\n---\n')
  });

  logger.info({ summariseResult }, 'findInformationNode after invoke');

  state.findInformationFromRagOutput.summary = summariseResult.content.toString();

  state.finalResponse += `${state.finalResponse ? '\n\n' : ''}${summariseResult.content.toString()}`;

  logger.info({ state: { ...state, client: undefined } }, 'findInformationNode final state');

  return state;
};
