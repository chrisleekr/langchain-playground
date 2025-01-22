/**
 * Test OpenAI
 *
 * How to run:
 *   $ npm run dev:script src/test-openai.ts "What is the capital city of France?"
 */
import config from 'config';
import { ChatOpenAI } from '@langchain/openai';
import { logger } from '@/libraries/logger';

console.log(config);
(async () => {
  const humanMessage = process.argv[2];

  try {
    logger.info('Connecting to the ChatGPT server...');

    const model = new ChatOpenAI({
      temperature: 0.9,
      configuration: {
        baseURL: config.get('openai.baseUrl')
      },
      openAIApiKey: config.get('openai.apiKey')
    });

    const message = await model.invoke(humanMessage);

    console.log(message);
  } catch (err) {
    logger.error({ err }, 'An error has occurred.');

    process.exit(1);
  }
})();
