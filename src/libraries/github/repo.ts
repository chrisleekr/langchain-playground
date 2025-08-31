import config from 'config';
import { logger } from '@/libraries/logger';
import { GitHubRepo } from './types';

export const fetchGitHubRepo = async (repo: string): Promise<GitHubRepo> => {
  const url = `https://api.github.com/repos/${config.get<string>('github.owner')}/${repo}`;

  logger.info({ url }, 'Fetching GitHub repo');
  const response = await fetch(url, {
    headers: {
      Accept: 'application/vnd.github.v3+json',
      Authorization: `Bearer ${config.get<string>('github.personalAccessToken')}`
    }
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch GitHub repo: ${response.statusText}`);
  }

  logger.info({ url, status: response.status, statusText: response.statusText }, 'Fetched GitHub repo');
  return response.json();
};
