import type { FastifyPluginAsync } from 'fastify/types/plugin';

import { createRouteSchema } from '@/libraries/httpHandlers';
import resetDelete from '@/api/document/reset.delete';
import queryPost from '@/api/document/query/post';
import { PostQuery } from '@/api/document/documentSchema';
import loadDirectoryPut from '@/api/document/load/directory.put';
import loadConfluencePut from '@/api/document/load/confluence.put';
import loadMarkdownPut from '@/api/document/load/markdown.put';

const documentRouter: FastifyPluginAsync = async fastify => {
  fastify.delete('/reset', createRouteSchema({}), resetDelete());

  fastify.put('/load/directory', createRouteSchema({}), loadDirectoryPut());
  fastify.put('/load/markdown', createRouteSchema({}), loadMarkdownPut());
  fastify.put('/load/confluence', createRouteSchema({}), loadConfluencePut());

  fastify.post('/query', createRouteSchema({ body: PostQuery }), queryPost());
};

export default documentRouter;
