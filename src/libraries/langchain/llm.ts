import config from 'config';
import { ChatOllama, Ollama } from '@langchain/ollama';
import { ChatGroq } from '@langchain/groq';
import { ChatOpenAI } from '@langchain/openai';
import { ChatBedrockConverse, type ChatBedrockConverseInput } from '@langchain/aws';
import { fromSSO } from '@aws-sdk/credential-providers';
import type { AwsCredentialIdentityProvider } from '@aws-sdk/types';
import type { BaseMessage } from '@langchain/core/messages';
import type { CallbackManagerForLLMRun } from '@langchain/core/callbacks/manager';
import type { ChatResult } from '@langchain/core/outputs';
import { logger, Logger } from '@/libraries';
import { filterEmptyMessages } from './utils';

/**
 * Custom ChatBedrockConverse wrapper that filters empty messages.
 *
 * AWS Bedrock's Converse API throws ValidationException when messages
 * have empty content. LangGraph's supervisor pattern can create such
 * messages during agent handoffs.
 *
 * This wrapper intercepts the message array and filters out empty
 * messages before sending to Bedrock.
 *
 * @see https://github.com/langchain-ai/langchainjs/issues/5960
 */
class ChatBedrockConverseSafe extends ChatBedrockConverse {
  constructor(fields: ChatBedrockConverseInput) {
    super(fields);
  }

  /**
   * Override _generate to filter empty messages before processing.
   * This prevents ValidationException from Bedrock's Converse API.
   */
  async _generate(messages: BaseMessage[], options: this['ParsedCallOptions'], runManager?: CallbackManagerForLLMRun): Promise<ChatResult> {
    // Filter out messages with empty content (preserves messages with tool calls)
    const filteredMessages = filterEmptyMessages(messages);

    // If all messages were filtered out, return an empty response
    if (filteredMessages.length === 0) {
      logger.warn({ originalCount: messages.length }, 'ChatBedrockConverseSafe: All messages filtered out (empty content)');
      return {
        generations: [],
        llmOutput: {
          warning: 'All messages had empty content and were filtered',
          originalMessageCount: messages.length
        }
      };
    }

    return super._generate(filteredMessages, options, runManager);
  }
}

let chatOllama: ChatOllama;
let llmOllama: Ollama;
let chatGroq: ChatGroq;
let chatOpenAI: ChatOpenAI;
let chatBedrockConverse: ChatBedrockConverseSafe;

type LLM = ChatOllama | Ollama | ChatGroq | ChatOpenAI | ChatBedrockConverseSafe;

/**
 * Gets a singleton ChatOllama instance.
 *
 * **Singleton Pattern**: This function returns a cached instance. The temperature
 * is read from config on first call and cannot be changed afterwards. Configure
 * temperature via `ollama.temperature` in your config file.
 *
 * @param logger - Logger instance for debugging
 * @returns A cached ChatOllama instance
 */
const getChatOllama = (logger: Logger): ChatOllama => {
  const temperature = config.get<number>('ollama.temperature');
  logger.info(
    {
      baseUrl: config.get('ollama.baseUrl'),
      model: config.get('ollama.model'),
      temperature
    },
    'Getting ChatOllama...'
  );
  if (!chatOllama) {
    chatOllama = new ChatOllama({
      baseUrl: config.get('ollama.baseUrl'),
      model: config.get('ollama.model'),
      temperature,
      keepAlive: config.get<number>('ollama.keepAlive')
    });
  }
  return chatOllama;
};

/**
 * Gets a singleton Ollama LLM instance.
 *
 * **Singleton Pattern**: This function returns a cached instance. The temperature
 * is read from config on first call and cannot be changed afterwards. Configure
 * temperature via `ollama.temperature` in your config file.
 *
 * @param logger - Logger instance for debugging
 * @returns A cached Ollama instance
 */
const getLLMOllama = (logger: Logger): Ollama => {
  const temperature = config.get<number>('ollama.temperature');
  logger.info(
    {
      baseUrl: config.get('ollama.baseUrl'),
      model: config.get('ollama.model'),
      temperature
    },
    'Getting LLM Ollama...'
  );
  if (!llmOllama) {
    llmOllama = new Ollama({
      baseUrl: config.get('ollama.baseUrl'),
      model: config.get('ollama.model'),
      temperature,
      keepAlive: config.get<number>('ollama.keepAlive')
    });
  }
  return llmOllama;
};

