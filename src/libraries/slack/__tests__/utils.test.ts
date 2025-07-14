import { formatTimestamp } from '../utils';

describe('slack utils', () => {
  describe('formatTimestamp', () => {
    [
      {
        timestamp: '1752393011.123456',
        expected: '13 Jul 2025, 05:50 PM'
      }
    ].forEach(({ timestamp, expected }) => {
      describe(`when timestamp is ${timestamp}`, () => {
        let result: string;
        beforeEach(() => {
          result = formatTimestamp(timestamp);
        });

        it(`should format timestamp ${timestamp} to ${expected}`, () => {
          expect(result).toBe(expected);
        });
      });
    });
  });
});
