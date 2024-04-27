import { z } from 'zod';

export const PostOllamaDocumentChat = z.object({
  body: z.object({
    messages: z.array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string()
      })
    )
  })
});

export const PostOllamaThreadNew = z.object({
  body: z.object({})
});

export const PostOllamaThreadId = z.object({
  params: z.object({
    id: z.string()
  }),
  body: z.object({
    message: z.string()
  })
});

export const GetOllamaThreadId = z.object({
  params: z.object({
    id: z.string()
  })
});
