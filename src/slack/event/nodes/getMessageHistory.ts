import { PromptTemplate } from '@langchain/core/prompts';
import { z } from 'zod';
import { StructuredOutputParser } from '@langchain/core/output_parsers';
import { RunnableSequence } from '@langchain/core/runnables';
import { getChatOllama } from '@/libraries/langchain/llm';
import { getConversationHistory, getConversationReplies, logger } from '@/libraries';
import { OverallStateAnnotation } from '../constants';

export const getMessageHistoryNode = async (state: typeof OverallStateAnnotation.State): Promise<typeof OverallStateAnnotation.State> => {
  const { event, client } = state;
  const { text: message, thread_ts: threadTs, channel } = event;

  const model = getChatOllama(0, logger);

  const parser = StructuredOutputParser.fromZodSchema(
    z.object({
      reasoningOutput: z.string().describe('The reasoning output of the number of messages to get'),
      numberOfMessagesToGet: z.number().describe('The number of messages to get from the channel or thread').nullable()
    })
  );

  // RULES:
  // - If the user message is NOT related to previous messages or conversation history, return null
  // - If the user explicitly specifies a number (e.g., "last 5 messages"), return that exact number
  // - If the user wants to summarize or review without specifying a number:
  //   * For threads: return 50 (to get comprehensive thread history)
  //   * For channels: return 10 (to get recent channel context)
  // - If the user asks for "all messages" in a thread, return 300
  // - Maximum allowed: 300 messages
  const prompt = PromptTemplate.fromTemplate(`
    You are a helpful assistant that determines how many messages to retrieve from a Slack channel or thread.

    IMPORTANT: ALWAYS prioritize explicit number mentions over task type analysis.

    Step 1: Check if the user explicitly mentions a specific number of messages
    Step 2: If no explicit number, then consider the task type

    EXPLICIT NUMBER PATTERNS (HIGHEST PRIORITY):
    - "last message" -> 1
    - "last X messages" -> X (where X is any number)
    - "previous message" -> 1
    - "previous X messages" -> X
    - "get X messages" -> X
    - "recent message" -> 1
    - "most recent message" -> 1

    TASK-BASED PATTERNS (LOWER PRIORITY - only if no explicit number):
    - "summarise this thread" -> 300 (thread summarization, no number specified)
    - "summarise this channel" -> 10 (channel summarization, no number specified)
    - "what did we discuss earlier?" -> 300 for thread, 10 for channel
    - "review the conversation" -> 300 for thread, 10 for channel
    - "find information" -> 300 for thread, 10 for channel

    NOT RELATED TO PREVIOUS MESSAGES:
    - "what is the weather in Melbourne?" -> null

    EXAMPLES:
    - "Can you summarise last message" -> 1 (explicit: "last message")
    - "Summarise this thread" -> 300 (no explicit number, thread summarization)
    - "What did we discuss earlier?" -> 300 for thread, 10 for channel (no explicit number)
    - "Get last 10 messages" -> 10 (explicit: "last 10 messages")
    - "What is the weather?" -> null (not related to previous messages)

    Format instructions:
    {format_instructions}

    Message Type: {message_type}

    User message:
    {message}
  `);

  logger.info({ prompt, parser: parser.getFormatInstructions(), message }, 'getMessageHistoryNode before invoke');

  const chain = RunnableSequence.from([prompt, model, parser]);

  const result = await chain.invoke({
    message,
    message_type: threadTs ? 'thread' : 'channel',
    format_instructions: parser.getFormatInstructions()
  });

  logger.info({ result }, 'getMessageHistoryNode after invoke');

  state.getMessageHistoryOutput = result;

  if (result.numberOfMessagesToGet === null) {
    logger.info('No messages to get, set messageHistory to empty array');

    state.messageHistory = [];
    return state;
  }

  let messages: string[] = [];

  // +1 because we want to get the last message excluding the current message
  if (threadTs) {
    messages = await getConversationReplies(client, channel, threadTs, result.numberOfMessagesToGet + 1, { event, includeAppMention: false });
    logger.info({ messages }, 'getMessageHistoryNode getConversationReplies found messages');
  } else {
    // If it's not thread, then get the channel history for last 10 messages
    messages = await getConversationHistory(client, channel, result.numberOfMessagesToGet + 1, { event, includeAppMention: false });
    logger.info({ messages }, 'summariseThreadNode getConversationHistory found messages');
  }

  state.messageHistory = messages;

  logger.info({ state: { ...state, client: undefined } }, 'getMessageHistoryNode final state');

  return state;
};
