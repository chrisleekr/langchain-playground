import { END, START, StateGraph } from '@langchain/langgraph';
import { logger } from '@/libraries';
import {
  finalResponseNode,
  findInformationNode,
  generalResponseNode,
  intentClassifierNode,
  intentRouterNode,
  getMessageHistoryNode,
  summariseThreadNode,
  translateMessageNode
} from './nodes';
import { routeToNextIntent } from './utils';
import { EventAppMention, OverallStateAnnotation } from './constants';

/**
 * LangGraph vs Simple Intent Classifier. Why analysis.
 *  1. LangGraph or Intent Classifier in this project both aim to route the user input to the correct node like summarizing the thread or finding the relevant information from RAG.
 *  2. Intent Classifier will be simpler and faster to implement. However, it's harder to extend to have multi-step logics such as `Summarise and then translate`. It will classify user input into a predefined SINGLE category. In addition it won't remember previous states to follow up. However, it's easier to implement and easy to debug.
 *  3. LangGraph will be moderate difficult to define the logic, but it will be easy to extend new node or edges. It's supporting stateful flow, and complex tool chaining like cyclical workflow. However, it's harder to debug without LangSmith.
 *
 *  For this project,
 *  1. do I need to have multi-step logics? No.
 *  2. do I need to have stateful flow? No.
 *  3. do I need to have complex tool chaining? No.
 *  4. do I need to have easy to debug? Yes.
 *  5. do I need to have easy to implement? Yes.
 *  6. do I need to have easy to extend? Yes.
 *  7. do I need to have easy to maintain? Yes.
 *
 *  Conclusion:
 *  However, eventually there will be more tools and may extend to more support for more tools, then LangGraph will be beneficial. So use LangGraph to route the user input to the correct node using simple intent classifier.
 *
 * `app_mention` sample event:
 *  {
 *    "user": "U9HD4Q39B",
 *    "type": "app_mention",
 *    "ts": "1751639849.280369",
 *    "client_msg_id": "2d166f2b-c8ae-47f9-aca3-8f110caa7198",
 *    "text": "<@U0942CQA55J> summarise it",
 *    "team": "T9H6PEM0T",
 *    "thread_ts": "1751201323.618479",
 *    "parent_user_id": "U9HD4Q39B",
 *    "blocks": [
 *      {
 *        "type": "rich_text",
 *        "block_id": "aEdTi",
 *        "elements": [
 *          {
 *            "type": "rich_text_section",
 *            "elements": [
 *              {
 *                "type": "user",
 *                "user_id": "U0942CQA55J"
 *              },
 *              {
 *                "type": "text",
 *                "text": " summarise it"
 *              }
 *            ]
 *          }
 *        ]
 *      }
 *    ],
 *    "channel": "C07EWAS8132",
 *    "event_ts": "1751639849.280369"
 *  }
 *
 */

const eventAppMention = async ({ event, client }: EventAppMention) => {
  try {
    logger.info({ event }, 'event app_mention');

    // Use StateGraph to determine the next action
    // If the message is a request to summarise the thread, then use the StateGraph to summarise the thread
    // Otherwise, respond with a message that the user has been mentioned saying "Sorry, I don't know what to do with that."
    const graph = new StateGraph(OverallStateAnnotation)
      .addNode('intent-classifier', intentClassifierNode)
      .addNode('intent-router', intentRouterNode)
      .addNode('get-message-history', getMessageHistoryNode)
      .addNode('summarise-thread', summariseThreadNode)
      .addNode('translate-message', translateMessageNode)
      .addNode('find-information', findInformationNode)
      .addNode('general-response', generalResponseNode)
      // final-response is always the last node to be executed
      .addNode('final-response', finalResponseNode)

      .addEdge(START, 'intent-classifier')
      .addEdge('intent-classifier', 'get-message-history')
      .addEdge('get-message-history', 'intent-router')
      .addConditionalEdges('intent-router', routeToNextIntent)
      // All intent nodes route back to the router for next intent
      .addEdge('summarise-thread', 'intent-router')
      .addEdge('translate-message', 'intent-router')
      .addEdge('find-information', 'intent-router')
      .addEdge('general-response', 'intent-router')
      .addEdge('final-response', END)
      .compile();

    const result = await graph.invoke({
      event,
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
  } catch (err) {
    logger.error({ err }, 'Error in event app_mention');

    await client.chat.postEphemeral({
      channel: event.channel,
      thread_ts: event.ts,
      user: event.user || '',
      text: `Sorry, something went wrong while trying to respond to your mention. Please try again later.`
    });
  }
};

export { eventAppMention };
