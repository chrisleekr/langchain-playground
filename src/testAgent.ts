/**
 * Test Investigation Agent
 *
 * How to run:
 *   $ npm run dev:script -- src/testAgent.ts "<query>" [options]
 *
 * Examples:
 *   $ npm run dev:script -- src/testAgent.ts "Investigate New Relic issue 9c1a72bc-8932-4154-a910-5d0a1c355350"
 *   $ npm run dev:script -- src/testAgent.ts "Analyze Sentry error ABC" --provider=bedrock --verbose
 */
import slackifyMarkdown from 'slackify-markdown';
import YAML from 'yaml';
import { logger } from '@/libraries/logger';
import { AgentConfigSchema, type LLMProvider } from '@/api/agent/core';
import { investigate } from '@/api/agent/services';

/** Parse command line arguments */
const parseArgs = () => {
  const query = process.argv[2]?.trim();
  const args = process.argv.slice(3);

  const options: Record<string, unknown> = {};
  args.forEach(arg => {
    if (arg.startsWith('--')) {
      const [key, value] = arg.slice(2).split('=');
      options[key.replace(/-/g, '')] = value === 'false' ? false : (value ?? true);
    }
  });

  return { query, options };
};

(async () => {
  const { query, options } = parseArgs();

  if (!query) {
    console.error('Usage: npm run dev:script -- src/testAgent.ts "<query>" [options]');
    console.error('');
    console.error('Examples:');
    console.error('  npm run dev:script -- src/testAgent.ts "Investigate New Relic issue 9c1a72bc-8932-4154-a910-5d0a1c355350"');
    console.error('  npm run dev:script -- src/testAgent.ts "Analyze Sentry error ABC" --provider=bedrock');
    console.error('');
    console.error('Options:');
    console.error('  --provider=PROVIDER  LLM provider: bedrock (default), ollama, groq, openai');
    console.error('  --verbose            Enable verbose logging');
    console.error('  --max-tools=N        Set max tool calls limit');
    console.error('  --newrelic=false     Disable New Relic agent');
    console.error('  --sentry=false       Disable Sentry agent');
    process.exit(1);
  }

  try {
    logger.info({ query: query.substring(0, 100), options }, 'Starting investigation');

    // Build config from options
    const config = AgentConfigSchema.parse({
      provider: (options.provider as LLMProvider) || 'bedrock',
      verboseLogging: !!options.verbose,
      maxToolCalls: options.maxtools ? Number(options.maxtools) : undefined
    });

    logger.info({ config }, 'Agent configuration');

    // Run investigation using the shared service
    const result = await investigate({
      query,
      config,
      logger,
      enableNewRelic: options.newrelic !== false,
      enableSentry: options.sentry !== false
    });

    // Output results
    console.log('\n' + '='.repeat(80));
    console.log('INVESTIGATION RESULTS');
    console.log('='.repeat(80));
    console.log('\nQuery:', result.query);
    console.log('\n--- INVESTIGATION SUMMARY ---');
    console.log(slackifyMarkdown(YAML.stringify(result.structuredSummary)));
    console.log('\n' + '='.repeat(80));
    console.log(`Messages: ${result.messageCount}`);
    console.log(`Duration: ${result.durationMs}ms`);

    // Output cost summary if available
    if (result.costSummary) {
      console.log('\n' + '-'.repeat(80));
      console.log('COST SUMMARY');
      console.log('-'.repeat(80));
      console.log(`Provider: ${result.costSummary.provider} | Model: ${result.costSummary.model}`);
      console.log(
        `Total Tokens: ${result.costSummary.totalTokens} (Input: ${result.costSummary.totalInputTokens}, Output: ${result.costSummary.totalOutputTokens})`
      );
      console.log(`Total Cost: $${result.costSummary.totalCost.toFixed(6)}`);
      console.log('\nPer-Step Breakdown:');
      result.costSummary.steps.forEach(step => {
        console.log(`  ${step.step}: ${step.totalTokens} tokens ($${step.cost.toFixed(6)})`);
      });
    }

    process.exit(0);
  } catch (err) {
    logger.error({ err }, 'Investigation failed');
    process.exit(1);
  }
})();
