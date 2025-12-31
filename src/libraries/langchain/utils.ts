import type { BaseMessage } from '@langchain/core/messages';

/**
 * Removes `<think>` tags from LLM output.
 * Used to strip chain-of-thought reasoning from models like Claude with extended thinking.
 */
export const removeThinkTag = (input: { content: string }): { content: string } => {
  return { content: input.content.replace(/<think>.*?<\/think>/gs, '').trim() };
};

/**
 * Checks if a message has valid (non-empty) content for Bedrock.
 *
 * AWS Bedrock's Converse API strictly requires non-empty content in messages.
 * LangGraph's supervisor pattern can create empty messages during handoffs.
 *
 * IMPORTANT: AI messages with tool calls are always valid, even if content is empty.
 * Tool calls can be in:
 * - `message.tool_calls` (AIMessage direct property, used by Bedrock)
 * - `message.additional_kwargs.tool_calls` (OpenAI format)
 * Filtering these breaks Bedrock's tool_use/tool_result pairing requirement.
 *
 * @param message - The message to check
 * @returns true if the message has valid content
 */
export const hasValidContent = (message: BaseMessage): boolean => {
  // AI messages with tool calls are always valid, even with empty content.
  // Check both locations where tool calls can be stored.
  // 1. Direct tool_calls property (Bedrock/Anthropic format)
  if ('tool_calls' in message) {
    const directToolCalls = (message as unknown as { tool_calls?: unknown[] }).tool_calls;
    if (directToolCalls && directToolCalls.length > 0) {
      return true;
    }
  }

  // 2. additional_kwargs.tool_calls (OpenAI format)
  const additionalToolCalls = message.additional_kwargs?.tool_calls as unknown[] | undefined;
  if (additionalToolCalls && additionalToolCalls.length > 0) {
    return true;
  }

  const content = message.content;

  // String content
  if (typeof content === 'string') {
    return content.trim().length > 0;
  }

  // Array content (structured content blocks)
  if (Array.isArray(content)) {
    // Empty array is invalid
    if (content.length === 0) {
      return false;
    }

    // Check if at least one block has non-empty content
    return content.some(block => {
      // Text block with 'text' property
      if (typeof block === 'object' && block !== null && 'text' in block) {
        const textValue = (block as { text: unknown }).text;
        return typeof textValue === 'string' && textValue.trim().length > 0;
      }
      // Tool use or image blocks are always valid
      if (typeof block === 'object' && block !== null && 'type' in block) {
        const blockType = (block as { type: unknown }).type;
        return blockType === 'tool_use' || blockType === 'image_url';
      }
      return false;
    });
  }

  return false;
};

/**
 * Filters out messages with empty content for Bedrock compatibility.
 * AWS Bedrock's Converse API throws ValidationException for empty messages.
 *
 * This filter is essential when using LangGraph's supervisor pattern with Bedrock,
 * as handoffs between agents can create messages with empty content.
 *
 * @param messages - Array of messages to filter
 * @returns Filtered array with only valid messages
 *
 * @see https://github.com/langchain-ai/langchainjs/issues/5960
 */
export const filterEmptyMessages = (messages: BaseMessage[]): BaseMessage[] => {
  return messages.filter(hasValidContent);
};

export const removeCodeBlock = (content: string): string => {
  return content
    .replace(/```\s*\n?/g, '')
    .replace(/\n?```/g, '')
    .trim();
};

export const truncateStructuredContent = (content: string, maxLength: number): string => {
  if (content.length <= maxLength) return content;

  // Try to break at paragraph boundaries
  const truncated = content.slice(0, maxLength);
  const lastParagraph = truncated.lastIndexOf('\n\n');
  const lastSentence = truncated.lastIndexOf('.');

  return lastParagraph > maxLength * 0.7 ? content.slice(0, lastParagraph) : content.slice(0, lastSentence + 1);
};

export type DocumentSource = { metadataPath: string; metadataValue: string };

// export const getDocumentSource = (document: Document): DocumentSource => {
//   if (document.metadata?.url) {
//     return { metadataPath: 'url', metadataValue: document.metadata?.url };
//   }

//   if (document.metadata.loc) {
//     return { metadataPath: 'loc', metadataValue: document.metadata.loc };
//   }
//   return { metadataPath: 'unknown', metadataValue: 'unknown' };
// };
