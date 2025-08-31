import {
  createSourceFile,
  Node,
  SourceFile,
  ScriptTarget,
  SyntaxKind,
  Identifier,
  isFunctionDeclaration,
  isMethodDeclaration,
  isVariableDeclaration,
  isArrowFunction,
  isFunctionExpression,
  isExpressionStatement,
  isBinaryExpression,
  isPropertyAccessExpression,
  isBlock,
  isIdentifier,
  forEachChild,
  ScriptKind
} from 'typescript';
import config from 'config';
import { logger } from '@/libraries/logger';
import { GitHubContentFunctionInfo, GitHubRepoContent } from './types';

export const fetchGitHubContent = async (repo: string, path: string, ref: string): Promise<GitHubRepoContent | null> => {
  const url = `https://api.github.com/repos/${config.get<string>('github.owner')}/${repo}/contents/${path}?ref=${ref}`;

  logger.info({ repo, path, ref, url }, 'Fetching GitHub content');
  const response = await fetch(url, {
    headers: {
      Accept: 'application/vnd.github.object',
      'X-GitHub-Api-Version': '2022-11-28',
      Authorization: `Bearer ${config.get<string>('github.personalAccessToken')}`
    }
  });

  if (!response.ok) {
    logger.warn({ repo, path, ref, url, status: response.status, statusText: response.statusText }, 'Failed to fetch GitHub content');
    return null;
  }

  logger.info({ repo, path, ref, url, status: response.status, statusText: response.statusText }, 'Fetched GitHub content');
  return response.json();
};

export const decodeGitHubContent = async (content: string): Promise<string> => {
  return Buffer.from(content, 'base64').toString('utf-8');
};

export const extractFunctionInfo = (node: Node, sourceFile: SourceFile, functionName: string): GitHubContentFunctionInfo | null => {
  logger.info({ functionName }, 'Extracting function info');
  try {
    const fullFunction = node.getText(sourceFile);
    let funcBody = '';

    // Extract function body based on node type
    if (isFunctionDeclaration(node) && node.body) {
      funcBody = node.body.getText(sourceFile).slice(1, -1).trim();
    } else if (isMethodDeclaration(node) && node.body) {
      funcBody = node.body.getText(sourceFile).slice(1, -1).trim();
    } else if (isVariableDeclaration(node) && node.initializer) {
      if (isArrowFunction(node.initializer)) {
        if (node.initializer.body) {
          if (isBlock(node.initializer.body)) {
            funcBody = node.initializer.body.getText(sourceFile).slice(1, -1).trim();
          } else {
            funcBody = node.initializer.body.getText(sourceFile);
          }
        }
      } else if (isFunctionExpression(node.initializer) && node.initializer.body) {
        funcBody = node.initializer.body.getText(sourceFile).slice(1, -1).trim();
      } else {
        // Handle other expressions like function calls, etc.
        const initializerText = node.initializer.getText(sourceFile);
        // For function calls like createSelector(...), extract the arguments
        if (initializerText.includes('(') && initializerText.includes(')')) {
          const parenStart = initializerText.indexOf('(');
          const parenEnd = initializerText.lastIndexOf(')');
          if (parenStart !== -1 && parenEnd !== -1 && parenEnd > parenStart) {
            funcBody = initializerText.substring(parenStart + 1, parenEnd).trim();
          }
        } else {
          funcBody = initializerText;
        }
      }
    } else if (isExpressionStatement(node)) {
      // Handle function assignment patterns
      const expr = node.expression;
      if (isBinaryExpression(expr)) {
        const right = expr.right;
        if (isFunctionExpression(right) && right.body) {
          funcBody = right.body.getText(sourceFile).slice(1, -1).trim();
        } else if (isArrowFunction(right) && right.body) {
          if (isBlock(right.body)) {
            funcBody = right.body.getText(sourceFile).slice(1, -1).trim();
          } else {
            funcBody = right.body.getText(sourceFile);
          }
        }
      }
    }

    // Get line and column numbers
    const start = sourceFile.getLineAndCharacterOfPosition(node.getStart());
    const end = sourceFile.getLineAndCharacterOfPosition(node.getEnd());

    return {
      functionName: functionName,
      functionBody: funcBody,
      fullFunction,
      startLine: start.line + 1,
      endLine: end.line + 1,
      startColumn: start.character + 1,
      endColumn: sourceFile.getLineAndCharacterOfPosition(node.getEnd()).character + 1
    };
  } catch (error) {
    logger.error(
      {
        functionName,
        error: {
          message: error instanceof Error ? error.message : 'Unknown error',
          stack: error instanceof Error ? error.stack : 'Unknown stack'
        }
      },
      'Error extracting function'
    );
    return null;
  }
};

export const extractFunctionSourceCode = (fileName: string, content: string, orgFunctionName: string): GitHubContentFunctionInfo | null => {
  logger.info({ fileName, orgFunctionName }, 'Extracting function source code');
  const isTypeScript = fileName.endsWith('.ts') || fileName.endsWith('.tsx');
  const scriptTarget = isTypeScript ? ScriptTarget.Latest : ScriptTarget.ES2020;

  logger.info({ fileName, scriptTarget, isTypeScript }, 'Creating source file');
  const sourceFile = createSourceFile(fileName, content, scriptTarget, true, isTypeScript ? ScriptKind.TS : ScriptKind.JS);

  const functionName = orgFunctionName.replace(/^Object\./, '');

  let foundFunction: GitHubContentFunctionInfo | null = null;

  // Use dfs to visit the all nodes
  const visit = (node: Node) => {
    // Check for function declarations
    if (isFunctionDeclaration(node) && node.name) {
      const name = node.name.text;
      if (name === functionName) {
        foundFunction = extractFunctionInfo(node, sourceFile, name);
        return;
      }
    }

    // Check for method declarations in classes
    if (isMethodDeclaration(node) && node.name) {
      const name = (node.name as Identifier).text;
      if (name === functionName) {
        foundFunction = extractFunctionInfo(node, sourceFile, name);
        return;
      }
    }

    // Check for variable declarations assigned to the function name
    if (isVariableDeclaration(node) && node.name && node.initializer) {
      if (isIdentifier(node.name) && node.name.text === functionName) {
        foundFunction = extractFunctionInfo(node, sourceFile, functionName);
        return;
      }
    }

    // Check for export functionName = function patterns
    if (isExpressionStatement(node)) {
      const expr = node.expression;
      if (isBinaryExpression(expr) && expr.operatorToken.kind === SyntaxKind.EqualsToken) {
        const left = expr.left;
        const right = expr.right;

        if (isPropertyAccessExpression(left) && left.name.text === functionName && (isFunctionExpression(right) || isArrowFunction(right))) {
          foundFunction = extractFunctionInfo(node, sourceFile, functionName);
          return;
        }
      }
    }

    forEachChild(node, visit);
  };

  visit(sourceFile);
  return foundFunction;
};
