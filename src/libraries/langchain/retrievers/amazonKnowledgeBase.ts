import { fromSSO } from '@aws-sdk/credential-providers';
import type { AwsCredentialIdentityProvider, Logger } from '@aws-sdk/types';
import { AmazonKnowledgeBaseRetriever } from '@langchain/aws';
import config from 'config';

let retriever: AmazonKnowledgeBaseRetriever;

interface GetAmazonKnowledgeBaseRetrieverParams {
  topK: number;
}

const getAmazonKnowledgeBaseRetriever = async (
  { topK }: GetAmazonKnowledgeBaseRetrieverParams,
  logger: Logger
): Promise<AmazonKnowledgeBaseRetriever> => {
  if (!retriever) {
    logger.info({ knowledgeBaseId: config.get<string>('aws.bedrock.knowledgeBaseId') }, 'Creating AmazonKnowledgeBaseRetriever...');

    let credentials: AwsCredentialIdentityProvider;
    if (config.get<string>('aws.bedrock.credentials.profile')) {
      credentials = fromSSO({
        profile: config.get<string>('aws.bedrock.credentials.profile')
      });
    } else {
      credentials = async () => ({
        accessKeyId: config.get<string>('aws.bedrock.credentials.accessKeyId'),
        secretAccessKey: config.get<string>('aws.bedrock.credentials.secretAccessKey')
      });
    }

    retriever = new AmazonKnowledgeBaseRetriever({
      knowledgeBaseId: config.get<string>('aws.bedrock.knowledgeBaseId'),
      region: config.get<string>('aws.bedrock.region'),
      topK,
      clientOptions: {
        credentials
      }
    });

    logger.info('Creating AmazonKnowledgeBaseRetriever...done');
  }

  return retriever;
};

export { getAmazonKnowledgeBaseRetriever };
