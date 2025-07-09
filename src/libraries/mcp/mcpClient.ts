import config from 'config';
import { MultiServerMCPClient } from '@langchain/mcp-adapters';
import { Logger } from '@/libraries';

let mcpClient: MultiServerMCPClient | undefined;

const getMCPClient = async (logger: Logger): Promise<MultiServerMCPClient> => {
  if (!mcpClient) {
    logger.info('Creating MCP client...');

    mcpClient = new MultiServerMCPClient({
      // Global tool configuration
      throwOnLoadError: true,
      prefixToolNameWithServerName: true,
      additionalToolNamePrefix: 'mcp',
      useStandardContentBlocks: true,

      // Server configuration
      mcpServers: {
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

        // Add more servers as needed
        // For example, if you have a custom MCP server running via HTTP:
        // 'custom-server': {
        //   url: 'http://localhost:3001/mcp',
        //   headers: {
        //     'Authorization': `Bearer ${config.get('customServer.apiKey')}`
        //   },
        //   reconnect: {
        //     enabled: true,
        //     maxAttempts: 5,
        //     delayMs: 2000,
        //   },
        // },
      }
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
