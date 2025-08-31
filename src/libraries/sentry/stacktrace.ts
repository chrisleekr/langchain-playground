import config from 'config';
import { decodeGitHubContent, extractFunctionSourceCode, fetchGitHubContent, fetchGitHubRepo } from '@/libraries/github';
import { SentryIssue, SentryIssueEventNormalized } from './types';
import { logger } from '../logger';
import { searchGitHubCode } from '../github/search';

/**
 * Parse stack trace and extend to actual source code
 *
 * @param stacktrace
 */
export const extendStacktraceToSourceCode = async (
  issue: SentryIssue,
  issueEvent: SentryIssueEventNormalized | undefined
): Promise<SentryIssueEventNormalized | undefined> => {
  if (
    issue.project === undefined ||
    issue.project.slug === undefined ||
    issueEvent === undefined ||
    issueEvent.stacktrace === undefined ||
    issueEvent.stacktrace?.length === 0
  ) {
    return issueEvent;
  }

  const repo = await fetchGitHubRepo(issue.project.slug);

  const defaultBranch = repo.default_branch;

  const skipFilePatterns = ['node_modules', 'node:internal'];

  await Promise.all(
    issueEvent.stacktrace?.map(async trace => {
      const { fileName: compiledFileName } = trace.compiledFile;

      // Remove file extension from filename
      const normalizedFileName = compiledFileName
        ?.replace(/^\/usr\/src\/app\/build\//, '')
        .replace(/^\/\.\//, '')
        .replace(/\.js$/, '');

      // If normalizedFileName is undefined or normalizedFileName contains patterns or function is null, skip
      if (
        normalizedFileName === undefined ||
        skipFilePatterns.some(pattern => normalizedFileName.includes(pattern)) ||
        trace.compiledFile.function === null
      ) {
        logger.warn({ normalizedFileName }, 'Source file name is undefined or not fetchable');
        return trace;
      }

      const githubSearchQuery = `repo:${config.get<string>('github.owner')}/${issue.project.slug} filename:${normalizedFileName}`;
      logger.info({ githubSearchQuery }, 'Searching GitHub code');
      const searchCode = await searchGitHubCode(githubSearchQuery, {
        perPage: 1
      });

      if (searchCode.items.length === 0) {
        logger.warn({ githubSearchQuery }, 'No code found in GitHub');
        return trace;
      }

      logger.info({ searchCode }, 'Found code in GitHub');

      const { path: actualFilePath } = searchCode.items[0];

      const fileContent = await fetchGitHubContent(issue.project.slug, actualFilePath, defaultBranch);

      if (fileContent === null || fileContent.content === undefined || actualFilePath === null) {
        // Skip if file content is undefined
        logger.warn({ actualFilePath, fileContent }, 'Source file content is undefined');
        return trace;
      }

      const decodedContent = await decodeGitHubContent(fileContent.content);

      const functionInfo = extractFunctionSourceCode(actualFilePath, decodedContent, trace.compiledFile.function);

      const startLine = functionInfo?.startLine || 0;
      trace.sourceFile = {
        remoteLink: fileContent._links.html || null,
        function: functionInfo?.functionName || null,
        lineNo: startLine >= 0 ? startLine : null,
        colNo: functionInfo?.startColumn || null,
        context: functionInfo?.fullFunction.split('\n').map((line, index) => `${startLine + index}: ${line}`) || null
      };

      return trace;
    }) ?? []
  );

  return issueEvent;
};
