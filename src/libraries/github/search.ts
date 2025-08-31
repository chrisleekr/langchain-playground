import config from 'config';
import { GitHubSearchCode } from './types';
import { logger } from '../logger';

export const searchGitHubCode = async (query: string, { perPage = 10 }): Promise<GitHubSearchCode> => {
  const url = `https://api.github.com/search/code?per_page=${perPage}&q=${encodeURIComponent(query)}`;

  logger.info({ url }, 'Searching GitHub code');

  const response = await fetch(url, {
    headers: {
      Accept: 'application/vnd.github.v3+json',
      Authorization: `Bearer ${config.get<string>('github.personalAccessToken')}`
    }
  });

  if (!response.ok) {
    logger.warn({ url, status: response.status, statusText: response.statusText }, 'Failed to search GitHub code');
    return {
      total_count: 0,
      incomplete_results: false,
      items: []
    };
  }

  logger.info({ url, status: response.status, statusText: response.statusText }, 'Searched GitHub code');

  return response.json();
};
