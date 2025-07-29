import { Type } from '@sinclair/typebox';

export const PostLanggraphThreadId = Type.Object({
  message: Type.String()
});

export const PostLanggraphNewRelicInvestigate = Type.Object({
  issueId: Type.String()
});
