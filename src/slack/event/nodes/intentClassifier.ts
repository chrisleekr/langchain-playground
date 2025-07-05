import { PromptTemplate } from '@langchain/core/prompts';
import { StructuredOutputParser } from 'langchain/output_parsers';
import { RunnableSequence } from '@langchain/core/runnables';
import { z } from 'zod';
import { logger } from '@/libraries';
import { getChatOllama } from '@/libraries/langchain/llm';
import { OverallStateAnnotation, intentToNodeMap } from '../constants';

export const intentClassifierNode = async (state: typeof OverallStateAnnotation.State): Promise<typeof OverallStateAnnotation.State> => {
  const { event, client } = state;
  const { text: message } = event;

  // React to the user message first
  const { channel, ts: messageTs, user: userId } = event;

  await client.reactions.add({
    channel,
    name: 'eyes',
    timestamp: messageTs
  });

  logger.info({ channel, messageTs, userId }, 'Reaction added');

  const model = getChatOllama(0, logger);

  const parser = StructuredOutputParser.fromZodSchema(
    z.object({
      reasoningOutput: z.string().describe('The reasoning output of the intent classifier'),
      intentsToExecute: z.array(z.string()).describe('The intents to execute')
    })
  );

  // getFormatInstructions() is a method that returns the format instructions for the parser
  // - https://v03.api.js.langchain.com/classes/_langchain_core.output_parsers.StructuredOutputParser.html#getFormatInstructions
  const prompt = PromptTemplate.fromTemplate(`
    You are a helpful assistant that can classify the intent of a message. If you cannot find any intent that matches the user message, then return the intent "final-response". Analyze the user message and classify it into multiple intents of these intents:

    Available intents:
    ${Object.values(intentToNodeMap)
      .map(intent => `${intent.node} - ${intent.description}`)
      .join('\n')}

    Format instructions:
    {format_instructions}

    User message:
    {message}
    `);

  logger.info({ prompt, parser: parser.getFormatInstructions(), message }, 'intentClassifierNode before invoke');

  const chain = RunnableSequence.from([prompt, model, parser]);

  const result = await chain.invoke({
    message,
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
