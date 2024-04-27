import { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';

import { handleServiceResponse } from '@/libraries/httpHandlers';
import { ResponseStatus, ServiceResponse } from '@/models/serviceResponse';

export default function threadNewPost() {
  return async (_req: Request, res: Response): Promise<Response<unknown, Record<string, unknown>>> => {
    /**
     * WIP
     */
    const serviceResponse = new ServiceResponse(ResponseStatus.Success, 'OK', {}, StatusCodes.OK);
    return handleServiceResponse(serviceResponse, res);
  };
}