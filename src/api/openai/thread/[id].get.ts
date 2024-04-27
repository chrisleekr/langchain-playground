import { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';

import { handleServiceResponse } from '@/libraries/httpHandlers';
import { ResponseStatus, ServiceResponse } from '@/models/serviceResponse';

export default function threadIdGet() {
  return async (req: Request, res: Response): Promise<Response<unknown, Record<string, unknown>>> => {
    /**
     * WIP
     */
    const { id } = req.params;
    const serviceResponse = new ServiceResponse(ResponseStatus.Success, 'OK', { id }, StatusCodes.OK);
    return handleServiceResponse(serviceResponse, res);
  };
}
