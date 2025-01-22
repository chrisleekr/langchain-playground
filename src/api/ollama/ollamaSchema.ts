import { Type } from '@sinclair/typebox';

export const PostOllamaDocumentChat = Type.Object({
  messages: Type.Array(
    Type.Object({
      role: Type.Union([Type.Literal('user'), Type.Literal('assistant')]),
      content: Type.String()
    })
  )
});

export const PostOllamaThreadId = Type.Object({
  message: Type.String()
});
