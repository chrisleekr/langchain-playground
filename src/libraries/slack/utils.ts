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
