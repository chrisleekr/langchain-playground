/**
 * Test New Relic Agent
 *
 * How to run:
 *   $ npm run dev:script -- src/testAgentNewRelic.ts <issueId> [options]
 *
 * Examples:
 *   $ npm run dev:script -- src/testAgentNewRelic.ts "NR-123456"
 *   $ npm run dev:script -- src/testAgentNewRelic.ts "NR-123456" --provider=bedrock --verbose
 */
import { createAgent, ToolStrategy, type AgentMiddleware } from 'langchain';

import { logger } from '@/libraries/logger';
import { getMCPTools, closeMCPClient } from '@/libraries/mcp';
import { createAllTools } from '@/api/agent/newrelic/tools';
import { investigationSystemPrompt } from '@/api/agent/newrelic/prompts';
import { InvestigationResultSchema } from '@/api/agent/newrelic/schema';
import { AgentConfigSchema, type LLMProvider } from '@/api/agent/newrelic/config';
import {
  createErrorMiddleware,
  createObservabilityMiddleware,
  createLimiterMiddleware,
  createCostTrackerMiddleware
} from '@/api/agent/newrelic/middleware';
import { getModel } from '@/api/agent/newrelic/utils';

/** Validates the issue ID format (alphanumeric with dashes) */
const validateIssueId = (issueId: string): boolean => {
  const pattern = /^[a-zA-Z0-9-]+$/;
  return pattern.test(issueId.trim());
};

/** Parse command line arguments */
const parseArgs = () => {
  const issueId = process.argv[2]?.trim();
  const args = process.argv.slice(3);

  const options: Record<string, unknown> = {};
  args.forEach(arg => {
    if (arg.startsWith('--')) {
      const [key, value] = arg.slice(2).split('=');
      options[key.replace(/-/g, '')] = value === 'false' ? false : (value ?? true);
    }
  });

  return { issueId, options };
};

(async () => {
  const { issueId, options } = parseArgs();

  if (!issueId) {
    console.error('Usage: npm run dev:script -- src/testAgentNewRelic.ts <issueId> [options]');
    console.error('Options:');
    console.error('  --provider=PROVIDER  LLM provider: ollama (default), groq, openai, bedrock');
    console.error('  --verbose            Enable verbose logging');
    console.error('  --max-tools=N        Set max tool calls limit');
    process.exit(1);
  }

  if (!validateIssueId(issueId)) {
    console.error('Error: Invalid issue ID format. Expected alphanumeric characters and dashes.');
    console.error(`Received: "${issueId}"`);
    process.exit(1);
  }

  try {
    logger.info({ issueId, options }, 'Starting New Relic Agent test');

    // Build config from options
    const config = AgentConfigSchema.parse({
      provider: (options.provider as LLMProvider) || 'ollama',
      verboseLogging: !!options.verbose,
      maxToolCalls: options.maxtools ? Number(options.maxtools) : undefined
    });

    logger.info({ config }, 'Agent configuration');

    // Initialize model based on provider
    const model = getModel(config, logger);

    // Create tools
    logger.info('Creating New Relic tools...');
    const nrTools = createAllTools({ logger, model });
    logger.info({ count: nrTools.length }, 'New Relic tools created');

    // Load all MCP tools
    logger.info('Loading MCP tools...');
    const mcpTools = await getMCPTools(logger);
    logger.info({ count: mcpTools.length }, 'MCP tools loaded');

    // Build middleware stack
    const { middleware: costMiddleware, tracker: costTracker } = createCostTrackerMiddleware(logger, config);

    const middleware: AgentMiddleware[] = [
      createErrorMiddleware(logger),
      createObservabilityMiddleware(logger, config),
      createLimiterMiddleware(config),
      costMiddleware
    ];

    // Create agent with structured output
    logger.info('Creating investigation agent...');
    const startTime = Date.now();

    const agent = createAgent({
      model,
      tools: [...nrTools, ...mcpTools],
      systemPrompt: investigationSystemPrompt(config),
      // ToolStrategy.fromSchema wraps Zod schema for structured output via tool-calling
      // In https://docs.langchain.com/oss/javascript/langchain/structured-output#response-format, it shows
      // `responseFormat: toolStrategy(z.object({ ... }))` as the example.
      // However, it didn't work as expected. Below code is working.
      responseFormat: ToolStrategy.fromSchema(InvestigationResultSchema),
      middleware
    });

    logger.info({ issueId }, 'Starting investigation...');

    const result = await agent.invoke({ messages: [{ role: 'user', content: `Investigate New Relic issue: ${issueId}` }] }, { recursionLimit: 100 });

    const duration = Date.now() - startTime;

    // Get cost summary
    const costSummary = costTracker.getSummary();

    // Output results
    console.log('\n' + '='.repeat(80));
    console.log('INVESTIGATION RESULTS');
    console.log('='.repeat(80));
    console.log(JSON.stringify(result.structuredResponse, null, 2));
    console.log('='.repeat(80));
    console.log(`Messages: ${result.messages.length}`);
    console.log(`Duration: ${duration}ms`);

    // Output cost summary
    console.log('\n' + '-'.repeat(80));
    console.log('COST SUMMARY');
    console.log('-'.repeat(80));
    console.log(`Provider: ${costSummary.provider} | Model: ${costSummary.model}`);
    console.log(`Total Tokens: ${costSummary.totalTokens} (Input: ${costSummary.totalInputTokens}, Output: ${costSummary.totalOutputTokens})`);
    console.log(`Total Cost: $${costSummary.totalCost.toFixed(6)}`);
    console.log('\nPer-Step Breakdown:');
    costSummary.steps.forEach(step => {
      console.log(`  ${step.step}: ${step.totalTokens} tokens ($${step.cost.toFixed(6)})`);
    });

    // Cleanup MCP client
    await closeMCPClient(logger);
  } catch (err) {
    logger.error({ err }, 'Agent test failed');
    await closeMCPClient(logger);
    process.exit(1);
  }
})();
