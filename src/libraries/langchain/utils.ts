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
