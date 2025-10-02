import type { WebClient } from '@slack/web-api';
import { logger } from '@/libraries';

// Cache user names
const userNameCache: Record<string, string> = {};

export const getUserName = async (client: WebClient, userId: string): Promise<string> => {
  logger.info({ userNameCache }, 'getUserName userNameCache');
  try {
    if (userNameCache[userId]) {
      logger.info({ userId }, 'getUserName User name cache hit');
      return userNameCache[userId];
    }

    const result = await client.users.info({
      user: userId
    });

    // Get the display name or fall back to real name
    const displayName = result.user?.profile?.display_name || result.user?.real_name || result.user?.name;
    userNameCache[userId] = displayName || userId;
    logger.info({ userId, displayName }, 'getUserName User name cache set');
    return displayName || userId;
  } catch (error) {
    logger.error({ error }, 'getUserName Error fetching user info');
    return userId; // Return the ID as fallback
  }
};
