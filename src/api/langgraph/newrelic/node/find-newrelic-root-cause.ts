import config from 'config';
import { Logger } from 'pino';
import YAML from 'yaml';
import { RunnableSequence } from '@langchain/core/runnables';
import { PromptTemplate } from '@langchain/core/prompts';
import { ChatOllama } from '@langchain/ollama';

import { removeThinkTag } from '@/libraries/langchain/utils';
import { normalizeContextData } from '@/libraries/newrelic';
import { OverallStateAnnotation } from '../investigate.post';

// This is very inefficient. Since it's simply getting the timeline, can make it faster by using simple parser instead of LLM.
const envoyTimelinePrompt = PromptTemplate.fromTemplate(`
<system>
You are a professional log analyst. Your task is to analyze the logs and identify the timeline of the alerting request. Your analysis must be **fast**, **logically grounded**, and **strictly based on the provided logs and trace data**.
</system>

### INPUT: Envoy Logs (YAML)
<envoy_logs>
{envoy_logs}
</envoy_logs>

### OUTPUT FORMAT:
- For each log, output the following information:
[<timestampFormatted>] <direction> <service>-<container_name>
  ↳ Duration: <duration>ms
  ↳ Response Code: <responseCode>
  ↳ Req: <message>
  ↳ UA: <userAgent>

- If no logs, output \`No envoy logs found\`.

- After listing entries, append:
  **Request Flow Summary**: \`service-A\` → \`service-B\` → …

- Do not include any extra text or commentary.
`);

// This is key prompt. It's used to get the service error logs by analyzing the service logs that is unstructured.
const serviceErrorLogsPrompt = PromptTemplate.fromTemplate(`
<system>
You are a professional log analyst. Your task is to analyze the logs and identify the service error logs. Your analysis must be **fast**, **logically grounded**, and **strictly based on the provided logs and trace data**
</system>

### INPUT: Service Logs (YAML)
<service_logs>
{service_logs}
</service_logs>

### OUTPUT FORMAT
- Error can be a stack trace or a message.
- For each error log, output the following information:
  [<timestampFormatted>] <service>-<container_name>
  ↳ Message: "<message>"
  ↳ Error: "<error>" (if available)
  ↳ (Optional) other properties (if important)

- If no logs, output \`No service logs found\`.
- Do not add any extra commentary or explanations.
`);

// This is very inefficient. Since it's simply getting the urls, can make it faster by using simple parser instead of LLM.
const getRelevantURLsPrompt = PromptTemplate.fromTemplate(`
<system>
You are a professional log analyst. Your task is to analyze the logs and identify the URLs from the distributed trace logs. Your analysis must be **fast**, **logically grounded**, and **strictly based on the provided logs and trace data**
</system>

### INPUT: URL Logs (YAML)
<url_logs>
{url_logs}
</url_logs>

### OUTPUT FORMAT
{additional_instructions}
- Group URLs by type.
- You need to output the URLs from the url logs without any other text.
- If cannot find any URLs, output \`No URLs found\`.
- Do not add any extra commentary or explanations.
`);

const summarizePrompt = PromptTemplate.fromTemplate(`
<system>
You are a professional Senior Reliability Engineer. Your task is to summarize the investigation and identify the root cause of the alerting request. Your analysis must be **fast**, **logically grounded**, and **strictly based on the provided logs and trace data**
</system>

### INPUT: Investigation Context
<contextual_information>
{context_data}
</contextual_information>

<envoy_timeline>
{envoy_timeline}
</envoy_timeline>

<service_error_logs>
{service_error_logs}
</service_error_logs>

<relevant_urls>
{relevant_urls}
</relevant_urls>

### OUTPUT FORMAT
- You need to output the investigation summary without any other text.
  - You must include relevant urls if available.
- Do not add any extra commentary or explanations.
- If cannot find any investigation summary, output \`Sorry, I cannot provide any investigation summary.\`.
`);

export const findNewRelicRootCauseNode = (model: ChatOllama, nodeLogger: Logger) => {
  return async (state: typeof OverallStateAnnotation.State): Promise<typeof OverallStateAnnotation.State> => {
    const logger = nodeLogger.child({ node: 'find-newrelic-root-cause' });

    // Get the service interactions that are related to the alerting request.
    const envoyTimelineInvokeParams = {
      envoy_logs: YAML.stringify(state.envoyLogs)
    };
    logger.info({ compiledPrompt: await envoyTimelinePrompt.format(envoyTimelineInvokeParams) }, 'Compiled envoy timeline prompt');
    const envoyTimelineChain = RunnableSequence.from([envoyTimelinePrompt, model, removeThinkTag]);
    const envoyTimelineResult = await envoyTimelineChain.invoke(envoyTimelineInvokeParams);
    logger.info({ envoyTimeline: envoyTimelineResult.content }, 'Analyze envoy timeline');
    state.envoyTimeline = envoyTimelineResult.content;

    // Get the service error logs that are related to the alerting request.
    const serviceErrorLogsInvokeParams = {
      service_logs: YAML.stringify(state.serviceLogs)
    };
    logger.info({ compiledPrompt: await serviceErrorLogsPrompt.format(serviceErrorLogsInvokeParams) }, 'Compiled service error logs prompt');
    const serviceErrorLogsChain = RunnableSequence.from([serviceErrorLogsPrompt, model, removeThinkTag]);
    const serviceErrorLogsResult = await serviceErrorLogsChain.invoke(serviceErrorLogsInvokeParams);
    logger.info({ serviceErrorLogs: serviceErrorLogsResult.content }, 'Analyze service error logs');
    state.serviceErrorLogs = serviceErrorLogsResult.content;

    // Get relevant URLs
    const getRelevantURLsInvokeParams = {
      url_logs: YAML.stringify(state.urlLogs),
      additional_instructions: config.get<string>('newrelic.getRelevantURLs.additionalInstructions')
    };
    logger.info({ compiledPrompt: await getRelevantURLsPrompt.format(getRelevantURLsInvokeParams) }, 'Compiled get relevant URLs prompt');
    const getRelevantURLsChain = RunnableSequence.from([getRelevantURLsPrompt, model, removeThinkTag]);
    const relevantURLsResult = await getRelevantURLsChain.invoke(getRelevantURLsInvokeParams);
    logger.info({ relevantURLs: relevantURLsResult.content }, 'Get relevant URLs');
    state.relevantURLs = relevantURLsResult.content;

    // Summarize the investigation
    const contextData = YAML.stringify({
      issues: normalizeContextData(state.issues as unknown as Record<string, unknown>[]),
      incidents: normalizeContextData(state.incidents as unknown as Record<string, unknown>[]),
      alertNRQLCondition: normalizeContextData([state.alertNRQLCondition as unknown as Record<string, unknown>])
    });

    const summarizeInvokeParams = {
      context_data: contextData,
      envoy_timeline: state.envoyTimeline,
      service_error_logs: state.serviceErrorLogs,
      relevant_urls: state.relevantURLs
    };
    logger.info({ compiledPrompt: await summarizePrompt.format(summarizeInvokeParams) }, 'Compiled summarize prompt');
    const summarizeChain = RunnableSequence.from([summarizePrompt, model, removeThinkTag]);
    const summarizeResult = await summarizeChain.invoke(summarizeInvokeParams);
    logger.info({ summarize: summarizeResult.content }, 'Summarize investigation');
    state.investigationSummary = summarizeResult.content;

    return state;
  };
};
