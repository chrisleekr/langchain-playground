import type { FastifyPluginAsync } from 'fastify/types/plugin';

import { createRouteSchema } from '@/libraries/httpHandlers';
import threadNewPost from '@/api/groq/thread/new.post';
import threadIdPost from '@/api/groq/thread/[id].post';
import threadIdGet from '@/api/groq//thread/[id].get';
import { PostGroqThreadId } from './groqSchema';

const groqRouter: FastifyPluginAsync = async fastify => {
  fastify.post('/thread', createRouteSchema({}), threadNewPost());

  fastify.get('/thread/:id', createRouteSchema({}), threadIdGet());

  fastify.post('/thread/:id', createRouteSchema({ body: PostGroqThreadId }), threadIdPost());
};

export default groqRouter;
