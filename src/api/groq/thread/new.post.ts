import { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { v4 as uuidv4 } from 'uuid';

import { handleServiceResponse } from '@/libraries/httpHandlers';
import { ResponseStatus, ServiceResponse } from '@/models/serviceResponse';

export default function threadNewPost() {
  return async (req: Request, res: Response): Promise<Response<unknown, Record<string, unknown>>> => {
    const logger = req.log;

    const threadId = uuidv4();

    logger.info({ threadId }, 'Created new thread.');

    // Note: It doesn't do anything yet. It just creates a new threadId.

    const response = {
      threadId
    };

    const serviceResponse = new ServiceResponse(ResponseStatus.Success, 'OK', response, StatusCodes.OK);
    return handleServiceResponse(serviceResponse, res);
  };
}
