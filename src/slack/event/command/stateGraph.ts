import type { WebClient } from '@slack/web-api';
import { END, START, StateGraph } from '@langchain/langgraph';
import { SlashCommand } from '@slack/bolt';

import { OverallStateAnnotation } from './constants';
import { commandRouterNode } from './nodes/commandRouter';
import { generateRCANode } from './nodes/generateRCA';
import { finalResponseNode } from './nodes/finalResponse';

export const executeStateGraph = async (command: SlashCommand, client: WebClient): Promise<typeof OverallStateAnnotation.State> => {
  const graph = new StateGraph(OverallStateAnnotation)
    .addNode('command-router', commandRouterNode)
    .addNode('generate-rca', generateRCANode)
    .addNode('final-response', finalResponseNode)
    .addEdge(START, 'command-router')
    .addEdge('command-router', 'generate-rca')
    .addEdge('generate-rca', 'final-response')
    .addEdge('final-response', END)
    .compile();

  const result = await graph.invoke({
    command,
    client
  });

  return result;
};
