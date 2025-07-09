import { PromptTemplate } from '@langchain/core/prompts';
import { StructuredOutputParser } from 'langchain/output_parsers';
import { RunnableSequence } from '@langchain/core/runnables';
import { z } from 'zod';
import { logger, removeThinkTag } from '@/libraries';
import { OverallStateAnnotation, intentToNodeMap } from '../constants';
import { getChatLLM } from '../utils';

export const intentClassifierNode = async (state: typeof OverallStateAnnotation.State): Promise<typeof OverallStateAnnotation.State> => {
  const { originalMessage, client } = state;

  // React to the user message first
  const { channel, ts: messageTs } = originalMessage;

  await client.reactions.add({
    channel,
    name: 'eyes',
    timestamp: messageTs
  });

  logger.info({ channel, messageTs }, 'Reaction added');

  const model = getChatLLM(0, logger);

  const parser = StructuredOutputParser.fromZodSchema(
    z.object({
      reasoningOutput: z.string().describe('The reasoning output of the intent classifier'),
      intentsToExecute: z.array(z.string()).describe('The intents to execute')
    })
  );

  // getFormatInstructions() is a method that returns the format instructions for the parser
  // - https://v03.api.js.langchain.com/classes/_langchain_core.output_parsers.StructuredOutputParser.html#getFormatInstructions
  const prompt = PromptTemplate.fromTemplate(`
    You are a helpful assistant that can classify the intent of a message. If you cannot find any intent that matches the user message, then return the intent "general-response". You must always return valid JSON based on format instructions. Do not return any additional text. Analyze the user message and classify it into multiple intents of these intents:

    If the user message is vague, but message history contains information that can be used to answer the question, then you find relevant intents and use them.

    Try to use last user message as guide to determine if MCP tools are needed.

    Available intents:
    ${Object.values(intentToNodeMap)
      .map(intent => `${intent.node} - ${intent.description}`)
      .join('\n')}

    Message history:
    {message_history}

    User message:
    {original_message}

    Format instructions:
    {format_instructions}
    `);

  logger.info({ prompt, parser: parser.getFormatInstructions(), message: originalMessage.text }, 'intentClassifierNode before invoke');

  const chain = RunnableSequence.from([prompt, model, removeThinkTag, parser]);

  const result = await chain.invoke({
    original_message: originalMessage.text,
    message_history: state.messageHistory.join('\n'),
    format_instructions: parser.getFormatInstructions()
  });

  logger.info({ result }, 'intentClassifierNode after invoke');

  state.intentClassifierOutput = result;
  state.intentsToExecute = result.intentsToExecute.length > 0 ? result.intentsToExecute : ['general-response'];

  state.currentIntentIndex = -1; // Nothing executed yet.
  state.executedIntents = []; // Nothing executed yet.

  // Initialize the final response to empty string
  state.finalResponse = '';

  logger.info({ state: { ...state, client: undefined } }, 'intentClassifierNode final state');

  return state;
};
