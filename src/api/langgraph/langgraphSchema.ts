import { z } from 'zod';

export const PostLanggraphThreadNew = z.object({
  body: z.object({})
});

export const PostLanggraphThreadId = z.object({
  params: z.object({
    id: z.string()
  }),
  body: z.object({
    message: z.string()
  })
});

export const GetLanggraphThreadId = z.object({
  params: z.object({
    id: z.string()
  })
});