/**
 * Gets a singleton ChatGroq instance.
 *
 * **Singleton Pattern**: This function returns a cached instance. The temperature
 * is read from config on first call and cannot be changed afterwards. Configure
 * temperature via `groq.temperature` in your config file.
 *
 * @param logger - Logger instance for debugging
 * @returns A cached ChatGroq instance
 */
const getChatGroq = (logger: Logger): ChatGroq => {
  const temperature = config.get<number>('groq.temperature');
  logger.info(
    {
      model: config.get('groq.model'),
      temperature
    },
    'Getting ChatGroq...'
  );
  if (!chatGroq) {
    chatGroq = new ChatGroq({
      apiKey: config.get('groq.apiKey'),
      model: config.get('groq.model'),
      temperature
    });
  }
  return chatGroq;
};

/**
 * Gets a singleton ChatOpenAI instance.
 *
 * **Singleton Pattern**: This function returns a cached instance. The temperature
 * is read from config on first call and cannot be changed afterwards. Configure
 * temperature via `openai.temperature` in your config file.
 *
 * @param logger - Logger instance for debugging
 * @returns A cached ChatOpenAI instance
 */
const getChatOpenAI = (logger: Logger): ChatOpenAI => {
  const temperature = config.get<number>('openai.temperature');
  if (!chatOpenAI) {
    const baseURL = config.get<string>('openai.baseUrl') || undefined;
    logger.info(
      {
        baseURL: baseURL || 'Not set',
        temperature,
        model: config.get('openai.model')
      },
      'Getting OpenAI...'
    );

    chatOpenAI = new ChatOpenAI({
      apiKey: config.get('openai.apiKey'),
      temperature,
      model: config.get('openai.model'),
      configuration: {
        baseURL
      }
    });
  }
  return chatOpenAI;
};

/**
 * Gets a singleton ChatBedrockConverse instance with empty message filtering.
 *
 * Uses ChatBedrockConverseSafe wrapper to filter out empty messages
 * before sending to Bedrock's Converse API. This is required for
 * LangGraph supervisor compatibility.
 *
 * **Singleton Pattern**: This function returns a cached instance. The temperature
 * is read from config on first call and cannot be changed afterwards. Configure
 * temperature via `aws.bedrock.temperature` in your config file.
 *
 * @param logger - Logger instance
 * @returns A ChatBedrockConverseSafe instance (extends ChatBedrockConverse)
 */
const getChatBedrockConverse = (logger: Logger): ChatBedrockConverseSafe => {
  const temperature = config.get<number>('aws.bedrock.temperature');
  const maxTokens = config.get<number>('aws.bedrock.maxTokens');

  if (!chatBedrockConverse) {
    logger.info(
      { temperature, maxTokens, profile: config.get('aws.bedrock.credentials.profile') },
      'Getting ChatBedrockConverse (with empty message filter)...'
    );

    let credentials: AwsCredentialIdentityProvider;
    if (config.get<string>('aws.bedrock.credentials.profile')) {
      credentials = fromSSO({
        profile: config.get<string>('aws.bedrock.credentials.profile')
      });
    } else {
      credentials = async () => ({
        accessKeyId: config.get<string>('aws.bedrock.credentials.accessKeyId'),
        secretAccessKey: config.get<string>('aws.bedrock.credentials.secretAccessKey')
      });
    }

    // Use ChatBedrockConverseSafe to filter empty messages
    // This prevents ValidationException from Bedrock when LangGraph
    // supervisor creates empty handoff messages
    chatBedrockConverse = new ChatBedrockConverseSafe({
      model: config.get<string>('aws.bedrock.model'),
      temperature,
      maxTokens,
      region: config.get<string>('aws.bedrock.region'),
      credentials
    });
  }
  return chatBedrockConverse;
};

export { getChatOllama, getLLMOllama, getChatGroq, getChatOpenAI, getChatBedrockConverse };
export type { LLM };
