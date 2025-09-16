import type { FastifyRequest, FastifyReply } from 'fastify';
import type { Logger } from 'pino';
import { StatusCodes } from 'http-status-codes';
import { Document } from '@langchain/core/documents';
import { PromptTemplate } from '@langchain/core/prompts';
import { StructuredOutputParser } from '@langchain/core/output_parsers';
import { RunnableSequence } from '@langchain/core/runnables';
import z from 'zod';
import { AmazonKnowledgeBaseRetriever } from '@langchain/aws';
import { getChatBedrockConverse, removeThinkTag, LLM, truncateStructuredContent, removeCodeBlock } from '@/libraries';
import { sendResponse } from '@/libraries/httpHandlers';
import { ServiceResponse, ResponseStatus } from '@/models/serviceResponse';
import { getAmazonKnowledgeBaseRetriever } from '@/libraries/langchain/retrievers';
import { fetchDocumentChunksBySource } from '@/libraries/aws';
import { QueryVariation } from './types';

/**
 * This endpoint is to answer the query by finding relevant documents from vector store and generating answer using LLM.
 * @returns
 */
export default function bedrockKnowledgeBaseQueryPost() {
  return async (
    request: FastifyRequest<{
      Body: {
        query: string;
      };
    }>,
    reply: FastifyReply
  ): Promise<void> => {
    const startTime = Date.now();
    const logger = request.log as Logger;

    try {
      const { query: userQuery } = request.body;

      // Validate input
      if (!userQuery || userQuery.trim().length === 0) {
        await sendResponse(reply, new ServiceResponse(ResponseStatus.Failed, 'Query cannot be empty', null, StatusCodes.BAD_REQUEST));
        return;
      }

      const model = getChatBedrockConverse({ temperature: 0, maxTokens: 1000 }, logger);
      const retriever = await getAmazonKnowledgeBaseRetriever({ topK: 3 }, logger);

      // Generates query variations with query and weight using LLM. Weight is used to indicate the relevance of the query variation. Higher weight = more relevant.
      const queryVariations = await generateQueryVariations(userQuery, model, logger);
      logger.info({ originalQuery: userQuery, variations: queryVariations }, 'Generated query variations');

      // Retrieves documents from Amazon Knowledge Base.
      const searchResults = await invokeAmazonKnowledgeBaseRetriever(queryVariations, retriever, logger);
      logger.info({ searchResults }, 'Search results');

      // Verifies if the documents are relevant to the query variations using LLM.
      const relevantDocuments = await verifyDocuments(queryVariations, searchResults, model, logger);
      logger.info({ relevantDocuments }, 'Relevant documents');

      // Generate answer with query variations and relevant documents.
      const answer = await generateAnswer(queryVariations, relevantDocuments, model, logger);
      logger.info({ answer }, 'Answer');

      const responseData = {
        answer,
        queryVariations,
        searchResults,
        relevantDocuments,
        metadata: {
          totalResults: relevantDocuments.length,
          processingTime: Date.now() - startTime,
          query: userQuery
        }
      };

      logger.info(
        { query: userQuery, resultsCount: relevantDocuments.length, processingTime: responseData.metadata.processingTime },
        'Search completed successfully'
      );

      await sendResponse(reply, new ServiceResponse(ResponseStatus.Success, 'Query executed successfully', responseData, StatusCodes.OK));
    } catch (error) {
      logger.error(
        {
          error: {
            name: error instanceof Error ? error.name : 'Unknown error',
            message: error instanceof Error ? error.message : 'Unknown error',
            stack: error instanceof Error ? error.stack : undefined
          },
          query: request.body.query
        },
        'Error processing query'
      );
      await sendResponse(reply, new ServiceResponse(ResponseStatus.Failed, 'Internal server error', null, StatusCodes.INTERNAL_SERVER_ERROR));
    }
  };
}

