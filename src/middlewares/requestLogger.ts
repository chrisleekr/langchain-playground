import { Request, RequestHandler, Response } from 'express';
import { getReasonPhrase, StatusCodes } from 'http-status-codes';
import { LevelWithSilent } from 'pino';
import { CustomAttributeKeys, Options, pinoHttp } from 'pino-http';
import { IncomingMessage, ServerResponse } from 'http';
import { randomUUID } from 'crypto';
import { logger } from '@/libraries';

enum LogLevel {
  Fatal = 'fatal',
  Error = 'error',
  Warn = 'warn',
  Info = 'info',
  Debug = 'debug',
  Trace = 'trace',
  Silent = 'silent'
}

type PinoCustomProps = {
  request: Request;
  response: Response;
  err: Error;
  responseBody: unknown;
};

const requestLogger = (options?: Options): RequestHandler[] => {
  const pinoOptions: Options = {
    logger,
    // If NODE_ENV is test, then we don't want to log anything.
    enabled: process.env.NODE_ENV !== 'test',
    customProps: customProps as unknown as Options['customProps'],
    redact: [],
    genReqId,
    customLogLevel,
    customSuccessMessage,
    customReceivedMessage: (req, _res) => `Request received: ${req.method} ${req.url}`,
    customErrorMessage: (req, res, _err) => `Request failed: ${req.method} ${req.url} ${res.statusCode}`,
    customAttributeKeys,
    ...options
  };
  return [responseBodyMiddleware, pinoHttp(pinoOptions)];
};

const customAttributeKeys: CustomAttributeKeys = {
  req: 'request',
  res: 'response',
  err: 'error',
  responseTime: 'timeTaken'
};

const customProps = (req: Request, res: Response): PinoCustomProps => ({
  request: req,
  response: res,
  err: res.locals.err,
  responseBody: res.locals.responseBody
});

const responseBodyMiddleware: RequestHandler = (_req, res, next) => {
  const originalSend = res.send;
  res.send = function (content) {
    res.locals.responseBody = content;
    res.send = originalSend;
    return originalSend.call(res, content);
  };
  next();
};

const customLogLevel = (_req: IncomingMessage, res: ServerResponse<IncomingMessage>, err?: Error): LevelWithSilent => {
  if (err || res.statusCode >= StatusCodes.INTERNAL_SERVER_ERROR) return LogLevel.Error;
  if (res.statusCode >= StatusCodes.BAD_REQUEST) return LogLevel.Warn;
  if (res.statusCode >= StatusCodes.MULTIPLE_CHOICES) return LogLevel.Silent;
  return LogLevel.Info;
};

const customSuccessMessage = (req: IncomingMessage, res: ServerResponse<IncomingMessage>) => {
  if (res.statusCode === StatusCodes.NOT_FOUND) return getReasonPhrase(StatusCodes.NOT_FOUND);
  return `Request completed: ${req.method} ${req.url} with status code: ${res.statusCode}`;
};

const genReqId = (req: IncomingMessage, res: ServerResponse<IncomingMessage>) => {
  const existingID = req.id ?? req.headers['x-request-id'];
  if (existingID) return existingID;
  const id = randomUUID();
  res.setHeader('X-Request-Id', id);
  return id;
};

export default requestLogger;
