import type { Logger } from 'pino';
import config from 'config';
import { Client } from '@opensearch-project/opensearch';
import createAwsOpensearchConnector from 'aws-opensearch-connector';
import { fromSSO } from '@aws-sdk/credential-providers';
import { AwsCredentialIdentityProvider } from '@aws-sdk/types';
import { Hit } from '@opensearch-project/opensearch/api/_types/_core.search.js';

let opensearchClient: Client;

const getOpensearchClient = async (logger: Logger): Promise<Client> => {
  if (!opensearchClient) {
    logger.info(
      { region: config.get<string>('aws.opensearch.region'), endpoint: config.get<string>('aws.opensearch.endpoint') },
      'Getting Opensearch Client...'
    );

    const profile = config.get<string>('aws.bedrock.credentials.profile');
    const accessKeyId = config.get<string>('aws.bedrock.credentials.accessKeyId');
    const secretAccessKey = config.get<string>('aws.bedrock.credentials.secretAccessKey');

    const opensearchRegion = config.get<string>('aws.opensearch.region');
    const opensearchEndpoint = config.get<string>('aws.opensearch.endpoint');

    let credentials: AwsCredentialIdentityProvider;
    if (profile) {
      credentials = fromSSO({
        profile
      });

      logger.info({ profile }, 'Using profile credentials');
    } else {
      credentials = async () => ({
        accessKeyId,
        secretAccessKey
      });

      logger.info({ accessKeyId }, 'Using access key credentials');
    }

    const retrievedCredentials = await credentials();

    logger.info({ endpoint: opensearchEndpoint, region: opensearchRegion }, 'Retrieved credentials');
    opensearchClient = new Client({
      node: opensearchEndpoint,
      ...createAwsOpensearchConnector({
        region: opensearchRegion,
        getCredentials: () => ({
          ...retrievedCredentials
        })
      })
    });
  }

  logger.info('Getting Opensearch Client...done');
  return opensearchClient;
};

const fetchDocumentChunksBySource = async (source: string, logger: Logger): Promise<string> => {
  const client = await getOpensearchClient(logger);

  const opensearchIndex = config.get<string>('aws.opensearch.index');
  logger.info({ source }, 'Fetching document chunks by source');

  const response = await client.search({
    index: opensearchIndex,
    size: 10000,
    body: { query: { match: { 'metadata.source': source } } },
    timeout: '10s'
  });

  const chunks = response.body.hits.hits.map((hit: Hit) => hit._source?.pageContent);

  logger.info({ source }, 'Fetching document chunks by source...done');
  return chunks.join('\n');
};

export { getOpensearchClient, fetchDocumentChunksBySource };
