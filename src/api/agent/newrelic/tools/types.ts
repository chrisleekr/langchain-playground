import type { Logger } from 'pino';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';

export interface ToolOptions {
  logger: Logger;
}

export interface LLMToolOptions extends ToolOptions {
  model: BaseChatModel;
}
