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
import { getChatOllama, getOllamaEmbeddings, getParentDocumentRetriever, getQdrantVectorStore, removeCodeBlock, removeThinkTag } from '@/libraries';
import { sendResponse } from '@/libraries/httpHandlers';
import { ServiceResponse, ResponseStatus } from '@/models/serviceResponse';

type QueryVariation = {
  query: string;
  weight: number;
};

export default function queryParentPost() {
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

      const embeddings = getOllamaEmbeddings(logger);
      const collectionName = config.get<string>('document.collectionName');
      const vectorStore = await getQdrantVectorStore(embeddings, collectionName, logger);

      // `generateQueryVariations` is a function that generates query variations with query and weight. Weight is used to indicate the relevance of the query variation. Higher weight = more relevant.
      const queryVariations = await generateQueryVariations(userQuery, logger);
      logger.info({ originalQuery: userQuery, variations: queryVariations }, 'Generated query variations');

      const searchResults = await invokeParentDocumentRetriever(queryVariations, vectorStore, logger);
      logger.info({ searchResults }, 'Search results');

      const relevantDocuments = await verifyDocuments(queryVariations, searchResults, logger);
      logger.info({ relevantDocuments }, 'Relevant documents');

      const responseData = {
        results: relevantDocuments,
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
      logger.error({ error, query: request.body.query }, 'Error processing query');
      await sendResponse(reply, new ServiceResponse(ResponseStatus.Failed, 'Internal server error', null, StatusCodes.INTERNAL_SERVER_ERROR));
    }
  };
}

async function invokeParentDocumentRetriever(
  queryVariations: Array<QueryVariation>,
  vectorStore: QdrantVectorStore,
  logger: Logger
): Promise<Array<Document>> {
  const collectionName = config.get<string>('document.collectionName');
  const retriever = await getParentDocumentRetriever(vectorStore, collectionName, logger);

  type MatchedDoc = { metadataPath: string; metadataValue: string };
  const matchedDocs = new Map<string, MatchedDoc>();
  for (const { query } of queryVariations) {
    const results = await retriever.invoke(query);

    results.forEach(doc => {
      if (doc.metadata.url) {
        const uniqueDoc: MatchedDoc = { metadataPath: 'metadata.url', metadataValue: doc.metadata.url };
        matchedDocs.set(doc.metadata.url, uniqueDoc);
      } else if (doc.metadata.pdf?.info?.Title) {
        const uniqueDoc: MatchedDoc = { metadataPath: 'metadata.pdf.info.Title', metadataValue: doc.metadata.pdf.info.Title };
        matchedDocs.set(doc.metadata.pdf.info.Title, uniqueDoc);
      } else {
        const uniqueDoc: MatchedDoc = { metadataPath: 'metadata.doc_id', metadataValue: doc.metadata.doc_id };
        matchedDocs.set(doc.metadata.doc_id, uniqueDoc);
      }
    });
  }

  const uniqueDocs = Array.from(matchedDocs.values());

  logger.info({ uniqueDocs }, 'Unique docs');

  // Get docs from vector store by metadataPath and metadataValue
  const allResults: Array<Document> = [];

  for (const uniqueDoc of uniqueDocs) {
    const scrollResult = await vectorStore.client.scroll(collectionName, {
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
    });

    const combinedDocument = scrollResult.points.map(point => point.payload?.content).join('\n');
    // Get metadata from first point and remove loc because loc is no longer valid as it's full document.
    const metadata = { ...(scrollResult.points?.[0]?.payload?.metadata || {}), loc: undefined };
    allResults.push(new Document({ pageContent: combinedDocument, metadata }));
  }

  logger.info(
    {
      allResults: allResults.length
    },
    'Search pipeline completed'
  );

  return allResults;
}

async function generateQueryVariations(query: string, logger: Logger): Promise<Array<QueryVariation>> {
  try {
    const model = getChatOllama(0, logger);

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

    return variations;
  } catch (error) {
    logger.error({ error }, 'Error generating LLM query variations, falling back to rule-based');
    throw error;
  }
}

async function verifyDocuments(queryVariations: Array<QueryVariation>, documents: Array<Document>, logger: Logger): Promise<Array<Document>> {
  const model = getChatOllama(0, logger);

  const verifyDocumentsParser = StructuredOutputParser.fromZodSchema(
    z.object({
      isRelevant: z.boolean().describe('Whether the document is relevant to the query'),
      confidence: z.number().min(0).max(1).describe('Confidence score between 0 and 1'),
      reasoning: z.string().describe('Brief reasoning about the relevance assessment')
    })
  );

  const relevantDocuments: Array<Document> = [];

  for (const document of documents) {
    // This prompt is simplified to focus on the document relevance to the query variations.
    // Lengthy prompt does not work well with lengthy documents.
    const verifyDocumentsPrompt = PromptTemplate.fromTemplate(`
Analyze if this document is relevant to the query variations below.

Query variations:
{query_variations}

Document excerpt:
{document}

Return your analysis as JSON only. No additional text or formatting.

{format_instructions}
`);

    const invokeParams = {
      query_variations: queryVariations.map(v => `${v.query} (weight: ${v.weight})`).join('\n'),
      document: removeCodeBlock(document.pageContent).slice(0, 8000), // 120000
      format_instructions: verifyDocumentsParser.getFormatInstructions()
    };

    logger.info(
      {
        compiledPrompt: await verifyDocumentsPrompt.format(invokeParams)
      },
      'Document verification compiled prompt'
    );

    const verifyDocumentsChain = RunnableSequence.from([verifyDocumentsPrompt, model, removeThinkTag, verifyDocumentsParser]);

    const result = await verifyDocumentsChain.invoke(invokeParams);

    logger.info({ result }, 'Verify documents result');

    if (result.isRelevant) {
      relevantDocuments.push({ ...document, metadata: { ...document.metadata, relevance: result } });
    }
  }

  return relevantDocuments;
}
