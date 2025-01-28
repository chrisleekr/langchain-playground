import type { FastifyRequest, FastifyReply } from 'fastify';
import type { Logger } from 'pino';
import { StatusCodes } from 'http-status-codes';
import { v4 as uuidv4 } from 'uuid';

import { sendResponse } from '@/libraries/httpHandlers';
import { ResponseStatus, ServiceResponse } from '@/models/serviceResponse';

export default function threadNewPost() {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const logger = request.log as Logger;
    const threadId = uuidv4();

    logger.info({ threadId }, 'Created new thread.');

    // Note: It doesn't do anything yet. It just creates a new threadId.

    await sendResponse(reply, new ServiceResponse(ResponseStatus.Success, 'OK', { threadId }, StatusCodes.OK));
  };
}
