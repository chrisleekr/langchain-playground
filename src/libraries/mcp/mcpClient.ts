import config from 'config';
import { MultiServerMCPClient } from '@langchain/mcp-adapters';
import type { Connection, StdioConnection, StreamableHTTPConnection } from '@langchain/mcp-adapters';

import { Logger } from '@/libraries';

/**
 * MCP server configuration type combining stdio and HTTP connection options.
 * Based on the Connection type from @langchain/mcp-adapters.
 */
type MCPServerConfig = StdioConnection | StreamableHTTPConnection | Connection;

let mcpClient: MultiServerMCPClient | undefined;

/**
 * Builds the MCP server configuration, conditionally including ChunkHound if enabled.
 */
const buildMCPServerConfig = () => {
  const servers: Record<string, MCPServerConfig> = {
    // everything: {
    //   command: 'npx',
    //   args: ['-y', '@modelcontextprotocol/server-everything']
    // },

    // fetch: {
    //   command: 'docker',
    //   args: ['run', '-i', '--rm', 'mcp/fetch']
    // },

    // time: {
    //   command: 'docker',
    //   args: ['run', '-i', '--rm', 'mcp/time']
    // },

    'brave-search': {
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-brave-search'],
      env: {
        BRAVE_API_KEY: config.get('mcp.brave.apiKey')
      }
    },

    // GitHub server for repository operations
    // Use Github Loader rather than MCP.
    // github: {
    //   command: 'docker',
    //   args: [
    //     'run',
    //     '-i',
    //     '--rm',
    //     '-e',
    //     'GITHUB_READ_ONLY',
    //     '-e',
    //     'GITHUB_TOOLSETS',
    //     '-e',
    //     'GITHUB_PERSONAL_ACCESS_TOKEN',
    //     'ghcr.io/github/github-mcp-server'
    //   ],
    //   env: {
    //     GITHUB_READ_ONLY: '1',
    //     GITHUB_TOOLSETS: 'repos,issues,pull_requests',
    //     GITHUB_PERSONAL_ACCESS_TOKEN: config.get('mcp.github.personalAccessToken')
    //   }
    // },

    'kubernetes-readonly': {
      command: 'npx',
      args: ['mcp-server-kubernetes'],
      env: {
        ALLOW_ONLY_NON_DESTRUCTIVE_TOOLS: 'true'
      }
    },

    context7: {
      url: 'https://mcp.context7.com/mcp'
    }
  };

  // Add ChunkHound MCP server if enabled
  // ChunkHound provides code search and research capabilities via HTTP transport
  // @see https://chunkhound.github.io/
  const chunkhoundEnabled = config.get<boolean>('chunkhound.enabled');
  if (chunkhoundEnabled) {
    const chunkhoundUrl = config.get<string>('chunkhound.url');
    servers['chunkhound'] = {
      url: chunkhoundUrl,
      reconnect: {
        enabled: true,
        maxAttempts: 5,
        delayMs: 2000
      }
    };
  }

  return servers;
};

const getMCPClient = async (logger: Logger): Promise<MultiServerMCPClient> => {
  if (!mcpClient) {
    logger.info('Creating MCP client...');

    const mcpServers = buildMCPServerConfig();
    const serverNames = Object.keys(mcpServers);
    logger.info({ servers: serverNames }, 'Configuring MCP servers');

    mcpClient = new MultiServerMCPClient({
      // Global tool configuration
      throwOnLoadError: true,
      prefixToolNameWithServerName: true,
      additionalToolNamePrefix: 'mcp',
      useStandardContentBlocks: true,

      // Server configuration
      mcpServers
    });

    logger.info('MCP client created successfully');
  }

  return mcpClient;
};

const getMCPTools = async (logger: Logger) => {
  const client = await getMCPClient(logger);
  const tools = await client.getTools();
  logger.info({ toolCount: tools.length }, 'MCP tools loaded');
  return tools;
};

const closeMCPClient = async (logger: Logger) => {
  if (mcpClient) {
    logger.info('Closing MCP client...');
    await mcpClient.close();
    mcpClient = undefined;
  }
};

export { getMCPClient, getMCPTools, closeMCPClient };
