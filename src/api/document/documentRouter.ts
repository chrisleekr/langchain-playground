import type { FastifyPluginAsync } from 'fastify/types/plugin';

import { createRouteSchema } from '@/libraries/httpHandlers';
import directoryLoadGet from '@/api/document/directory/load.get';
import confluenceLoadGet from '@/api/document/confluence/load.get';
import resetDelete from '@/api/document/reset.delete';

const documentRouter: FastifyPluginAsync = async fastify => {
  fastify.delete('/reset', createRouteSchema({}), resetDelete());

  fastify.get('/directory/load', createRouteSchema({}), directoryLoadGet());

  fastify.get('/confluence/load', createRouteSchema({}), confluenceLoadGet());
};

export default documentRouter;
