// Remove <think></think>
export const removeThinkTag = (input: { content: string }): { content: string } => {
  return { content: input.content.replace(/<think>.*?<\/think>/gs, '').trim() };
};

export const removeCodeBlock = (content: string): string => {
  return content
    .replace(/```\s*\n?/g, '')
    .replace(/\n?```/g, '')
    .trim();
};
