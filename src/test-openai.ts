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

    // eslint-disable-next-line no-process-exit
    process.exit(1);
  }
})();
