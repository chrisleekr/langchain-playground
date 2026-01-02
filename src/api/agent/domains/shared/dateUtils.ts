/* eslint-disable import/no-named-as-default-member */
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import config from 'config';

dayjs.extend(utc);
dayjs.extend(timezone);

/**
 * Gets the configured timezone from config.
 * Defaults to 'Australia/Melbourne' if not set.
 */
export const getConfiguredTimezone = (): string => {
  return config.get<string>('timezone') || 'Australia/Melbourne';
};

/**
 * Gets current date/time formatted with timezone for agent prompts.
 *
 * @returns Formatted date/time string with timezone (e.g., "2026-01-02 05:16:58+11:00 (Australia/Melbourne)")
 */
export const getCurrentDateTimeWithTimezone = (): string => {
  const tz = getConfiguredTimezone();
  const now = dayjs().tz(tz);

  // Format: YYYY-MM-DD HH:mm:ss+TZ:00
  const formatted = now.format('YYYY-MM-DD HH:mm:ssZ');

  return `${formatted} (${tz})`;
};

/**
 * Gets the NRQL-compatible date format example for the current timezone.
 * NRQL accepts: 'YYYY-MM-DD HH:MM:SS+TZ:00' format
 *
 * @returns Example format string for NRQL SINCE/UNTIL clauses
 */
export const getNRQLDateFormatExample = (): string => {
  const tz = getConfiguredTimezone();
  const now = dayjs().tz(tz);

  // Example format for NRQL
  return now.format('YYYY-MM-DD HH:mm:ssZ');
};

/**
 * Gets the timezone offset in format like "+11:00" or "-05:00"
 */
export const getTimezoneOffset = (): string => {
  const tz = getConfiguredTimezone();
  return dayjs().tz(tz).format('Z');
};
