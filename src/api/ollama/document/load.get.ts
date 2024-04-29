import config from 'config';
import { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';

import { UnstructuredDirectoryLoader } from 'langchain/document_loaders/fs/unstructured';
import { Document } from 'langchain/document';
import { getOllamaEmbeddings, getParentDocumentRetriever, getChromaVectorStore } from '@/libraries';
import { handleServiceResponse } from '@/libraries/httpHandlers';
import { ResponseStatus, ServiceResponse } from '@/models/serviceResponse';

export default function documentLoadGet(collectionName: string) {
  return async (req: Request, res: Response): Promise<Response<unknown, Record<string, unknown>>> => {
    const logger = req.log;
    const directoryPath = __dirname + '/../../../../data';

    // Get loader
    logger.info({ directoryPath }, 'Loading documents from the directory');
    const directoryLoader = new UnstructuredDirectoryLoader(directoryPath, {
      apiUrl: config.get('unstructuredAPI.url')
    });

    const docs = await directoryLoader.load();
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

    const testRelevantDocs = await retriever.invoke('What is the moon made of?');
    logger.info({ testRelevantDocs }, 'Test relevant docs');
    // If testRelevantDocs is empty or testRelevantDoc[].pageContent does not contain 'moon', throw error
    if (testRelevantDocs.length === 0 || testRelevantDocs.filter((doc: Document) => doc.pageContent.indexOf('moon') !== -1).length === 0) {
      throw new Error('Retriever did not return relevant documents for test query.');
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
