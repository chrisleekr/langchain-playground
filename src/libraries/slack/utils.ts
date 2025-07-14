import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';

dayjs.extend(utc);
dayjs.extend(timezone);

export const formatTimestamp = (orgTimestamp: string) => {
  return dayjs.unix(Number(orgTimestamp)).tz('Australia/Melbourne').format('DD MMM YYYY, hh:mm A');
};
