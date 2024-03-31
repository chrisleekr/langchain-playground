import { z } from 'zod';

export const PostOllamaChat = z.object({
  body: z.object({
    messages: z.array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string()
      })
    )
  })
});
