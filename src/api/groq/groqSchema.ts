import { z } from 'zod';

export const PostGroqThreadNew = z.object({
  body: z.object({})
});

export const PostGroqThreadId = z.object({
  params: z.object({
    id: z.string()
  }),
  body: z.object({
    message: z.string()
  })
});

export const GetGroqThreadId = z.object({
  params: z.object({
    id: z.string()
  })
});
