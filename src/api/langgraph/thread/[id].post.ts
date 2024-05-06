import { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';

import { END, StateGraph } from '@langchain/langgraph';
import { handleServiceResponse } from '@/libraries/httpHandlers';
import { ResponseStatus, ServiceResponse } from '@/models/serviceResponse';
import { anonymisePIINode } from './node/anonymise-pii';
import { extractKeywordsNode } from './node/extract-keywords';
import { getContextsNode } from './node/get-contexts';
import { writeDraftEmailNode } from './node/write-draft-email';
import { shouldRewriteDraftEmailNode } from './node/should-rewrite-draft-email';
import { unAnonymisePIINode } from './node/un-anonymise-pii';

interface AgentStateAnonymisePIIOutput {
  originalText: string;
  anonymisedText: string;
  replacements: Record<string, string>;
}

interface AgentStateExtractKeywordsOutput {
  keywords: string[];
}

interface AgentStateGetContextsOutput {
  contexts: string[];
}

interface AgentStateWriteDraftEmailOutput {
  draftEmail: string;
}

interface AgentStateShouldRewriteDraftEmailOutput {
  shouldRewrite: ['rewrite', 'send'];
}

interface AgentStateUnAnonymisePIIOutput {
  finalEmail: string;
}

export interface AgentState {
  input: string;
  anonymisePIIOutput: AgentStateAnonymisePIIOutput;
  extractKeywordsOutput: AgentStateExtractKeywordsOutput;
  getContextsOutput: AgentStateGetContextsOutput;
  writeDraftEmailOutput: AgentStateWriteDraftEmailOutput;
  numberOfDraftEmailRewrites: number;
  shouldRewriteDraftEmailOutput: AgentStateShouldRewriteDraftEmailOutput;
  unAnonymisePIIOutput: AgentStateUnAnonymisePIIOutput;
}

export default function threadIdPost() {
  return async (req: Request, res: Response): Promise<Response<unknown, Record<string, unknown>>> => {
    const logger = req.log;
    const { id: threadId } = req.params;
    const { message } = req.body;
    const schema = {
      input: {
        value: null
      },
      anonymisePIIOutput: {
        value: null
      },
      extractKeywordsOutput: {
        value: null
      },
      getContextsOutput: {
        value: null
      },
      writeDraftEmailOutput: {
        value: null
      },
      numberOfDraftEmailRewrites: {
        value: null
      },
      shouldRewriteDraftEmailOutput: {
        value: null
      },
      unAnonymisePIIOutput: {
        value: null
      }
    };

    // Initialize the StateGraph with this state
    const workflow = new StateGraph({ channels: schema });

    // Anonymise PII with Ollama
    workflow.addNode('anonymise-pii-node', anonymisePIINode(logger));

    // Get the keywords for context with Groq
    workflow.addNode('extract-keywords-node', extractKeywordsNode(logger));

    // Get context from Chroma Vector
    workflow.addNode('get-contexts-node', getContextsNode(logger));

    // Write draft email with Groq
    workflow.addNode('write-draft-email-node', writeDraftEmailNode(logger));

    // Un-anonymise PII with Ollama
    workflow.addNode('un-anonymise-pii-node', unAnonymisePIINode(logger));

    // Compile the graph
    workflow.addEdge('anonymise-pii-node', 'extract-keywords-node');
    workflow.addEdge('extract-keywords-node', 'get-contexts-node');
    workflow.addEdge('get-contexts-node', 'write-draft-email-node');
    workflow.addConditionalEdges('write-draft-email-node', shouldRewriteDraftEmailNode(logger));
    workflow.addEdge('un-anonymise-pii-node', END);

    // Set the entry point of the state machine:
    workflow.setEntryPoint('anonymise-pii-node');

    const runnable = workflow.compile();

    const result = (await runnable.invoke(
      {
        input: message
      },
      {
        recursionLimit: 100
      }
    )) as AgentState;

    const response = {
      threadId,
      response: result
    };

    const serviceResponse = new ServiceResponse(ResponseStatus.Success, 'OK', response, StatusCodes.OK);
    return handleServiceResponse(serviceResponse, res);
  };
}
