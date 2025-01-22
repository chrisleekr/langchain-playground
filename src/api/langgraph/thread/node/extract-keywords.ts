// import { z } from 'zod';

// import { RunnableSequence } from '@langchain/core/runnables';
// import { PromptTemplate } from '@langchain/core/prompts';
// import { StructuredOutputParser } from 'langchain/output_parsers';
// import { Logger, getChatGroq } from '@/libraries';
// import { AgentState } from '../[id].post';

// const extractKeywordsSystemPrompt: string = `You are a professional who can work out best keywords to ask our knowledge agent to get the best information for the customer. Given the email, extract one to three important keywords from the email. The keywords must be equal or less than 3 strings and no preamble or explanation. The keywords are to ask our knowledge system, not to the customer. The output should be JSON format and format as Output JSON properties. Do not say anything except Output format. Do not say "Here is the output". Output must be valid JSON.

// Example:

// Input: "Hello, my name is John Doe. I want to know how to cook a korean food"

// Output JSON properties:
// - "keywords":
//   - "How to cook"
//   - "Ingredients"
//   - "Korean food"

// Format instructions:
// {format_instructions}

// Email content:
// {customer_email}
// `;

// export const extractKeywordsNode = (nodeLogger: Logger) => async (state: AgentState) => {
//   const logger = nodeLogger.child({ node: 'extract-keywords' });

//   const parser = StructuredOutputParser.fromZodSchema(
//     z.object({
//       keywords: z.array(z.string()).describe('The keywords extracted from the email')
//     })
//   );

//   const model = getChatGroq(0, logger);

//   const chain = RunnableSequence.from([PromptTemplate.fromTemplate(extractKeywordsSystemPrompt), model, parser]);

//   const result = await chain.invoke({
//     customer_email: state.input,
//     format_instructions: parser.getFormatInstructions()
//   });
//   logger.info({ result }, 'Extract Keywords result');

//   state.extractKeywordsOutput = result;

//   logger.info({ state }, 'State');
//   return {
//     ...state
//   };
// };
