import type { FastifyRequest, FastifyReply } from 'fastify';
import type { Logger } from 'pino';
import { StatusCodes } from 'http-status-codes';
import config from 'config';
import { Document } from '@langchain/core/documents';
import { StructuredOutputParser } from '@langchain/core/output_parsers';
import { PromptTemplate } from '@langchain/core/prompts';
import { RunnableSequence } from '@langchain/core/runnables';
import z from 'zod';
import { QdrantVectorStore } from '@langchain/qdrant';
import {
  getChatOllama,
  getOllamaEmbeddings,
  getParentDocumentRetriever,
  getQdrantVectorStore,
  removeCodeBlock,
  removeThinkTag,
  LLM,
  truncateStructuredContent,
  DocumentSource
} from '@/libraries';
import { sendResponse } from '@/libraries/httpHandlers';
import { ServiceResponse, ResponseStatus } from '@/models/serviceResponse';
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

      const model = getChatOllama(0, logger);
      const embeddings = getOllamaEmbeddings(logger);
      const collectionName = config.get<string>('document.collectionName');
      const vectorStore = await getQdrantVectorStore(embeddings, collectionName, logger);

      // Generates query variations with query and weight using LLM. Weight is used to indicate the relevance of the query variation. Higher weight = more relevant.
      const queryVariations = await generateQueryVariations(userQuery, model, logger);
      logger.info({ originalQuery: userQuery, variations: queryVariations }, 'Generated query variations');

      // Retrieves documents from vector store by query variations using Qdrant.
      const searchResults = await invokeParentDocumentRetriever(queryVariations, vectorStore, collectionName, logger);
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
          .describe('Array of 2-4 query variations including the original')
      })
    );

    const queryVariationPrompt = PromptTemplate.fromTemplate(`
You are an expert at creating query variations for document retrieval systems. Your goal is to generate intelligent alternative phrasings that will help find relevant documents from different angles. You must always return valid JSON. Do not return any additional text. Do not wrap JSON in markdown code blocks. Return only the raw JSON object.

STEP 1: ANALYZE THE QUERY INTENT
Understand what information the user is seeking:
- What is the core topic or domain?
- What specific aspects are they interested in?
- What type of documents would contain this information?
- Is this a factual, procedural, conceptual, or technical query?

STEP 2: INTELLIGENT VARIATION GENERATION
Your task is to create meaningful query variations using this mandatory process:

A. IDENTIFY CORE CONCEPTS
- Extract the main subject matter
- Identify key terms and their potential synonyms
- Consider domain-specific terminology
- Think about how the same information might be expressed differently

B. APPLY VARIATION STRATEGIES
- **Procedural**: Convert concepts to "how to" format if applicable
- **Definitional**: Add "what is" or "definition" for concept queries
- **Technical**: Use domain-specific terminology if the query suggests a technical domain
- **Broader**: Remove specific terms for wider coverage while maintaining relevance
- **Alternative phrasing**: Use synonyms and different sentence structures
- **Contextual**: Consider related concepts that might appear in relevant documents

C. MANDATORY QUALITY RULES
- Do not include the original query in the variations array.
- Generate 2-3 additional meaningful variations (maximum 4 total including original)
- Each variation must maintain the core intent of the original query
- Assign weights based on likelihood to find relevant content:
  * Higher weights (0.8-1.0): Close alternatives with same meaning
  * Medium weights (0.6-0.7): Broader searches or alternative terminology
  * Lower weights (0.4-0.5): Conceptually related but different phrasing
- Avoid variations that completely change the meaning or intent
- Each variation should target documents the original query might miss

STEP 3: WEIGHT ASSIGNMENT LOGIC
Consider these factors when assigning weights:
- Semantic similarity to original query (higher = more weight)
- Likelihood of finding relevant documents (higher = more weight)
- Specificity vs. broadness (more specific usually gets higher weight)
- Domain appropriateness (domain-specific terms get higher weight in technical queries)

STEP 4: VALIDATION BEFORE RESPONSE
Before returning your response, verify:
- All variations maintain core intent
- Weights are between 0.1 and 1.0
- Maximum 4 variations total
- Each variation has a clear purpose
- No duplicate or near-duplicate variations

STEP 5: RESPONSE FORMATTING
{format_instructions}

<query>
{query}
</query>
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

async function invokeParentDocumentRetriever(
  queryVariations: Array<QueryVariation>,
  vectorStore: QdrantVectorStore,
  collectionName: string,
  logger: Logger
): Promise<Array<Document>> {
  const retriever = await getParentDocumentRetriever(vectorStore, collectionName, logger);

  const matchedDocs = new Map<string, DocumentSource>();

  // Batch process to avoid any bottle neck by processing one query variation at a time.
  logger.info('Retrieving documents from vector store');
  const retrieverPromises = queryVariations.map(queryVariation => retriever.invoke(queryVariation.query));
  const retrieverResults = await Promise.allSettled(retrieverPromises);
  logger.info({ retrieverResults }, 'Retrieving documents from vector store completed');

  retrieverResults.forEach(result => {
    logger.info({ result }, 'Retriever result');
    if (result.status === 'fulfilled') {
      result.value.forEach(doc => {
        if (doc.metadata.url) {
          const uniqueDoc: DocumentSource = { metadataPath: 'metadata.url', metadataValue: doc.metadata.url };
          matchedDocs.set(doc.metadata.url, uniqueDoc);
        } else if (doc.metadata.pdf?.info?.Title) {
          const uniqueDoc: DocumentSource = { metadataPath: 'metadata.pdf.info.Title', metadataValue: doc.metadata.pdf.info.Title };
          matchedDocs.set(doc.metadata.pdf.info.Title, uniqueDoc);
        } else {
          const uniqueDoc: DocumentSource = { metadataPath: 'metadata.doc_id', metadataValue: doc.metadata.doc_id };
          matchedDocs.set(doc.metadata.doc_id, uniqueDoc);
        }
      });
    }
  });

  const uniqueDocs = Array.from(matchedDocs.values());

  logger.info({ uniqueDocs }, 'Unique docs');

  // Get docs from vector store by metadataPath and metadataValue
  const allResults: Array<Document> = [];

  // Batch process to avoid any bottle neck by processing one unique doc at a time.
  // Can use filter with OR to get all docs. But for convenience, let's use scroll per unique doc. It's still fast enough.
  logger.info('Getting docs from vector store');
  const wholeDocPromises = uniqueDocs.map(uniqueDoc =>
    vectorStore.client.scroll(collectionName, {
      limit: 10000, // Try to get all docs
      filter: {
        must: [
          {
            key: uniqueDoc.metadataPath,
            match: { value: uniqueDoc.metadataValue }
          }
        ]
      },
      order_by: { key: 'metadata.loc.lines.from', direction: 'asc' }
    })
  );

  const wholeDocResults = await Promise.allSettled(wholeDocPromises);
  logger.info({ wholeDocResults }, 'Getting docs from vector store completed');

  wholeDocResults.forEach(result => {
    if (result.status === 'fulfilled') {
      const doc = result.value;
      const combinedDocument = doc.points.map(point => point.payload?.content).join('\n');
      // Get metadata from first point and remove loc because loc is no longer valid as it's full document.
      const metadata = { ...(doc.points?.[0]?.payload?.metadata || {}), loc: undefined };
      allResults.push(new Document({ pageContent: combinedDocument, metadata }));
    }
  });

  logger.info({ allResults }, 'Getting docs from vector store completed');

  logger.info(
    {
      allResults: allResults.length
    },
    'Search pipeline completed'
  );

  return allResults;
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
Analyze if this document is relevant to the query variations below.

Query variations:
{query_variations}

Document excerpt:
{document}

Format instructions:
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
