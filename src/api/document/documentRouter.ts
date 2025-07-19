import type { FastifyPluginAsync } from 'fastify/types/plugin';

import { createRouteSchema } from '@/libraries/httpHandlers';
import resetDelete from '@/api/document/reset.delete';
import parentQueryPost from '@/api/document/parent/query/post';
import { PostQuery } from '@/api/document/documentSchema';
import parentLoadDirectoryPut from '@/api/document/parent/load/directory.put';
import parentLoadConfluencePut from '@/api/document/parent/load/confluence.put';

const documentRouter: FastifyPluginAsync = async fastify => {
  fastify.delete('/reset', createRouteSchema({}), resetDelete());

  fastify.put('/parent/load/directory', createRouteSchema({}), parentLoadDirectoryPut());

  fastify.put('/parent/load/confluence', createRouteSchema({}), parentLoadConfluencePut());

  fastify.post('/parent/query', createRouteSchema({ body: PostQuery }), parentQueryPost());
};

export default documentRouter;
