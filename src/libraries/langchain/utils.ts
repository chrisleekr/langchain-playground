// Remove <think></think>
export const removeThinkTag = (input: { content: string }): { content: string } => {
  return { content: input.content.replace(/<think>.*?<\/think>/gs, '').trim() };
};
