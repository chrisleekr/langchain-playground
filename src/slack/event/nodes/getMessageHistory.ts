import { PromptTemplate } from '@langchain/core/prompts';
import { z } from 'zod';
import { StructuredOutputParser } from '@langchain/core/output_parsers';
import { RunnableSequence } from '@langchain/core/runnables';
import { getConversationHistory, getConversationReplies, logger, removeThinkTag } from '@/libraries';
import { OverallStateAnnotation } from '../constants';
import { getChatLLM } from '../utils';

export const getMessageHistoryNode = async (state: typeof OverallStateAnnotation.State): Promise<typeof OverallStateAnnotation.State> => {
  const { originalMessage, client } = state;
  const { text: message, thread_ts: threadTs, channel } = originalMessage;

  const model = getChatLLM(0, logger);

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
    You are a helpful assistant that determines how many messages to retrieve from a Slack channel or thread. You must always return valid JSON based on format instructions. Do not return any additional text.

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
    - "above" -> 1 (last message)
    - "last" -> 1 (last message)
    - "this" -> 1 (last message)
    - "this thread" -> 300 (thread check, no number specified)
    - "this channel" -> 10 (channel check, no number specified)
    - "check this" -> 300 (thread check, no number specified)
    - "what did we discuss earlier?" -> 300 for thread, 10 for channel
    - "review the conversation" -> 300 for thread, 10 for channel
    - "find information" -> 300 for thread, 10 for channel

    NOT RELATED TO PREVIOUS MESSAGES:
    - "what is the weather in Melbourne?" -> null

    NOT RELATED TO TASK:
    - "how are you?" -> null
    - "hello" -> null
    - "what's up?" -> null
    - "what's new?" -> null
    - "what's happening?" -> null
    - "what's going on?" -> null
    - "what's the weather?" -> null

    EXAMPLES:
    - "Can you summarise last message" -> 1 (explicit: "last message")
    - "Can you check this" -> 300 (no explicit number)
    - "Summarise this thread" -> 300 (no explicit number, thread summarization)
    - "What did we discuss earlier?" -> 300 for thread, 10 for channel (no explicit number)
    - "Get last 10 messages" -> 10 (explicit: "last 10 messages")
    - "What is the weather?" -> null (not related to previous messages)

    Message Type:
    {message_type}

    User message:
    {message}

    Format instructions:
    {format_instructions}
  `);

  logger.info({ prompt, parser: parser.getFormatInstructions(), message }, 'getMessageHistoryNode before invoke');

  const chain = RunnableSequence.from([prompt, model, removeThinkTag, parser]);

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
    messages = await getConversationReplies(client, channel, threadTs, result.numberOfMessagesToGet + 1, {
      originalMessage,
      includeAppMention: false
    });
    logger.info({ messages }, 'getMessageHistoryNode getConversationReplies found messages');
  } else {
    // If it's not thread, then get the channel history for last 10 messages
    messages = await getConversationHistory(client, channel, result.numberOfMessagesToGet + 1, {
      originalMessage,
      includeAppMention: false
    });
    logger.info({ messages }, 'summariseThreadNode getConversationHistory found messages');
  }

  state.messageHistory = messages;

  logger.info({ state: { ...state, client: undefined } }, 'getMessageHistoryNode final state');

  return state;
};
