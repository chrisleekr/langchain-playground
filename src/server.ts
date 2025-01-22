import config from 'config';
import fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import compress from '@fastify/compress';
import { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import type { FastifyCorsOptions } from '@fastify/cors';
import type { RateLimitPluginOptions } from '@fastify/rate-limit';

import { errorHandler, requestLogger } from '@/middlewares';
import { healthRouter } from '@/api/health';
import { ollamaRouter } from '@/api/ollama';
import { openAIRouter } from '@/api/openai';
import { groqRouter } from '@/api/groq';
import { langgraphRouter } from '@/api/langgraph';

const app = fastify({
  logger: true,
  trustProxy: true,
  bodyLimit: 1048576, // 1MB
  maxParamLength: 100
}).withTypeProvider<TypeBoxTypeProvider>();

// Set response serializer
app.setSerializerCompiler(({ schema: _schema }) => {
  return data => JSON.stringify(data);
});

// Register plugins
app.register(cors, {
  origin: config.get<FastifyCorsOptions['origin']>('cors.origin'),
  credentials: true
});
app.register(helmet);
app.register(rateLimit, {
  max: config.get<RateLimitPluginOptions['max']>('rateLimit.maxRequests'),
  timeWindow: config.get<RateLimitPluginOptions['timeWindow']>('rateLimit.windowMs')
});
app.register(compress, {
  global: true,
  encodings: ['gzip', 'deflate']
});

// Register request logger
app.addHook('onRequest', requestLogger());

// Register routes
app.register(healthRouter, { prefix: '/health' });
app.register(ollamaRouter, { prefix: '/ollama' });
app.register(openAIRouter, { prefix: '/openai' });
app.register(groqRouter, { prefix: '/groq' });
app.register(langgraphRouter, { prefix: '/langgraph' });

// Register error handler
app.setErrorHandler(errorHandler());

export { app };
