import { z } from 'zod';
import { RunnableSequence } from '@langchain/core/runnables';
import { PromptTemplate } from '@langchain/core/prompts';
import { StructuredOutputParser } from 'langchain/output_parsers';
import { Logger, getChatGroq } from '@/libraries';
import { AgentState } from '../[id].post';

const anonymisePIISystemPrompt: string = `You are a professional PII protect agent. Given a text string, replace all occurrences of Personally Identifiable Information (PII) such as names, email addresses, phone numbers, street addresses, and social security numbers with arbitrary data. The output should be JSON format and format as Output JSON properties. Do not say anything except Output format. Do not say "Here is the output". Output must be valid JSON.

Example:

Input: "Hello, my name is John Doe. My email is john.doe@example.com, my phone number is 123-456-7890, and I live at 123 Main St."

Output JSON properties:
- "originalText": "Hello, my name is John Doe. My email is john.doe@example.com, my phone number is 123-456-7890, and I live at 123 Main St."
- "anonymisedText": "Hello, my name is Jane Smith. My email is jane.smith@example.com, my phone number is 098-765-4321, and I live at 456 Elm St."
- "replacements":
  - "John Doe": "Jane Smith"
  - "john.doe@example.com": "jane.smith@example.com"
  - "123-456-7890": "098-765-4321"
  - "123 Main St.": "456 Elm St."

Format instructions:
{format_instructions}

Email content:
{customer_email}
`;

export const anonymisePIINode = (nodeLogger: Logger) => async (state: AgentState) => {
  const logger = nodeLogger.child({ node: 'anonymise-pii' });

  const parser = StructuredOutputParser.fromZodSchema(
    z.object({
      originalText: z.string().describe('The original email to be anonymised'),
      anonymisedText: z.string().describe('The anonymised email'),
      replacements: z.record(z.string()).describe('An object of replacements in the anonymised email')
    })
  );

  const model = getChatGroq(0, logger);

  const chain = RunnableSequence.from([PromptTemplate.fromTemplate(anonymisePIISystemPrompt), model, parser]);

  const result = await chain.invoke({
    customer_email: state.input,
    format_instructions: parser.getFormatInstructions()
  });
  logger.info({ result }, 'Anonymise PII result');

  state.anonymisePIIOutput = result;
  logger.info({ state }, 'State');
  return {
    ...state
  };
};
