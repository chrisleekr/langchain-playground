import { END, START, StateGraph } from '@langchain/langgraph';
import type { WebClient } from '@slack/web-api';
import { logger } from '@/libraries';
import { NormalizedMessage, OverallStateAnnotation } from './constants';
import { intentClassifierNode } from './nodes/intentClassifier';
import { intentRouterNode } from './nodes/intentRouter';
import { getMessageHistoryNode } from './nodes/getMessageHistory';
import { mcpToolsNode } from './nodes/mcpTools';
import { summarizeNode } from './nodes/summarize';
import { translateNode } from './nodes/translate';
import { findInformationNode } from './nodes/findInformation';
import { generalResponseNode } from './nodes/generalResponse';
import { finalResponseNode } from './nodes/finalResponse';
import { routeToNextIntent } from './utils';

export const executeStateGraph = async (userMessage: NormalizedMessage, client: WebClient): Promise<typeof OverallStateAnnotation.State> => {
  // Use StateGraph to determine the next action
  // If the message is a request to summarize the thread, then use the StateGraph to summarize the thread
  // Otherwise, respond with a message that the user has been mentioned saying "Sorry, I don't know what to do with that."
  const graph = new StateGraph(OverallStateAnnotation)
    .addNode('intent-classifier', intentClassifierNode)
    .addNode('intent-router', intentRouterNode)
    .addNode('get-message-history', getMessageHistoryNode)
    .addNode('mcp-tools', mcpToolsNode)
    .addNode('summarize', summarizeNode)
    .addNode('translate', translateNode)
    .addNode('find-information', findInformationNode)
    .addNode('general-response', generalResponseNode)
    // final-response is always the last node to be executed
    .addNode('final-response', finalResponseNode)

    .addEdge(START, 'get-message-history')
    .addEdge('get-message-history', 'intent-classifier')
    .addEdge('intent-classifier', 'mcp-tools')
    .addEdge('mcp-tools', 'intent-router')
    .addConditionalEdges('intent-router', routeToNextIntent)
    // All intent nodes route back to the router for next intent
    .addEdge('translate', 'intent-router')
    .addEdge('find-information', 'intent-router')
    .addEdge('general-response', 'intent-router')
    .addEdge('summarize', 'intent-router')
    .addEdge('final-response', END)
    .compile();

  const result = await graph.invoke({
    userMessage,
    client
  });

  logger.info(
    {
      result: {
        ...result,
        client: undefined
      }
    },
    'After invoke'
  );

  return result;
};
