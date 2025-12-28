import { tool } from 'langchain';
import { z } from 'zod';
import YAML from 'yaml';

import { getNewRelicIssues, getNewRelicIncidents, getNewRelicAlert, normalizeContextData } from '@/libraries/newrelic';

import type { ToolOptions } from './types';

/**
 * Composite tool that fetches complete investigation context in one call.
 * Replaces: get_newrelic_issues + get_newrelic_incidents + get_newrelic_alert
 */
export const createGetInvestigationContextTool = ({ logger }: ToolOptions) => {
  return tool(
    async ({ issueIds }) => {
      const nodeLogger = logger.child({ tool: 'get_investigation_context' });
      nodeLogger.info({ issueIds }, 'Fetching complete investigation context');

      const rawIssues = await getNewRelicIssues({ issueIds });
      const issues = normalizeContextData(rawIssues as unknown as Record<string, unknown>[]);
      nodeLogger.debug({ issueCount: issues.length }, 'Issues fetched');

      const incidentIds = rawIssues.flatMap(issue => (issue.incidentIds || []).map(String));
      const incidents =
        incidentIds.length > 0 ? normalizeContextData((await getNewRelicIncidents({ incidentIds })) as unknown as Record<string, unknown>[]) : [];
      nodeLogger.debug({ incidentCount: incidents.length }, 'Incidents fetched');

      const alertIds = [
        ...new Set(incidents.map(incident => incident.conditionFamilyId as string | undefined).filter((id): id is string => Boolean(id)))
      ];
      const alerts = await Promise.all(alertIds.map(alertId => getNewRelicAlert({ alertId })));
      nodeLogger.debug({ alertCount: alerts.length }, 'Alerts fetched');

      // YAML format is returned alongside JSON for LLM consumption:
      // - YAML is more token-efficient than JSON for large nested structures
      // - LLMs parse YAML more reliably than deeply nested JSON
      // - contextYaml is passed directly to LLM prompts in subsequent tools
      const context = { issues, incidents, alerts };
      return JSON.stringify({
        ...context,
        contextYaml: YAML.stringify(context)
      });
    },
    {
      name: 'get_investigation_context',
      description:
        'Fetch complete investigation context: issues, their incidents, and alert conditions. Use this as the first step to understand the alert.',
      schema: z.object({
        issueIds: z.array(z.string()).describe('Array of New Relic issue IDs to investigate')
      })
    }
  );
};
