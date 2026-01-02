import config from 'config';
import { fromNodeProviderChain } from '@aws-sdk/credential-providers';
import type { AwsCredentialIdentityProvider } from '@aws-sdk/types';

/**
 * Get AWS credentials for investigation operations.
 *
 * Uses the standard AWS credential resolution order:
 * 1. Environment variables (AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY)
 * 2. SSO credentials from ~/.aws/sso/cache
 * 3. Web identity token (for EKS/IRSA)
 * 4. Shared credentials file (~/.aws/credentials)
 * 5. ECS container credentials (for Fargate)
 * 6. EC2 instance metadata
 *
 * @see https://docs.aws.amazon.com/sdkref/latest/guide/standardized-credentials.html
 *
 * @returns AWS credential provider
 */
export const getInvestigateCredentials = (): AwsCredentialIdentityProvider => {
  const profile = config.get<string>('aws.investigate.credentials.profile');

  // Use standard credential provider chain; profile overrides if explicitly set
  return fromNodeProviderChain({
    profile: profile && profile.trim() !== '' ? profile : undefined
  });
};

/**
 * Get the default region for investigation operations.
 * Fallback when region cannot be determined from task ARN.
 *
 * @returns AWS region string
 */
export const getInvestigateRegion = (): string => {
  return config.get<string>('aws.investigate.region') || 'us-east-1';
};

/**
 * Get the CloudWatch Logs group name for ECS task state change events.
 *
 * @returns Log group name
 */
export const getEcsEventLogGroup = (): string => {
  return config.get<string>('aws.investigate.ecsEventLogGroup') || '/aws/events/ecs-task-state-change';
};
