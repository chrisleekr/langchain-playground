import type { FastifyRequest, FastifyReply } from 'fastify';
import type { Logger } from 'pino';
import { StatusCodes } from 'http-status-codes';

import { Annotation, StateGraph } from '@langchain/langgraph';
import { sendResponse } from '@/libraries/httpHandlers';
import { ResponseStatus, ServiceResponse } from '@/models/serviceResponse';

// Reference:
// https://langchain-ai.github.io/langgraphjs/concepts/low_level/#multiple-schemas
export default function threadIdPost() {
  return async (
    request: FastifyRequest<{
      Params: { id: string };
      Body: { message: string };
    }>,
    reply: FastifyReply
  ): Promise<void> => {
    const logger = request.log as Logger;
    const { id: threadId } = request.params;
    const { message } = request.body;

    logger.info({ threadId, message }, 'Posting to thread.');

    const InputStateAnnotation = Annotation.Root({
      input: Annotation<string>
    });

    const OutputStateAnnotation = Annotation.Root({
      output: Annotation<string>
    });

    const OverallStateAnnotation = Annotation.Root({
      // input: Annotation<string>,
      output: Annotation<string>
    });

    const node1 = async (state: typeof InputStateAnnotation.State) => {
      return { output: state.input + 'Node1 Hello' };
    };

    const node2 = async (state: typeof OutputStateAnnotation.State) => {
      return { output: state.output + 'Node2 Hello' };
    };

    const node3 = async (state: typeof OverallStateAnnotation.State) => {
      return { output: state.output + 'Node3 Hello' };
    };

    // Initialise the StateGraph with this state
    const graphBuilder = new StateGraph({
      input: InputStateAnnotation,
      output: OutputStateAnnotation,
      stateSchema: OverallStateAnnotation
    })
      .addNode('node1', node1)
      .addNode('node2', node2)
      .addNode('node3', node3)
      .addEdge('__start__', 'node1')
      .addEdge('node1', 'node2')
      .addEdge('node2', 'node3')
      .compile();

    logger.info('Invoking graph...', { message });
    const result = await graphBuilder.invoke({ input: message });
    logger.info('Graph result...', { result });

    await sendResponse(
      reply,
      new ServiceResponse(
        ResponseStatus.Success,
        'OK',
        {
          threadId,
          response: result
        },
        StatusCodes.OK
      )
    );
  };
}
