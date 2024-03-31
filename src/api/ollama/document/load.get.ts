import config from 'config';
import { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';

import { UnstructuredDirectoryLoader } from 'langchain/document_loaders/fs/unstructured';
import { getEmbeddings, getRetriever, getVectorStore } from '@/libraries';
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

    const embeddings = getEmbeddings(logger);
    logger.info({ embeddings }, 'Got embeddings.');

    logger.info('Getting Chroma Vector Store...');
    const chromaClient = await getVectorStore(embeddings, collectionName, logger);

    logger.info('Deleting existing collection to create fresh collection...');
    const deleteResult = chromaClient.delete({ filter: { name: collectionName } });
    logger.info({ deleteResult }, 'Deleted existing collection');

    const retriever = await getRetriever(embeddings, collectionName, logger);
    logger.info({ retriever }, 'Got retriever.');

    logger.info('Adding documents to the retriever...');
    const addDocumentsResult = await retriever.addDocuments(docs);
    logger.info({ addDocumentsResult }, 'Added documents to the retriever.');

    const serviceResponse = new ServiceResponse(
      ResponseStatus.Success,
      'OK',
      {
        docs,
        addDocumentsResult
      },
      StatusCodes.OK
    );
    return handleServiceResponse(serviceResponse, res);
  };
}
