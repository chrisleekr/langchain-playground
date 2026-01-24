import { z } from 'zod';
import { RunnableSequence } from '@langchain/core/runnables';
import { PromptTemplate } from '@langchain/core/prompts';
import { StructuredOutputParser } from '@langchain/core/output_parsers';
import { Logger, getChatGroq } from '@/libraries';
import { OverallStateAnnotation } from '../[id].post';
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

export interface AnonymisePIIOutput {
  originalText: string;
  anonymisedText: string;
  replacements: Record<string, string>;
}

export const anonymisePIINode =
  (nodeLogger: Logger) =>
  async (state: typeof OverallStateAnnotation.State): Promise<typeof OverallStateAnnotation.State> => {
    const logger = nodeLogger.child({ node: 'anonymise-pii' });

    logger.info({ state }, 'OverallStateAnnotation.State');
    if (!state.customer_email) {
      throw new Error('User input is required');
    }

    const parser = StructuredOutputParser.fromZodSchema(
      z.object({
        originalText: z.string().describe('The original email to be anonymised'),
        anonymisedText: z.string().describe('The anonymised email'),
        replacements: z.record(z.string()).describe('An object of replacements in the anonymised email')
      })
    );

    // TODO: Uncomment this when we have a fast model for Ollama
    // const model = getChatOllama(logger);
    const model = getChatGroq(logger);
    const chain = RunnableSequence.from([PromptTemplate.fromTemplate(anonymisePIISystemPrompt), model, parser]);

    logger.info(
      { anonymisePIISystemPrompt, state, customer_email: state.customer_email, format_instructions: parser.getFormatInstructions() },
      'Invoking chain'
    );

    const result = await chain.invoke({
      customer_email: state.customer_email,
      format_instructions: parser.getFormatInstructions()
    });
    logger.info({ result }, 'Invoked chain');

    // Initialize the overall state
    state.anonymise_pii_output = result;
    return state;
  };
