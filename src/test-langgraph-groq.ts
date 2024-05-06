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

    graph.addNode('oracle', async (state: BaseMessage[]) => {
      return model.invoke(state);
    });

    graph.addEdge('oracle', END);

    graph.setEntryPoint('oracle');

    const runnable = graph.compile();

    // For Message graph, input should always be a message or list of messages.
    const res = await runnable.invoke(new HumanMessage(humanMessage));

    console.log(res);
  } catch (err) {
    logger.error({ err }, 'An error has occurred.');

    // eslint-disable-next-line no-process-exit
    process.exit(1);
  }
})();
