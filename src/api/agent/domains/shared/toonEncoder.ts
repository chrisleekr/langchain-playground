import { encode } from '@toon-format/toon';

export interface ToonEncodeOptions {
  /**
   * Delimiter for separating fields. Tab ('\t') is most token-efficient for LLMs.
   * @default '\t'
   * @see https://github.com/toon-format/toon/blob/main/docs/guide/llm-prompts.md#delimiter-choices-for-token-efficiency
   */
  delimiter?: ',' | '\t' | '|';

  /**
   * Key folding strategy for additional token savings on large tabular datasets.
   * - 'safe': Fold keys that are unlikely to cause parsing issues
   * - 'off': No key folding
   * @default 'safe'
   * @see https://github.com/toon-format/toon/blob/main/docs/reference/api.md
   */
  keyFolding?: 'safe' | 'off';
}

/**
 * Encodes data to TOON (Token-Oriented Object Notation) format for LLM consumption.
 *
 * TOON is a compact, human-readable encoding that minimizes tokens while maintaining
 * structure that LLMs can reliably parse.
 *
 * ## When to Use TOON vs Compact JSON
 *
 * **Use TOON for:**
 * - Tabular arrays (uniform arrays of objects) - optimal use case
 * - Flat arrays with primitive values (strings, numbers, booleans)
 * - Shallow nested objects (1-2 levels deep)
 * - Expected savings: ~30-60% vs compact JSON for tabular data
 *
 * **Use compact JSON for:**
 * - Arrays of arrays (TOON less efficient due to inner array headers)
 * - Deeply nested objects (3+ levels deep)
 * - Single primitive values
 *
 * @see https://github.com/toon-format/toon
 * @see https://toonformat.dev
 *
 * @example
 * ```typescript
 * // GOOD: Flat array with primitive values - use TOON
 * const queries = [
 *   { rank: 1, sqlId: 'ABC123', avgDbLoad: 5.2, sqlText: 'SELECT...' },
 *   { rank: 2, sqlId: 'DEF456', avgDbLoad: 3.1, sqlText: 'INSERT...' }
 * ];
 * const encoded = toonEncodeForLLM(queries); // ~15% token savings
 *
 * // BAD: Nested objects - use JSON.stringify() instead
 * const instances = [
 *   { id: 'db-1', metrics: { cpu: 45, memory: 1024 } }  // nested!
 * ];
 * const encoded = JSON.stringify(instances); // More efficient for nested data
 * ```
 */
export const toonEncodeForLLM = <T>(data: T, options?: ToonEncodeOptions): string => {
  // Tab delimiter + key folding = maximum token efficiency for LLM contexts
  // @see https://github.com/toon-format/toon/blob/main/docs/reference/api.md
  return encode(data, {
    delimiter: options?.delimiter ?? '\t',
    keyFolding: options?.keyFolding ?? 'safe'
  });
};