async function generateQueryVariations(query: string, model: LLM, logger: Logger): Promise<Array<QueryVariation>> {
  try {
    const queryVariationParser = StructuredOutputParser.fromZodSchema(
      z.object({
        reasoning: z.string().describe('Brief reasoning about the query analysis and variation strategy'),
        variations: z
          .array(
            z.object({
              query: z.string().describe('The alternative query variation'),
              weight: z.number().min(0.1).max(1.0).describe('Relevance weight between 0.1 and 1.0, where 1.0 is most relevant'),
              purpose: z.string().describe('Why this variation was created (e.g., "broader search", "specific terminology", etc.)')
            })
          )
          .max(4)
          .describe('Array of 2 query variations including the original')
      })
    );

    const queryVariationPrompt = PromptTemplate.fromTemplate(`
<system>
You are a query creation agent. You will be provided a query what it searches over. The user will provide you a query, and your job is to determine the optimal query to use based on the user's query. You must return 2 query variations.
</system>

<query>
{query}
</query>

{format_instructions}
`);

    const invokeParams = {
      query,
      format_instructions: queryVariationParser.getFormatInstructions()
    };

    logger.info({ compiledPrompt: await queryVariationPrompt.format(invokeParams) }, 'Query variation compiled prompt');

    const queryVariationChain = RunnableSequence.from([queryVariationPrompt, model, removeThinkTag, queryVariationParser]);

    const result = await queryVariationChain.invoke(invokeParams);

    logger.info({ reasoning: result.reasoning }, 'Query variation reasoning');

    const variations: Array<QueryVariation> = result.variations.map(v => ({ query: v.query, weight: v.weight }));

    // Add original query with weight 1.0
    // return [{ query: query, weight: 1 }, ...variations];
    return variations;
  } catch (error) {
    logger.error({ error }, 'Error generating LLM query variations, falling back to rule-based');
    throw error;
  }
}

async function invokeAmazonKnowledgeBaseRetriever(
  queryVariations: Array<QueryVariation>,
  retriever: AmazonKnowledgeBaseRetriever,
  logger: Logger
): Promise<Array<Document>> {
  // Batch process to avoid any bottle neck by processing one query variation at a time.
  logger.info('Retrieving documents from Amazon Knowledge Base');
  const retrieverPromises = queryVariations.map(queryVariation => retriever.invoke(queryVariation.query));
  const retrieverResults = await Promise.allSettled(retrieverPromises);
  logger.info({ retrieverResults }, 'Retrieving documents from Amazon Knowledge Base completed');

  const matchedDocs = new Map<string, Document>();

  const uniqueRelevantResults = new Map<string, Document>();
  await Promise.all(
    retrieverResults.map(async result => {
      logger.info({ result }, 'Retriever result');
      if (result.status === 'fulfilled') {
        result.value.forEach(doc => {
          uniqueRelevantResults.set(doc.metadata.source, doc);
        });
      }
    })
  );

  await Promise.all(
    Array.from(uniqueRelevantResults.values()).map(async (doc: Document) => {
      logger.info({ doc }, 'Document');
      // Fetch full document from vector store opensearch
      const fullDocument = await fetchDocumentChunksBySource(doc.metadata.source, logger);
      logger.info({ fullDocument }, 'Full document');
      matchedDocs.set(doc.metadata.source, { ...doc, pageContent: fullDocument });
    })
  );

  logger.info({ matchedDocs }, 'Matched docs');

  return Array.from(matchedDocs.values());
}

async function verifyDocuments(
  queryVariations: Array<QueryVariation>,
  documents: Array<Document>,
  model: LLM,
  logger: Logger
): Promise<Array<Document>> {
  const verifyDocumentsParser = StructuredOutputParser.fromZodSchema(
    z.object({
      isRelevant: z.boolean().describe('Whether the document is relevant to the query'),
      confidence: z.number().min(0).max(1).describe('Confidence score between 0 and 1'),
      reasoning: z.string().describe('Brief reasoning about the relevance assessment')
    })
  );

  // This prompt is simplified to focus on the document relevance to the query variations.
  // Lengthy prompt does not work well with lengthy documents.
  const verifyDocumentsPrompt = PromptTemplate.fromTemplate(`
<system>
Analyze if this document is relevant to the query variations below.
</system>

<query_variations>
{query_variations}
</query_variations>

<document>
{document}
</document>

{format_instructions}

You must always return valid JSON fenced by a markdown code block. Do not return any additional text.
`);

  // Batch process to avoid any bottle neck by processing one document at a time.
  logger.info('Verifying documents');
  const verifyDocumentsPromises = documents.map(async document => {
    const invokeParams = {
      query_variations: queryVariations.map(v => `${v.query} (weight: ${v.weight})`).join('\n'),
      document: truncateStructuredContent(removeCodeBlock(document.pageContent), 100000), // Context length: 120000
      format_instructions: verifyDocumentsParser.getFormatInstructions()
    };

    const verifyDocumentsChain = RunnableSequence.from([verifyDocumentsPrompt, model, removeThinkTag, verifyDocumentsParser]);

    const result = await verifyDocumentsChain.invoke(invokeParams);

    return {
      document,
      result
    };
  });
  const verifyDocumentsResults = await Promise.allSettled(verifyDocumentsPromises);
  logger.info({ verifyDocumentsResults }, 'Verifying documents completed');

  const relevantDocuments: Array<Document> = [];

  verifyDocumentsResults.forEach(result => {
    if (result.status === 'fulfilled') {
      // Only include relevant documents for query variations.
      if (result.value.result.isRelevant) {
        relevantDocuments.push({ ...result.value.document, metadata: { ...result.value.document.metadata, relevance: result.value.result } });
      }
    }
  });

  // Sort documents by relevance confidence and return top 3
  relevantDocuments.sort((a, b) => (b.metadata.relevance?.confidence || 0) - (a.metadata.relevance?.confidence || 0));
  const topRelevantDocuments = relevantDocuments.slice(0, 3);

  logger.info({ topRelevantDocuments: topRelevantDocuments.length }, 'Verifying documents completed');

  return topRelevantDocuments;
}

