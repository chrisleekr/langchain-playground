/**
 * Test LangGraph with Groq
 *
 * How to run:
 *   $ npm run dev:script src/testLanggraphGroq.ts "What is the capital city of France?"
 */
import config from 'config';

import { Annotation, END, START, StateGraph } from '@langchain/langgraph';
import { BaseMessage, HumanMessage } from '@langchain/core/messages';
import { logger } from '@/libraries/logger';
import { getChatGroq } from './libraries';

const StateAnnotation = Annotation.Root({
  messages: Annotation<BaseMessage[]>({
    reducer: (current, update) => [...current, ...update],
    default: () => []
  }),
  response: Annotation<string>({
    reducer: (_, update) => update,
    default: () => ''
  })
});

console.log(config);
(async () => {
  const humanMessage = process.argv[2];

  try {
    logger.info('Start...');

    const model = getChatGroq(logger);

    const graph = new StateGraph(StateAnnotation)
      .addNode('oracle', async state => {
        const result = await model.invoke(state.messages);
        const content = typeof result.content === 'string' ? result.content : JSON.stringify(result.content);
        return { response: content };
      })
      .addEdge(START, 'oracle')
      .addEdge('oracle', END);

    const runnable = graph.compile();

    const res = await runnable.invoke({
      messages: [new HumanMessage(humanMessage)]
    });

    console.log('Response:', res.response);
  } catch (err) {
    logger.error({ err }, 'An error has occurred.');

    process.exit(1);
  }
})();
