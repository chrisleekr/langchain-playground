import { formatTimestamp, parseArchiveURLs, parseThreadTsFromArchiveURL, ParseThreadTsFromArchiveURLResult } from '../utils';

describe('slack utils', () => {
  describe('formatTimestamp', () => {
    [
      {
        timestamp: '1752393011.123456',
        expected: '13 Jul 2025, 17:50:11.123'
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

  describe('parseArchiveURLs', () => {
    [
      {
        text: 'https://my.slack.com/archives/C012345678/p17519123456123456\n\nAnother archive URL: https://my.slack.com/archives/C012345679/p17519123456123457',
        expected: ['https://my.slack.com/archives/C012345678/p17519123456123456', 'https://my.slack.com/archives/C012345679/p17519123456123457']
      }
    ].forEach(({ text, expected }) => {
      describe(`when text is ${text}`, () => {
        let result: string[];
        beforeEach(() => {
          result = parseArchiveURLs(text);
        });

        it(`should parse archive URLs ${text} to ${expected}`, () => {
          expect(result).toStrictEqual(expected);
        });
      });
    });
  });

  describe('parseThreadTsFromArchiveURL', () => {
    [
      {
        archiveURL: 'https://my.slack.com/archives/C012345678/p17519123456123456',
        expected: { channelId: 'C012345678', threadTs: '1751912345.6123456' }
      }
    ].forEach(({ archiveURL, expected }) => {
      describe(`when archiveURL is ${archiveURL}`, () => {
        let result: ParseThreadTsFromArchiveURLResult | null;
        beforeEach(() => {
          result = parseThreadTsFromArchiveURL(archiveURL);
        });

        it(`should parse thread ts from archive URL ${archiveURL} to ${expected}`, () => {
          expect(result).toStrictEqual(expected);
        });
      });
    });
  });
});
