import { z } from 'zod';

export const PostOpenAIThreadNew = z.object({
  body: z.object({})
});

export const PostOpenAIThreadId = z.object({
  params: z.object({
    id: z.string()
  }),
  body: z.object({
    message: z.string()
  })
});

export const GetOpenAIThreadId = z.object({
  params: z.object({
    id: z.string()
  })
});
