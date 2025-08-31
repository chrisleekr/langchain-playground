import YAML from 'yaml';
import { Logger } from 'pino';
import { PromptTemplate } from '@langchain/core/prompts';
import { ChatOllama } from '@langchain/ollama';
import { RunnableSequence } from '@langchain/core/runnables';
import { OverallStateAnnotation } from '../investigate.post';
import { removeThinkTag } from '../../../../libraries/langchain/utils';

const summarizePrompt = PromptTemplate.fromTemplate(`
<system>
You are a expert Senior Software Engineer and incident response specialist. You are given a Sentry issue and its event data. Your task is to conduct a comprehensive Root Cause Analysis (RCA) and provide actionable insights.

Your analysis must be:
- **Fast and efficient**: Focus on the most critical information
- **Logically grounded**: Base conclusions strictly on provided evidence
- **Technically accurate**: Use proper software engineering terminology
- **Precise and accurate**: Be precise and accurate
</system>

### INPUT: Sentry Issue and Event
<issue>
{issue}
</issue>

<event>
{event}
</event>

### OUTPUT FORMAT
- You need to output the root cause analysis without any other text.
- If you find an request information, then you need to include the request information.
- If you find an issue, summarize the issue in a concise way.
- If you find a event context, then it is important information, you need to include the context in the RCA. Do not ignore it.
- If you find a stacktrace, then you need to them in the RCA include the filename, function, line number, column number, error message and the stack trace from source or compiled information. Source information is better than compiled information.
- You must include impacted URL if available.
- If you find the fix, then you need to include the fix in code blocks with filename and line numbers if available. You cannot provide an fix for node_modules or external libraries.
- You don't need to include business impact assessment.
- Do not add any extra commentary or explanations
- If cannot find any root cause analysis, output \`Sorry, I cannot provide any root cause analysis.\` only without any other text.
`);

export const summarizeSentryRootCauseNode = (model: ChatOllama, nodeLogger: Logger) => {
  return async (state: typeof OverallStateAnnotation.State): Promise<typeof OverallStateAnnotation.State> => {
    const logger = nodeLogger.child({ node: 'summarize-sentry-root-cause' });

    const summarizeInvokeParams = {
      issue: YAML.stringify(state.issue, { singleQuote: true }),
      event: YAML.stringify(state.issueEvent, { singleQuote: true })
    };
    logger.info({ compiledPrompt: await summarizePrompt.format(summarizeInvokeParams) }, 'Compiled summarize prompt');
    const summarizeChain = RunnableSequence.from([summarizePrompt, model, removeThinkTag]);
    const summarizeResult = await summarizeChain.invoke(summarizeInvokeParams);
    logger.info({ summarize: summarizeResult.content }, 'Summarize investigation');
    state.investigationSummary = summarizeResult.content;

    return state;
  };
};
