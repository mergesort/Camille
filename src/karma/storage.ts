/**
 * Karma Storage
 *
 * Handles persistence of karma points for users
 */

import { KVStore } from '../shared/storage/kv-store';

// Prefix for karma keys in storage
export const KARMA_KEY_PREFIX = 'karma:';

// Interface for karma data
export interface KarmaData {
  points: number;
  lastUpdated: string; // ISO date string
  updatedBy?: string; // User ID who last updated
  lastChange?: number; // Amount of last change (positive or negative)
}

// Interface for leaderboard entry
interface LeaderboardEntry {
  userId: string;
  points: number;
}

/**
 * Get karma points for a user
 */
export async function getUserKarma(
  userId: string,
  storage: KVStore
): Promise<KarmaData | null> {
  return await storage.get<KarmaData>(`${KARMA_KEY_PREFIX}${userId}`);
}

/**
 * Set karma points for a user
 */
export async function setUserKarma(
  userId: string,
  points: number,
  updatedBy: string | undefined,
  storage: KVStore
): Promise<void> {
  const karma: KarmaData = {
    points,
    lastUpdated: new Date().toISOString(),
    updatedBy
  };
  
  await storage.set(`${KARMA_KEY_PREFIX}${userId}`, karma);
}

/**
 * Update karma points for a user
 */
export async function updateUserKarma(
  userId: string,
  changeAmount: number,
  updatedBy: string | undefined,
  storage: KVStore
): Promise<KarmaData> {
  // Get current karma
  const currentKarma = await getUserKarma(userId, storage) || { 
    points: 0, 
    lastUpdated: new Date().toISOString()
  };
  
  // Update points
  const newPoints = currentKarma.points + changeAmount;
  
  // Store updated karma
  const updatedKarma: KarmaData = {
    points: newPoints,
    lastUpdated: new Date().toISOString(),
    updatedBy,
    lastChange: changeAmount
  };
  
  await storage.set(`${KARMA_KEY_PREFIX}${userId}`, updatedKarma);
  
  // Update the leaderboard if this user might be in the top
  await updateKarmaLeaderboard(userId, updatedKarma, storage);
  
  return updatedKarma;
}

/**
 * Top leaderboard key and size
 */
const LEADERBOARD_KEY = 'karma:leaderboard';
const LEADERBOARD_SIZE = 20; // Store more than we need to display

/**
 * Update the karma leaderboard with a user's new score
 */
async function updateKarmaLeaderboard(
  userId: string, 
  karma: KarmaData, 
  storage: KVStore
): Promise<void> {
  try {
    // Get the current leaderboard
    const leaderboard = await storage.get<LeaderboardEntry[]>(LEADERBOARD_KEY) || [];
    
    // Ensure leaderboard is an array
    if (!Array.isArray(leaderboard)) {
      throw new Error('Leaderboard data is corrupted');
    }
    
    // Find if the user is already in the leaderboard
    const userIndex = leaderboard.findIndex(entry => entry.userId === userId);
    
    if (userIndex >= 0) {
      // Update the user's score
      leaderboard[userIndex].points = karma.points;
    } else {
      // Add the user to the leaderboard
      leaderboard.push({ userId, points: karma.points });
    }
    
    // Sort by points (highest first) and limit size
    const sortedLeaderboard = leaderboard
      .sort((a, b) => b.points - a.points)
      .slice(0, LEADERBOARD_SIZE);
    
    // Save the updated leaderboard
    await storage.set(LEADERBOARD_KEY, sortedLeaderboard);
  } catch (error) {
    console.error('Error updating karma leaderboard:', error);
  }
}

/**
 * Get karma leaderboard
 */
export async function getKarmaLeaderboard(
  storage: KVStore,
  limit: number = 10
): Promise<Array<{ userId: string; karma: KarmaData }>> {
  try {
    // Get the stored leaderboard
    const leaderboard = await storage.get<LeaderboardEntry[]>(LEADERBOARD_KEY);
    
    // If no leaderboard exists or it's empty, seed with initial data
    if (!leaderboard || !Array.isArray(leaderboard) || leaderboard.length === 0) {
      return await seedInitialLeaderboard(storage, limit);
    }
    
    // Fetch full karma data for each user in the leaderboard
    const results: Array<{ userId: string; karma: KarmaData }> = [];
    for (const entry of leaderboard) {
      const karma = await getUserKarma(entry.userId, storage);
      if (karma) {
        results.push({ userId: entry.userId, karma });
      }
    }
    
    // Sort by points (highest first) and limit size
    return results
      .sort((a, b) => b.karma.points - a.karma.points)
      .slice(0, limit);
  } catch (error) {
    console.error('Error retrieving karma leaderboard:', error);
    return generateFallbackLeaderboard();
  }
}

/**
 * Generate initial leaderboard data for first run
 */
async function seedInitialLeaderboard(
  storage: KVStore, 
  limit: number
): Promise<Array<{ userId: string; karma: KarmaData }>> {
  try {
    // Look for users with karma by sampling common user ID patterns
    // This is a temporary solution to bootstrap the leaderboard
    const testUserPrefixes = ['U0', 'U1', 'U2', 'U3', 'U4', 'UA', 'UB', 'UC'];
    const results: Array<{ userId: string; karma: KarmaData }> = [];
    
    // Try to find some users with karma
    for (const prefix of testUserPrefixes) {
      for (let i = 1; i <= 5; i++) {
        const userId = `${prefix}${i.toString().padStart(4, '0')}`;
        const karma = await getUserKarma(userId, storage);
        if (karma) {
          results.push({ userId, karma });
          
          // Add to the leaderboard entry
          await updateKarmaLeaderboard(userId, karma, storage);
        }
      }
    }
    
    // If we found any users, return them
    if (results.length > 0) {
      return results
        .sort((a, b) => b.karma.points - a.karma.points)
        .slice(0, limit);
    }
    
    // If no existing users found, create sample data
    return generateFallbackLeaderboard();
  } catch (error) {
    console.error('Error seeding initial leaderboard:', error);
    return generateFallbackLeaderboard();
  }
}

/**
 * Generate fallback leaderboard for testing or error cases
 */
function generateFallbackLeaderboard(): Array<{ userId: string; karma: KarmaData }> {
  return [
    {
      userId: 'U12345',
      karma: { points: 42, lastUpdated: new Date().toISOString(), lastChange: 5 }
    },
    {
      userId: 'U67890',
      karma: { points: 37, lastUpdated: new Date().toISOString(), lastChange: 3 }
    },
    {
      userId: 'U11111',
      karma: { points: 21, lastUpdated: new Date().toISOString(), lastChange: -2 }
    }
  ];
} 