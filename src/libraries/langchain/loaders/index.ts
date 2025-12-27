/**
 * Custom document loaders
 */

import { Document } from '@langchain/core/documents';
import { BaseDocumentLoader } from '@langchain/core/document_loaders/base';
import type { Logger } from 'pino';
import { promises as fs } from 'fs';
import * as path from 'path';

/**
 * Simple text file loader
 */
export class TextLoader extends BaseDocumentLoader {
  constructor(private filePath: string) {
    super();
  }

  async load(): Promise<Document[]> {
    const content = await fs.readFile(this.filePath, 'utf-8');
    return [
      new Document({
        pageContent: content,
        metadata: {
          source: this.filePath
        }
      })
    ];
  }
}

/**
 * Traverses a JSON object using a JSON pointer path.
 * Throws an error if the path is invalid.
 *
 * @param json - The JSON object to traverse
 * @param pointer - The JSON pointer path (e.g., '/texts')
 * @returns The value at the pointer path
 */
const traverseJsonPointer = (json: unknown, pointer: string): unknown => {
  const keys = pointer.split('/').filter(Boolean);
  let current: unknown = json;

  for (const key of keys) {
    if (current === null || current === undefined) {
      throw new Error(`Invalid JSON pointer: ${pointer}. Path ends at null/undefined before key "${key}".`);
    }
    if (typeof current !== 'object') {
      throw new Error(`Invalid JSON pointer: ${pointer}. Cannot access key "${key}" on non-object type.`);
    }
    current = (current as Record<string, unknown>)[key];
  }

  return current;
};

/**
 * Converts a value to an array of strings for document content.
 */
const valueToTexts = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value.map((item: unknown) => (typeof item === 'string' ? item : JSON.stringify(item)));
  } else if (typeof value === 'string') {
    return [value];
  } else {
    return [JSON.stringify(value)];
  }
};

/**
 * Simple JSON file loader
 */
export class JSONLoader extends BaseDocumentLoader {
  constructor(
    private filePath: string,
    private jsonPointer?: string
  ) {
    super();
  }

  async load(): Promise<Document[]> {
    const content = await fs.readFile(this.filePath, 'utf-8');
    const json: unknown = JSON.parse(content);

    let texts: string[];

    if (this.jsonPointer) {
      const value = traverseJsonPointer(json, this.jsonPointer);
      texts = valueToTexts(value);
    } else {
      texts = [JSON.stringify(json)];
    }

    return texts.map(
      text =>
        new Document({
          pageContent: text,
          metadata: {
            source: this.filePath
          }
        })
    );
  }
}

/**
 * Simple JSONL (JSON Lines) file loader
 */
export class JSONLinesLoader extends BaseDocumentLoader {
  constructor(
    private filePath: string,
    private jsonPointer?: string
  ) {
    super();
  }

  async load(): Promise<Document[]> {
    const content = await fs.readFile(this.filePath, 'utf-8');
    const lines = content.split('\n').filter(line => line.trim());

    return lines.map(line => {
      const json: unknown = JSON.parse(line);
      let text: string;

      if (this.jsonPointer) {
        const value = traverseJsonPointer(json, this.jsonPointer);
        text = typeof value === 'string' ? value : JSON.stringify(value);
      } else {
        text = JSON.stringify(json);
      }

      return new Document({
        pageContent: text,
        metadata: {
          source: this.filePath
        }
      });
    });
  }
}

type LoaderFactory = (filePath: string) => BaseDocumentLoader;

/**
 * Directory loader that loads multiple file types from a directory
 */
export class DirectoryLoader extends BaseDocumentLoader {
  private logger?: Logger;

  constructor(
    private directoryPath: string,
    private loaderMap: Record<string, LoaderFactory>,
    logger?: Logger
  ) {
    super();
    this.logger = logger;
  }

  async load(): Promise<Document[]> {
    const documents: Document[] = [];
    await this.loadDirectory(this.directoryPath, documents);
    return documents;
  }

  private async loadDirectory(dirPath: string, documents: Document[]): Promise<void> {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);

      if (entry.isDirectory()) {
        await this.loadDirectory(fullPath, documents);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        const loaderFactory = this.loaderMap[ext];

        if (loaderFactory) {
          try {
            const loader = loaderFactory(fullPath);
            const docs = await loader.load();
            documents.push(...docs);
          } catch (error) {
            if (this.logger) {
              this.logger.warn({ error, filePath: fullPath }, 'Failed to load file');
            }
          }
        }
      }
    }
  }
}
