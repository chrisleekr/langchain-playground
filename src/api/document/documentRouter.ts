import type { FastifyPluginAsync } from 'fastify/types/plugin';

import { createRouteSchema } from '@/libraries/httpHandlers';
import loadParentDocumentRetrieverDirectoryPut from '@/src/api/document/load/parent/directory.put';
import loadParentDocumentRetrieverConfluencePut from '@/src/api/document/load/parent/confluence.put';
import resetDelete from '@/api/document/reset.delete';
import queryParentPost from '@/src/api/document/query/parent.post';
import { PostQuery } from '@/api/document/documentSchema';

const documentRouter: FastifyPluginAsync = async fastify => {
  fastify.delete('/reset', createRouteSchema({}), resetDelete());

  fastify.put('/load/parent/directory', createRouteSchema({}), loadParentDocumentRetrieverDirectoryPut());

  fastify.put('/load/parent/confluence', createRouteSchema({}), loadParentDocumentRetrieverConfluencePut());

  fastify.post('/query/parent', createRouteSchema({ body: PostQuery }), queryParentPost());
};

export default documentRouter;
