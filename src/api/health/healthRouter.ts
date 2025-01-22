import type { FastifyPluginAsync } from 'fastify/types/plugin';
import { StatusCodes } from 'http-status-codes';

import { ResponseStatus, ServiceResponse } from '@/models/serviceResponse';
import { createRouteSchema, sendResponse } from '@/libraries/httpHandlers';

export const healthRouter: FastifyPluginAsync = async fastify => {
  fastify.get(
    '/',
    {
      ...createRouteSchema({})
    },
    async (_request, reply) => {
      await sendResponse(reply, new ServiceResponse(ResponseStatus.Success, 'OK', null, StatusCodes.OK));
    }
  );
};
