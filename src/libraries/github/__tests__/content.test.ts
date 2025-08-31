import fs from 'fs';
import path from 'path';
import { GitHubContentFunctionInfo } from '../types';
import { extractFunctionSourceCode } from '../content';

describe('libraries/github/content', () => {
  describe('extractFunctionSourceCode', () => {
    let result: GitHubContentFunctionInfo | null;
    const content = fs.readFileSync(path.join(__dirname, 'test.source.txt'), 'utf8');

    describe('when the function name is valid', () => {
      [
        {
          name: 'exported function',
          functionName: 'test',
          expected: {
            functionName: 'test',
            startLine: 1,
            startColumn: 14,
            endLine: 4,
            endColumn: 2,
            fullFunction: `test = () => {
  console.log('test');
  test2();
}`,
            functionBody: `console.log('test');
  test2();`
          }
        },
        {
          name: 'non-exported function',
          functionName: 'test2',
          expected: {
            functionName: 'test2',
            startLine: 6,
            endLine: 8,
            startColumn: 7,
            endColumn: 2,
            fullFunction: `test2 = () => {
  console.log('test2');
}`,
            functionBody: `console.log('test2');`
          }
        },
        {
          name: 'function assigned to a variable',
          functionName: 'getItems',
          expected: {
            functionName: 'getItems',
            startLine: 10,
            endLine: 13,
            startColumn: 14,
            endColumn: 2,
            fullFunction: `getItems = createSelector(
  (state: State) => getItems(state),
  (items): Array<App.Item> => items.filter(isItem),
)`,
            functionBody: `(state: State) => getItems(state),
  (items): Array<App.Item> => items.filter(isItem),`
          }
        }
      ].forEach(({ name, functionName, expected }) => {
        describe(`${name}`, () => {
          beforeEach(() => {
            result = extractFunctionSourceCode('test.ts', content, functionName);
          });

          it('should return the function info', () => {
            expect(result).toStrictEqual(expected);
          });
        });
      });
    });
  });
});
