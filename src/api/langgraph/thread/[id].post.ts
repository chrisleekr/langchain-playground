import type { FastifyRequest, FastifyReply } from 'fastify';
import type { Logger } from 'pino';

import { StatusCodes } from 'http-status-codes';
import { StateGraph, Annotation, START, END } from '@langchain/langgraph';
import { sendResponse } from '@/libraries/httpHandlers';
import { ResponseStatus, ServiceResponse } from '@/models/serviceResponse';
import { anonymisePIINode, AnonymisePIIOutput } from './node/anonymise-pii';
import { extractKeywordsNode, ExtractKeywordsOutput } from './node/extract-keywords';
import { getContextsNode, GetContextsOutput } from './node/get-contexts';
import { unAnonymisePIINode, UnAnonymisePIIOutput } from './node/un-anonymise-pii';
import { WriteDraftEmailOutput, writeDraftEmailNode } from './node/write-draft-email';
import { shouldRewriteDraftEmailNode } from './node/should-rewrite-draft-email';

export const OverallStateAnnotation = Annotation.Root({
  customer_email: Annotation<string>,
  anonymise_pii_output: Annotation<AnonymisePIIOutput>,
  extract_keywords_output: Annotation<ExtractKeywordsOutput>,
  get_contexts_output: Annotation<GetContextsOutput>,
  write_draft_email_output: Annotation<WriteDraftEmailOutput>,
  number_of_draft_email_rewrites: Annotation<number>,
  should_rewrite_draft_email_output: Annotation<string>,
  un_anonymise_pii_output: Annotation<UnAnonymisePIIOutput>
});

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

    const graph = new StateGraph(OverallStateAnnotation)
      .addNode('anonymise-pii', anonymisePIINode(logger))
      .addNode('extract-keywords', extractKeywordsNode(logger))
      .addNode('get-contexts', getContextsNode(logger))
      .addNode('write-draft-email', writeDraftEmailNode(logger))
      .addNode('un-anonymise-pii', unAnonymisePIINode(logger))

      .addEdge(START, 'anonymise-pii')
      .addEdge('anonymise-pii', 'extract-keywords')
      .addEdge('extract-keywords', 'get-contexts')
      .addEdge('get-contexts', 'write-draft-email')
      .addConditionalEdges('write-draft-email', shouldRewriteDraftEmailNode(logger))
      .addEdge('un-anonymise-pii', END)
      .compile();

    const result = await graph.invoke({
      customer_email: message
    });

    logger.info({ result }, 'Result');

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
