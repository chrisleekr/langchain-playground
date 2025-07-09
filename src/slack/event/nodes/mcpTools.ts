import { createReactAgent } from '@langchain/langgraph/prebuilt';
import { StructuredOutputParser } from '@langchain/core/output_parsers';
import { z } from 'zod';
import { PromptTemplate } from '@langchain/core/prompts';
import { RunnableSequence } from '@langchain/core/runnables';
import { getMCPTools, logger, removeThinkTag } from '@/libraries';
import { OverallStateAnnotation } from '../constants';
import { getChatLLM } from '../utils';

// Router node to handle sequential execution
export const mcpToolsNode = async (state: typeof OverallStateAnnotation.State): Promise<typeof OverallStateAnnotation.State> => {
  const { originalMessage, messageHistory } = state;
  const { text: message } = originalMessage;

  logger.info({ message }, 'mcpToolsNode request');

  try {
    const mcpTools = await getMCPTools(logger);
    const model = getChatLLM(0, logger);

    const agent = createReactAgent({
      llm: model,
      tools: await getMCPTools(logger)
    });

    const parser = StructuredOutputParser.fromZodSchema(
      z.object({
        useMCPTools: z.boolean().describe('Whether to use MCP tools'),
        reasoningOutput: z.string().describe('The reasoning output of the tool selection'),
        suggestedTools: z.array(z.string()).describe('The suggested tools to use')
      })
    );

    // Examples of requests that need MCP tools:
    //   - "Calculate 25 * 47 + 132"
    //   - "Find source code from Github"

    //   Examples that don't need MCP tools:
    //   - "Summarize this conversation"
    //   - "Translate this message"
    const classifierPrompt = PromptTemplate.fromTemplate(`
      Analyze the message history and the user's request and determine if it needs MCP tools. You must always return valid JSON fenced by a markdown code block. Do not return any additional text.

      If the user request is vague, but message history contains information that can be used to answer the question, then you find relevant MCP tools and use them.

      If it's technical question, then try to use context7 to find information.

      If it's infrastructure issue, then try to use kubernetes-readonly to find information.

      If you can find any possible cause, you try to find source code from Github 'chrisleekr' organization.

      Try to use last user message as guide to determine if MCP tools are needed.

      Available MCP tools:
      {available_tools}

      Message history:
      {message_history}

      User message:
      {original_message}

      Format instructions:
      {format_instructions}
    `);

    const availableTools = mcpTools.map(tool => `- ${tool.name}: ${tool.description}`).join('\n');

    logger.info(
      { classifierPrompt, parser: parser.getFormatInstructions(), message: originalMessage.text, messageHistory, availableTools },
      'mcpToolsNode before invoke'
    );

    const chain = RunnableSequence.from([classifierPrompt, model, removeThinkTag, parser]);

    const classifierResult = await chain.invoke({
      available_tools: availableTools,
      original_message: originalMessage.text,
      message_history: messageHistory.join('\n'),
      format_instructions: parser.getFormatInstructions()
    });

    logger.info({ classifierResult }, 'mcpToolsNode after invoke');

    if (classifierResult.useMCPTools) {
      const toolResult = await agent.invoke({
        messages: [
          {
            role: 'user',
            content: `Context from message history: ${messageHistory.join('\n')}\n\nUser request: ${originalMessage.text}`
          }
        ]
      });

      logger.info({ toolResult }, 'mcpToolsNode MCP agent response');

      const finalMessage = toolResult.messages[toolResult.messages.length - 1];
      const responseContent = finalMessage.content;

      state.mcpToolsOutput = {
        useMCPTools: true,
        reasoningOutput: classifierResult.reasoningOutput,
        suggestedTools: classifierResult.suggestedTools,
        response: responseContent.toString()
      };

      state.finalResponse += `${state.finalResponse ? '\n\n' : ''}${responseContent}`;
    } else {
      // Fall back to regular processing or indicate no MCP tools needed
      state.mcpToolsOutput = {
        useMCPTools: false,
        reasoningOutput: classifierResult.reasoningOutput,
        suggestedTools: [],
        response: ''
      };
    }

    logger.info({ state: { ...state, client: undefined } }, 'mcpToolsNode final state');
  } catch (err) {
    logger.error({ err }, 'mcpToolsNode error');
    state.mcpToolsOutput = {
      useMCPTools: false,
      reasoningOutput: 'Error occurred while using MCP tools',
      suggestedTools: [],
      response: ''
    };
  }

  return state;
};
