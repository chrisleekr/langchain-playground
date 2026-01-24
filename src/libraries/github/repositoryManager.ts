import config from 'config';
import { schedule, validate, type ScheduledTask } from 'node-cron';
import simpleGit, { type SimpleGit } from 'simple-git';
import { existsSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { Logger } from '@/libraries';

/**
 * Repository configuration for cloning and updating
 */
export interface RepositoryConfig {
  owner: string;
  repo: string;
  branch: string;
}

/**
 * Repository manager configuration from config file
 */
interface RepositoryManagerConfig {
  enabled: boolean;
  dataPath: string;
  updateIntervalCron: string;
  repos: RepositoryConfig[];
}

/**
 * Result of a repository operation (clone or pull)
 */
interface RepositoryOperationResult {
  owner: string;
  repo: string;
  success: boolean;
  operation: 'clone' | 'pull' | 'skip';
  message: string;
}

/**
 * Manages cloning and updating GitHub repositories for ChunkHound indexing.
 *
 * Features:
 * - Clones repositories defined in config on initialization
 * - Periodically pulls updates using cron scheduler
 * - Handles authentication via personal access token
 * - Graceful error handling (continues on individual repo failures)
 *
 * @see https://www.npmjs.com/package/simple-git
 * @see https://www.npmjs.com/package/node-cron
 */
export class RepositoryManager {
  private readonly logger: Logger;
  private readonly dataPath: string;
  private readonly repos: RepositoryConfig[];
  private readonly updateIntervalCron: string;
  private readonly personalAccessToken: string;
  private cronTask: ScheduledTask | null = null;

  constructor(logger: Logger) {
    this.logger = logger;

    const repoConfig = config.get<RepositoryManagerConfig>('github.repositories');
    this.dataPath = resolve(repoConfig.dataPath);
    this.repos = repoConfig.repos;
    this.updateIntervalCron = repoConfig.updateIntervalCron;
    this.personalAccessToken = config.get<string>('github.personalAccessToken');

    this.logger.info(
      {
        dataPath: this.dataPath,
        repoCount: this.repos.length,
        updateIntervalCron: this.updateIntervalCron
      },
      'RepositoryManager initialized'
    );
  }

  /**
   * Constructs the clone URL for a repository, including authentication if available.
   */
  private getCloneUrl(owner: string, repo: string): string {
    if (this.personalAccessToken) {
      // Authenticated URL for private repos
      return `https://${this.personalAccessToken}@github.com/${owner}/${repo}.git`;
    }
    // Public URL
    return `https://github.com/${owner}/${repo}.git`;
  }

  /**
   * Gets the local path for a repository.
   */
  private getRepoPath(owner: string, repo: string): string {
    return join(this.dataPath, owner, repo);
  }

  /**
   * Ensures the data directory exists.
   */
  private ensureDataDirectory(): void {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- Path from config
    if (!existsSync(this.dataPath)) {
      // eslint-disable-next-line security/detect-non-literal-fs-filename -- Path from config
      mkdirSync(this.dataPath, { recursive: true });
      this.logger.info({ dataPath: this.dataPath }, 'Created data directory');
    }
  }

  /**
   * Clones a repository if it doesn't exist locally.
   */
  private async cloneRepository(repoConfig: RepositoryConfig): Promise<RepositoryOperationResult> {
    const { owner, repo, branch } = repoConfig;
    const repoPath = this.getRepoPath(owner, repo);

    // Check if repo already exists
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- Path from config
    if (existsSync(join(repoPath, '.git'))) {
      return {
        owner,
        repo,
        success: true,
        operation: 'skip',
        message: 'Repository already exists'
      };
    }

    // Ensure parent directory exists
    const parentDir = join(this.dataPath, owner);
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- Path from config
    if (!existsSync(parentDir)) {
      // eslint-disable-next-line security/detect-non-literal-fs-filename -- Path from config
      mkdirSync(parentDir, { recursive: true });
    }

    try {
      const git: SimpleGit = simpleGit();
      const cloneUrl = this.getCloneUrl(owner, repo);

      this.logger.info({ owner, repo, branch, repoPath }, 'Cloning repository');

      await git.clone(cloneUrl, repoPath, ['--branch', branch, '--single-branch', '--depth', '1']);

      this.logger.info({ owner, repo, branch }, 'Repository cloned successfully');

      return {
        owner,
        repo,
        success: true,
        operation: 'clone',
        message: 'Repository cloned successfully'
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error({ owner, repo, error: errorMessage }, 'Failed to clone repository');

      return {
        owner,
        repo,
        success: false,
        operation: 'clone',
        message: errorMessage
      };
    }
  }

  /**
   * Pulls updates for a repository using fetch + reset to avoid conflicts.
   */
  private async pullRepository(repoConfig: RepositoryConfig): Promise<RepositoryOperationResult> {
    const { owner, repo, branch } = repoConfig;
    const repoPath = this.getRepoPath(owner, repo);

    // Check if repo exists
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- Path from config
    if (!existsSync(join(repoPath, '.git'))) {
      this.logger.warn({ owner, repo }, 'Repository does not exist, attempting clone instead');
      return this.cloneRepository(repoConfig);
    }

    try {
      const git: SimpleGit = simpleGit(repoPath);

      this.logger.info({ owner, repo, branch }, 'Fetching updates');

      // Fetch latest changes
      await git.fetch('origin', branch);

      // Reset to origin/branch to avoid merge conflicts
      await git.reset(['--hard', `origin/${branch}`]);

      this.logger.info({ owner, repo, branch }, 'Repository updated successfully');

      return {
        owner,
        repo,
        success: true,
        operation: 'pull',
        message: 'Repository updated successfully'
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error({ owner, repo, error: errorMessage }, 'Failed to update repository');

      return {
        owner,
        repo,
        success: false,
        operation: 'pull',
        message: errorMessage
      };
    }
  }

  /**
   * Initializes all configured repositories (clones if not present).
   */
  async initializeRepositories(): Promise<RepositoryOperationResult[]> {
    this.ensureDataDirectory();

    this.logger.info({ repoCount: this.repos.length }, 'Initializing repositories');

    const results: RepositoryOperationResult[] = [];

    for (const repoConfig of this.repos) {
      const result = await this.cloneRepository(repoConfig);
      results.push(result);
    }

    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;

    this.logger.info({ successful, failed, total: results.length }, 'Repository initialization complete');

    return results;
  }

  /**
   * Updates all configured repositories (pulls latest changes).
   */
  async updateRepositories(): Promise<RepositoryOperationResult[]> {
    this.logger.info({ repoCount: this.repos.length }, 'Updating repositories');

    const results: RepositoryOperationResult[] = [];

    for (const repoConfig of this.repos) {
      const result = await this.pullRepository(repoConfig);
      results.push(result);
    }

    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;

    this.logger.info({ successful, failed, total: results.length }, 'Repository update complete');

    return results;
  }

  /**
   * Starts the cron scheduler for periodic repository updates.
   */
  startScheduler(): void {
    if (this.cronTask) {
      this.logger.warn('Scheduler already running');
      return;
    }

    if (!validate(this.updateIntervalCron)) {
      this.logger.error({ cron: this.updateIntervalCron }, 'Invalid cron expression');
      return;
    }

    this.cronTask = schedule(this.updateIntervalCron, async () => {
      this.logger.info('Scheduled repository update triggered');
      await this.updateRepositories();
    });

    this.logger.info({ cron: this.updateIntervalCron }, 'Repository update scheduler started');
  }

  /**
   * Stops the cron scheduler.
   */
  stopScheduler(): void {
    if (this.cronTask) {
      this.cronTask.stop();
      this.cronTask = null;
      this.logger.info('Repository update scheduler stopped');
    }
  }

  /**
   * Gets the list of configured repositories.
   */
  getRepositories(): RepositoryConfig[] {
    return [...this.repos];
  }

  /**
   * Gets the data path where repositories are stored.
   */
  getDataPath(): string {
    return this.dataPath;
  }
}

// Singleton instance for the repository manager
let repositoryManager: RepositoryManager | null = null;

/**
 * Gets or creates the singleton RepositoryManager instance.
 * Only creates if github.repositories.enabled is true in config.
 */
export const getRepositoryManager = (logger: Logger): RepositoryManager | null => {
  const enabled = config.get<boolean>('github.repositories.enabled');

  if (!enabled) {
    logger.debug('Repository manager disabled in config');
    return null;
  }

  if (!repositoryManager) {
    repositoryManager = new RepositoryManager(logger);
  }

  return repositoryManager;
};

/**
 * Initializes the repository manager, clones repos, and starts the scheduler.
 * Call this on server startup.
 */
export const initializeRepositoryManager = async (logger: Logger): Promise<void> => {
  const manager = getRepositoryManager(logger);

  if (!manager) {
    logger.info('Repository manager not enabled, skipping initialization');
    return;
  }

  // Clone any missing repositories
  await manager.initializeRepositories();

  // Start periodic update scheduler
  manager.startScheduler();

  logger.info('Repository manager fully initialized');
};

/**
 * Shuts down the repository manager gracefully.
 * Call this on server shutdown.
 */
export const shutdownRepositoryManager = (logger: Logger): void => {
  if (repositoryManager) {
    repositoryManager.stopScheduler();
    repositoryManager = null;
    logger.info('Repository manager shut down');
  }
};
