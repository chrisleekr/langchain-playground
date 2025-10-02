/* eslint-disable import/no-named-as-default-member */
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import config from 'config';

dayjs.extend(utc);
dayjs.extend(timezone);

export const formatTimestamp = (orgTimestamp: string) => {
  return dayjs.unix(Number(orgTimestamp)).tz(config.get('timezone')).format('DD MMM YYYY, HH:mm:ss.SSS');
};

/**
 * Check if the text contains archive URLs.
 * If found, parse archive URLs and return all of them.
 *
 * https://<aliasDomain>.slack.com/archives/<channelId>/p<encodedTs>
 *
 *
 * @param text
 * @return string[]
 */
export const parseArchiveURLs = (text: string): string[] => {
  // Regex pattern to match Slack archive URLs
  // Matches: https://{workspace}.slack.com/archives/{channelId}/p{timestamp}
  const archiveUrlPattern = /https:\/\/[^\/]+\.slack\.com\/archives\/[A-Za-z0-9]+\/p\d+/g;

  const match = text.match(archiveUrlPattern) || [];

  return match;
};

/**
 * Archive link example: https://<aliasDomain>.slack.com/archives/<channelId>/p<encodedTs>
 *
 * ts: p1758289828459279 → 1758289828.459279
 */

export interface ParseThreadTsFromArchiveURLResult {
  channelId: string;
  threadTs: string;
}

export const parseThreadTsFromArchiveURL = (archiveURL: string): ParseThreadTsFromArchiveURLResult | null => {
  // Regex pattern to match and capture Slack archive URL components
  // Matches: https://{workspace}.slack.com/archives/{channelId}/p{timestamp}
  const archiveUrlPattern = /https:\/\/[^\/]+\.slack\.com\/archives\/[A-Za-z0-9]+\/p\d+/g;

  const match = archiveURL.match(archiveUrlPattern);

  if (!match) {
    return null;
  }

  const [, channelId, timestampDigits] = match;

  // Insert dot at position 10 to convert from encoded timestamp to thread timestamp
  // e.g., "17519123456123456" → "1751912345.6123456"
  const threadTs = timestampDigits.slice(0, 10) + '.' + timestampDigits.slice(10);

  return { channelId, threadTs };
};

export const isImageMimeType = (mimeType: string): boolean => {
  const imageMimeTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
  return imageMimeTypes.includes(mimeType);
};
