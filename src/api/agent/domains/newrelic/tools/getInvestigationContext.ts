import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import YAML from 'yaml';

import { getNewRelicIssues, getNewRelicIncidents, getNewRelicAlert, normalizeContextData } from '@/libraries/newrelic';
import { withTimeout, getErrorMessage, DEFAULT_STEP_TIMEOUT_MS } from '@/api/agent/core';
import { createToolSuccess, createToolError } from '@/api/agent/domains/shared/toolResponse';

import type { DomainToolOptions } from '@/api/agent/domains/shared/types';

/**
 * UUID regex pattern for validating New Relic issue IDs.
 * New Relic issue IDs are UUIDs, not to be confused with trace IDs (32 hex chars).
 *
 * @see https://docs.newrelic.com/docs/apis/nerdgraph/examples/nerdgraph-issues-api/
 */
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Composite tool that fetches complete investigation context in one call.
 * Replaces: get_newrelic_issues + get_newrelic_incidents + get_newrelic_alert
 */
export const createGetInvestigationContextTool = (options: DomainToolOptions) => {
  const { logger, stepTimeoutMs = DEFAULT_STEP_TIMEOUT_MS } = options;

  return tool(
    async ({ issueIds }) => {
      const nodeLogger = logger.child({ tool: 'get_investigation_context' });
      nodeLogger.info({ issueIds, stepTimeoutMs }, 'Fetching complete investigation context');

      try {
        // Fetch issues with timeout protection
        const rawIssues = await withTimeout(() => getNewRelicIssues({ issueIds }), stepTimeoutMs, 'getNewRelicIssues');
        const issues = normalizeContextData(rawIssues as unknown as Record<string, unknown>[]);
        nodeLogger.debug({ issueCount: issues.length }, 'Issues fetched');

        // Fetch incidents with timeout protection
        const incidentIds = rawIssues.flatMap(issue => (issue.incidentIds || []).map(String));
        const incidents =
          incidentIds.length > 0
            ? normalizeContextData(
                (await withTimeout(() => getNewRelicIncidents({ incidentIds }), stepTimeoutMs, 'getNewRelicIncidents')) as unknown as Record<
                  string,
                  unknown
                >[]
              )
            : [];
        nodeLogger.debug({ incidentCount: incidents.length }, 'Incidents fetched');

        // Fetch alerts with timeout protection
        const alertIds = [
          ...new Set(incidents.map(incident => incident.conditionFamilyId as string | undefined).filter((id): id is string => Boolean(id)))
        ];
        const alerts = await Promise.all(
          alertIds.map(alertId => withTimeout(() => getNewRelicAlert({ alertId }), stepTimeoutMs, 'getNewRelicAlert'))
        );
        nodeLogger.debug({ alertCount: alerts.length }, 'Alerts fetched');

        // YAML format is returned alongside JSON for LLM consumption:
        // - YAML is more token-efficient than JSON for large nested structures
        // - LLMs parse YAML more reliably than deeply nested JSON
        // - contextYaml is passed directly to LLM prompts in subsequent tools
        const context = { issues, incidents, alerts };
        return createToolSuccess({
          ...context,
          contextYaml: YAML.stringify(context)
        });
      } catch (error) {
        const message = getErrorMessage(error);
        nodeLogger.error({ error: message }, 'Failed to fetch investigation context');
        return createToolError('get_investigation_context', message);
      }
    },
    {
      name: 'get_investigation_context',
      description:
        'Fetch complete investigation context: issues, their incidents, and alert conditions. Use this as the first step to understand the alert. Requires issue IDs in UUID format (not trace IDs).',
      schema: z.object({
        issueIds: z
          .array(
            z.string().refine(id => UUID_REGEX.test(id), {
              message:
                'Issue ID must be a valid UUID format (e.g., 123e4567-e89b-12d3-a456-426614174000). Trace IDs (32 hex chars) are not issue IDs - use generate_trace_logs_query for trace IDs instead.'
            })
          )
          .min(1)
          .max(50)
          .describe('Array of New Relic issue IDs (UUID format) to investigate. Do NOT use trace IDs here.')
      })
    }
  );
};
