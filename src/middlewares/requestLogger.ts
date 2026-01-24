import { type FastifyRequest, type FastifyReply } from 'fastify';
import { getReasonPhrase } from 'http-status-codes';
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

type RequestHandler = (request: FastifyRequest, reply: FastifyReply, done: () => void) => void;

const requestLogger = (): RequestHandler => {
  return (request: FastifyRequest, reply: FastifyReply, done: () => void) => {
    // Skip logging in test environment
    if (process.env.NODE_ENV === 'test') {
      done();
      return;
    }

    const requestId = request.id || randomUUID();
    reply.header('X-Request-Id', requestId);

    const startTime = process.hrtime();

    reply.raw.on('finish', () => {
      const [seconds, nanoseconds] = process.hrtime(startTime);
      const responseTime = seconds * 1000 + nanoseconds / 1000000;

      const logLevel = getLogLevel(reply.statusCode);
      const logMessage = {
        req: {
          id: requestId,
          method: request.method,
          url: request.url,
          headers: request.headers,
          remoteAddress: request.ip
        },
        res: {
          statusCode: reply.statusCode,
          responseTime
        }
      };

      // eslint-disable-next-line security/detect-object-injection -- logLevel from LogLevel enum
      const logMethod = logger[logLevel].bind(logger);
      logMethod(logMessage, `${request.method} ${request.url} ${reply.statusCode} ${getReasonPhrase(reply.statusCode)}`);
    });

    done();
  };
};

const getLogLevel = (statusCode: number): LogLevel => {
  if (statusCode >= 500) return LogLevel.Error;
  if (statusCode >= 400) return LogLevel.Warn;
  return LogLevel.Info;
};

export default requestLogger;
