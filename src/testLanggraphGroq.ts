/**
 * Test LangGraph with Groq
 *
 * How to run:
 *   $ npm run dev:script src/test-langgraph-groq.ts "What is the capital city of France?"
 */
import config from 'config';

import { END, MessageGraph } from '@langchain/langgraph';
import { BaseMessage, HumanMessage } from '@langchain/core/messages';
import { logger } from '@/libraries/logger';
import { getChatGroq } from './libraries';

console.log(config);
(async () => {
  const humanMessage = process.argv[2];

  try {
    logger.info('Start...');

    const model = getChatGroq(0, logger);

    const graph = new MessageGraph();

    graph.addNode('__start__', async (state: BaseMessage[]) => {
      return model.invoke(state);
    });

    graph.addEdge('__start__', END);

    const runnable = graph.compile();

    // For Message graph, input should always be a message or list of messages.
    const input = {
      messages: [new HumanMessage(humanMessage)]
    };
    const res = await runnable.invoke(input);

    console.log(res);
  } catch (err) {
    logger.error({ err }, 'An error has occurred.');

    process.exit(1);
  }
})();
