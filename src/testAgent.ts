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
    console.error('  --research=false     Disable Research agent');
    console.error('  --awsecs=false       Disable AWS ECS agent');
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
      enableSentry: options.sentry !== false,
      enableResearch: options.research !== false,
      enableAwsEcs: options.awsecs !== false
    });

    // Output results
    console.log('\n' + '='.repeat(80));
    console.log('INVESTIGATION RESULTS');
    console.log('='.repeat(80));
    console.log('\nQuery:', result.query);
    console.log('\n--- INVESTIGATION SUMMARY ---');
    console.log(result.rawSummary);
    console.log('\n' + '='.repeat(80));
    console.log(`Messages: ${result.messageCount}`);
    console.log(`Duration: ${result.durationMs}ms`);

    // Output trace summary
    const { trace } = result;
    console.log('\n' + '-'.repeat(80));
    console.log('TRACE SUMMARY');
    console.log('-'.repeat(80));
    console.log(`Provider: ${trace.summary.provider} | Model: ${trace.summary.model}`);
    console.log(`Total Tokens: ${trace.summary.totalTokens}`);
    console.log(`Total Cost: $${trace.summary.totalCost.toFixed(6)}`);
    console.log(`LLM Calls: ${trace.summary.llmCallCount} | Tool Executions: ${trace.summary.toolExecutionCount}`);
    console.log(`Trace Duration: ${trace.summary.totalDurationMs}ms`);

    console.log('\nExecution Timeline:');
    trace.steps.forEach(step => {
      if (step.type === 'llm_call') {
        const toolCalls = step.toolCallsDecided ? ` → [${step.toolCallsDecided.join(', ')}]` : '';
        console.log(
          `  [${step.order}] LLM (${step.agent ?? 'unknown'}): ${step.totalTokens} tokens, ${step.durationMs}ms, $${step.cost.toFixed(6)}${toolCalls}`
        );
      } else {
        const status = step.success ? '✓' : `✗ ${step.error}`;
        console.log(`  [${step.order}] Tool ${step.toolName} (${step.agent ?? 'unknown'}): ${step.durationMs}ms ${status}`);
      }
    });

    process.exit(0);
  } catch (err) {
    logger.error({ err }, 'Investigation failed');
    process.exit(1);
  }
})();
