import { StructuredOutputParser } from '@langchain/core/output_parsers';
import config from 'config';
import { z } from 'zod';
import { PromptTemplate } from '@langchain/core/prompts';
import { RunnableSequence } from '@langchain/core/runnables';
import { getOllamaEmbeddings, getQdrantVectorStore, logger, removeThinkTag } from '@/libraries';
import { formatDocumentsAsString } from '@/middlewares';
import { OverallStateAnnotation } from '../constants';
import { getChatLLM } from '../utils';

export const findInformationNode = async (state: typeof OverallStateAnnotation.State): Promise<typeof OverallStateAnnotation.State> => {
  const { messageHistory, userMessage } = state;

  const collectionName = config.get<string>('document.collectionName');

  logger.info({ messageHistory }, 'Find information from RAG');

  const model = getChatLLM(0, logger);

  const keywordParser = StructuredOutputParser.fromZodSchema(
    z.object({
      reasoningOutput: z.string().describe('The reasoning output of the information found'),
      keywords: z.array(z.string()).describe('The keywords to search for')
    })
  );

  const keywordPrompt = PromptTemplate.fromTemplate(`
    Extract EXACT keywords and phrases for document retrieval. You must always return valid JSON. Do not return any additional text.

    Focus on:
    1. Specific technical terms, proper nouns, and unique identifiers
    2. Exact phrases that must appear in relevant documents
    3. Avoid generic terms unless they're critical

    Return keywords that would appear LITERALLY in relevant documents.

    Format instructions:
    {format_instructions}

    Relevant information:
    {mcp_tools_response}

    Message history:
    {message_history}

    User message:
    {user_message}
  `);

  const keywordChain = RunnableSequence.from([keywordPrompt, model, removeThinkTag, keywordParser]);

  const keywordResult = await keywordChain.invoke({
    user_message: userMessage.text,
    message_history: messageHistory.length > 0 ? messageHistory.join('\n') : '',
    mcp_tools_response: state.mcpToolsOutput?.mcpToolsResponse || '',
    format_instructions: keywordParser.getFormatInstructions()
  });

  logger.info({ keywordResult }, 'findInformationNode after invoke');

  state.findInformationOutput = {
    reasoningOutput: keywordResult.reasoningOutput,
    keywords: keywordResult.keywords,
    relevantInformation: [],
    summary: ''
  };

  logger.info({ state: { ...state, client: undefined } }, 'findInformationNode before getting relevant information');

  const embeddings = getOllamaEmbeddings(logger);

  const vectorStore = await getQdrantVectorStore(embeddings, collectionName, logger);

  state.findInformationOutput.relevantInformation.push(formatDocumentsAsString([]));

  for (const keyword of keywordResult.keywords) {
    const keywordEmbedding = await embeddings.embedQuery(keyword);
    const searchResult = await vectorStore.similaritySearchVectorWithScore(keywordEmbedding, 3);
    const relevantResults = searchResult.filter(([_doc, score]) => score > 0.7);
    logger.info({ relevantResults }, 'findInformationNode relevant results after checking score');

    if (relevantResults.length > 0) {
      const documents = searchResult.map(([doc]) => doc);
      state.findInformationOutput.relevantInformation.push(formatDocumentsAsString(documents));
      logger.info({ keyword, documents }, 'findInformationNode found relevant information');
    } else {
      logger.info({ keyword }, 'findInformationNode no relevant information found');
    }
  }

  // If no relevant information is found, return state
  if (state.findInformationOutput.relevantInformation.length === 0) {
    return state;
  }

  logger.info({ relevantInformation: state.findInformationOutput.relevantInformation }, 'findInformationNode relevant information');

  const summarizePrompt = PromptTemplate.fromTemplate(`
    You are a helpful assistant that summarizes the information found from the RAG.

    Do not return any additional text. Just return the information in markdown format.
    You must always return list of sources for the information found.
    If relevant information is not related with the message history, then ignore it.

    Message history:
    {message_history}

    Relevant information:
    {relevant_information}
  `);

  const summarizeChain = RunnableSequence.from([summarizePrompt, model, removeThinkTag]);

  const summarizeResult = await summarizeChain.invoke({
    message_history: messageHistory.length > 0 ? messageHistory.join('\n') : userMessage.text,
    relevant_information: state.findInformationOutput.relevantInformation.join('\n---\n')
  });

  logger.info({ summarizeResult }, 'findInformationNode after invoke');

  state.findInformationOutput.summary = summarizeResult.content.toString();

  state.finalResponse += `${state.finalResponse ? '\n\n' : ''}${summarizeResult.content.toString()}`;

  logger.info({ state: { ...state, client: undefined } }, 'findInformationNode final state');

  return state;
};
