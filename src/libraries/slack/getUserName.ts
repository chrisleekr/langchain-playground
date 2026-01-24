import type { WebClient } from '@slack/web-api';
import { logger } from '@/libraries';

// Cache user names using Map for type-safe key access
const userNameCache = new Map<string, string>();

export const getUserName = async (client: WebClient, userId: string): Promise<string> => {
  logger.debug({ cacheSize: userNameCache.size }, 'getUserName called');
  try {
    const cachedName = userNameCache.get(userId);
    if (cachedName) {
      logger.info({ userId }, 'getUserName User name cache hit');
      return cachedName;
    }

    const result = await client.users.info({
      user: userId
    });

    // Get the display name or fall back to real name
    const displayName = result.user?.profile?.display_name || result.user?.real_name || result.user?.name;
    const nameToCache = displayName || userId;
    userNameCache.set(userId, nameToCache);
    logger.info({ userId, displayName }, 'getUserName User name cache set');
    return nameToCache;
  } catch (error) {
    logger.error({ error }, 'getUserName Error fetching user info');
    return userId; // Return the ID as fallback
  }
};
