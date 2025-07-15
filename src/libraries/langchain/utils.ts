// Remove <think></think>
export const removeThinkTag = (input: { content: string }): { content: string } => {
  return { content: input.content.replace(/<think>.*?<\/think>/gs, '').trim() };
};

export const removeJSONCodeBlock = (content: string): string => {
  return content
    .replace(/```json\s*\n?/g, '')
    .replace(/\n?```/g, '')
    .trim();
};
