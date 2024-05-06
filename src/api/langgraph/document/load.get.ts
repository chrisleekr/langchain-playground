import { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';

import { JSONLoader, JSONLinesLoader } from 'langchain/document_loaders/fs/json';
import { TextLoader } from 'langchain/document_loaders/fs/text';
import { CSVLoader } from 'langchain/document_loaders/fs/csv';
import { PDFLoader } from 'langchain/document_loaders/fs/pdf';
import { DirectoryLoader } from 'langchain/document_loaders/fs/directory';

import { Document } from 'langchain/document';

import { ParentDocumentRetriever } from 'langchain/retrievers/parent_document';
import { getOllamaEmbeddings, getChromaVectorStore, Logger, getParentDocumentRetriever } from '@/libraries';
import { handleServiceResponse } from '@/libraries/httpHandlers';
import { ResponseStatus, ServiceResponse } from '@/models/serviceResponse';
import { collectionName } from '../langgraphRouter';

const verifyDocs = async (retriever: ParentDocumentRetriever, logger: Logger) => {
  // Verifies that the retriever can return relevant documents for a test query
  const testRelevantDocs = await retriever.invoke('What is ingredients of Korean Fried Chicken?');
  logger.info({ testRelevantDocs }, 'Test relevant docs');
  // If testRelevantDocs is empty or testRelevantDoc[].pageContent does not contain 'moon', throw error
  if (testRelevantDocs.length === 0 || testRelevantDocs.filter((doc: Document) => doc.pageContent.indexOf('chicken') !== -1).length === 0) {
    throw new Error('Retriever did not return relevant documents for test query.');
  }

  // Verifies that the retriever does not return irrelevant documents for a test query
  const testIrrelevantDocs = await retriever.invoke('What is the moon?');
  logger.info({ testIrrelevantDocs }, 'Test irrelevant docs');
  // If testIrrelevantDocs is not empty or testIrrelevantDocs[].pageContent contains 'moon', throw error
  if (testIrrelevantDocs.length !== 0 || testIrrelevantDocs.filter((doc: Document) => doc.pageContent.indexOf('moon') !== -1).length !== 0) {
    throw new Error('Retriever returned irrelevant documents for test query.');
  }
};

export default function documentLoadGet() {
  return async (req: Request, res: Response): Promise<Response<unknown, Record<string, unknown>>> => {
    const logger = req.log;
    const directoryPath = __dirname + '/../../../../data/langgraph';

    // Get loader
    logger.info({ directoryPath }, 'Loading documents from the directory');

    const loader = new DirectoryLoader(directoryPath, {
      '.json': path => new JSONLoader(path, '/texts'),
      '.jsonl': path => new JSONLinesLoader(path, '/html'),
      '.txt': path => new TextLoader(path),
      '.csv': path => new CSVLoader(path, 'text'),
      '.pdf': path => new PDFLoader(path, { splitPages: false })
    });
    const docs = await loader.load();
    logger.info({ docs }, 'Loaded documents from the directory.');

    const embeddings = getOllamaEmbeddings(logger);
    logger.info({ embeddings }, 'Got embeddings.');

    logger.info('Getting Vector Store...');
    const vectorStore = await getChromaVectorStore(embeddings, collectionName, logger);
    logger.info({ collectionName: vectorStore.collectionName }, 'Got Vector Store...');

    logger.info('Ensuring collection exists...');
    const collection = await vectorStore.ensureCollection();
    logger.info({ collection }, 'Ensured collection exists');

    logger.info('Deleting existing docs from collection to create fresh collection...');
    const existingCollectionIds = (await collection.get()).ids;
    await collection.delete({ ids: existingCollectionIds });
    logger.info({ existingCollectionIds }, 'Deleted existing docs from collection');

    const retriever = await getParentDocumentRetriever(vectorStore, collectionName, logger);
    logger.info({ retriever }, 'Got retriever.');

    logger.info('Adding documents to the retriever...');
    const addDocumentsResult = await retriever.addDocuments(docs);
    logger.info({ addDocumentsResult }, 'Added documents to the retriever.');

    // Verify that the retriever can return relevant documents for a test query
    try {
      await verifyDocs(retriever, logger);
    } catch (e) {
      // Ignore for now.
      logger.error({ error: e }, 'Error verifying retriever');
    }

    const collectionCount = await collection.count();
    const collectionDocs = await collection.get();
    const serviceResponse = new ServiceResponse(
      ResponseStatus.Success,
      'OK',
      {
        collectionCount,
        collectionDocs
      },
      StatusCodes.OK
    );
    return handleServiceResponse(serviceResponse, res);
  };
}