async function generateAnswer(
  queryVariations: Array<QueryVariation>,
  relevantDocuments: Array<Document>,
  model: LLM,
  logger: Logger
): Promise<string> {
  if (relevantDocuments.length === 0) {
    logger.info('No relevant documents provided');
    return "I couldn't find any relevant information to answer your question.";
  }

  const answerPrompt = PromptTemplate.fromTemplate(`
<system>
You are a software expert, highly accurate, and reliable information synthesizer. Your primary function is to provide comprehensive answers that DIRECTLY address the user's specific question based *exclusively* on the provided documents.

Query-Focused Response Guidelines:
- Your #1 priority is answering the PRIMARY QUERY completely and directly
- Start your response by directly addressing the main question asked
- Use a step-by-step approach: analyze the query → find relevant information → synthesize a focused answer
- After addressing the primary query, enhance your response using the additional query variations ONLY if they help provide a more complete answer to the main question

Strict Document Adherence:
- NEVER infer, assume, or generate content beyond what is explicitly written in the provided documents
- If the requested information is not explicitly present, state "The documents do not contain information on this topic"
- Prioritize factual accuracy and direct relevance to the user's query
</system>

<contextual_information>
Here are the relevant documents for your reference:

{documents}
</contextual_information>

<task>
Follow these steps to ensure you directly answer the user's question:

**Step 1: Query Analysis**
Identify the core question being asked in the primary query: {primary_query}
Use these additional variations to ensure completeness of your answer to the PRIMARY query:
{additional_variations}

**Step 2: Document Mining**
Extract information from the documents that DIRECTLY relates to answering questions. If the document does not contain information on the question, do not include it in your answer.

**Step 3: Response Enhancement**
Use these additional variations to ensure completeness of your answer to the PRIMARY query:
{additional_variations}

**Step 5: Verification**
Before finalizing, verify: "Does my response directly answer the primary query '{primary_query}'?"

Your response requirements:
1. **Lead with the direct answer** to the primary query in the first paragraph. Do not include any other text before the answer.
2. Structure information to support that main answer. Try to use step-by-step approach.
3. For every claim, cite the document URL as a markdown link.
4. Only include information that helps answer the primary query or its variations.
5. If the query requires reasoning, show your step-by-step thought process focused on the question asked. Do not need tell how you get the answer.
</task>

Answer the primary query now:
`);

  const primaryQuery = queryVariations[0].query;
  const additionalVariations = queryVariations
    .slice(1)
    .map(v => `- ${v.query} (weight: ${v.weight})`)
    .join('\n');

  const documentsText = relevantDocuments
    .map((doc, index) => {
      const confidence = doc.metadata.relevance?.confidence || 0;
      const confidenceLabel = confidence > 0.8 ? 'High' : confidence > 0.6 ? 'Medium' : 'Low';

      return `Document ${index + 1} (Confidence: ${confidenceLabel} - ${confidence.toFixed(2)}):
Source: ${doc.metadata.url || doc.metadata.pdf?.info?.Title || 'Unknown'}
Content: ${truncateStructuredContent(doc.pageContent, 20000)}`; // Context length: 128000, and 3 relevant documents, so try with 20000
    })
    .join('\n\n---\n\n');

  const invokeParams = {
    primary_query: primaryQuery,
    additional_variations: additionalVariations,
    documents: documentsText
  };

  logger.info({ compiledPrompt: await answerPrompt.format(invokeParams) }, 'Answer compiled prompt');

  const answerChain = RunnableSequence.from([answerPrompt, model, removeThinkTag]);

  logger.info('Generating answer');
  const result = await answerChain.invoke(invokeParams);
  logger.info({ result }, 'Answer generated');

  return result.content;
}
