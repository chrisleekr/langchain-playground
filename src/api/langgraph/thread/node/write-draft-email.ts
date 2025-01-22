// import { z } from 'zod';
// import { RunnableSequence } from '@langchain/core/runnables';
// import { PromptTemplate } from '@langchain/core/prompts';
// import { StructuredOutputParser } from 'langchain/output_parsers';
// import { Logger, getChatGroq } from '@/libraries';
// import { AgentState } from '../[id].post';

// const writeDraftEmailSystemPrompt: string = `You are a professional email writer agent who reply the customer's email. Given the email content, write a draft email to reply the customer. If the context is irrelevant, then do not use it. You never make up information that hasn't been provided by the contexts. Always sign off the emails with "Support Team". The output should be JSON format and format as Output JSON properties. Do not say anything except Output format. Do not say "Here is the output". Output must be valid JSON.

// Contexts:
// {contexts}

// Format instructions:
// {format_instructions}

// Email Content:
// {anonymised_email}
// `;

// export const writeDraftEmailNode = (nodeLogger: Logger) => async (state: AgentState) => {
//   const logger = nodeLogger.child({ node: 'write-draft-email' });

//   const parser = StructuredOutputParser.fromZodSchema(
//     z.object({
//       draftEmail: z.string().describe('The draft email')
//     })
//   );

//   const model = getChatGroq(0.5, logger);

//   const chain = RunnableSequence.from([PromptTemplate.fromTemplate(writeDraftEmailSystemPrompt), model, parser]);

//   const result = await chain.invoke({
//     anonymised_email: state.anonymisePIIOutput.anonymisedText,
//     contexts: state.getContextsOutput.contexts.join('\n'),
//     format_instructions: parser.getFormatInstructions()
//   });
//   logger.info({ result }, 'Draft email result');

//   state.writeDraftEmailOutput = result;

//   if (state.numberOfDraftEmailRewrites === null) {
//     state.numberOfDraftEmailRewrites = 0;
//   }
//   state.numberOfDraftEmailRewrites += 1;
//   logger.info({ state }, 'State');
//   return {
//     ...state
//   };
// };
