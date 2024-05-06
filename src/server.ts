import config from 'config';
import cors from 'cors';
import express, { Express } from 'express';
import helmet from 'helmet';
import bodyParser from 'body-parser';

import { errorHandler, rateLimiter, requestLogger } from '@/middlewares';
import { healthRouter } from '@/src/api/health';
import { ollamaRouter } from '@/src/api/ollama';
import { openAIRouter } from '@/src/api/openai';
import { groqRouter } from '@/src/api/groq';
import { langgraphRouter } from '@/src/api/langgraph';

const app: Express = express();

app.set('trust proxy', true);
app.use(cors({ origin: config.get('cors.origin'), credentials: true }));
app.use(helmet());
app.use(bodyParser.json());
app.use(rateLimiter);
app.use(requestLogger());

// Routes
app.use('/health', healthRouter);
app.use('/ollama', ollamaRouter);
app.use('/openai', openAIRouter);
app.use('/groq', groqRouter);
app.use('/langgraph', langgraphRouter);

app.use(errorHandler());

export { app };
