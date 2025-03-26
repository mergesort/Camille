import { getUserKarma, setUserKarma, updateUserKarma, getKarmaLeaderboard, KarmaData } from '../storage';
import { DefaultMockContext, testWithContext } from '../../testing/testWithContext';

// // Setup constants and mocks at the top
const mockContext = DefaultMockContext;
const mockStorage = mockContext.storage;
const mockLogger = mockContext.logger;

describe('Karma Storage', () => {
  // Mock KVStore
  
  // Test user IDs
  const USER_1 = 'U12345';
  const USER_2 = 'U67890';
  const USER_3 = 'U11111';
  
  beforeEach(() => {    
    // Default behavior
    mockStorage.get.mockImplementation(async (key: string) => {
      if (key === 'karma:leaderboard') {
        return []; // Return empty array for leaderboard by default
      }
      return null;
    });
    mockStorage.set.mockResolvedValue(undefined);
  });
  
  describe('getUserKarma', () => {
    testWithContext('should return null for users with no karma', async () => {
      mockStorage.get.mockResolvedValue(null);
      
      const result = await getUserKarma(USER_1, mockStorage);
      
      expect(mockStorage.get).toHaveBeenCalledWith(`karma:${USER_1}`);
      expect(result).toBeNull();
    });
    
    testWithContext('should return karma data for users with karma', async () => {
      const mockKarma = { points: 42, lastUpdated: new Date().toISOString() };
      mockStorage.get.mockResolvedValue(mockKarma);
      
      const result = await getUserKarma(USER_1, mockStorage);
      
      expect(mockStorage.get).toHaveBeenCalledWith(`karma:${USER_1}`);
      expect(result).toEqual(mockKarma);
    });
  });
  
  describe('setUserKarma', () => {
    testWithContext('should store karma data for a user', async () => {
      const points = 42;
      const updatedBy = 'U98765';
      
      await setUserKarma(USER_1, points, updatedBy, mockStorage);
      
      expect(mockStorage.set).toHaveBeenCalledWith(
        `karma:${USER_1}`,
        expect.objectContaining({
          points,
          updatedBy,
          lastUpdated: expect.any(String)
        })
      );
    });
  });
  
  describe('updateUserKarma', () => {
    testWithContext('should update karma points for a user', async () => {
      const initialKarma = { points: 5, lastUpdated: new Date().toISOString() };
      mockStorage.get.mockImplementation(async (key: string) => {
        if (key === `karma:${USER_1}`) {
          return initialKarma;
        }
        return null;
      });
      
      const result = await updateUserKarma(USER_1, 3, 'U98765', mockStorage);
      
      expect(result.points).toBe(8);
      expect(result.updatedBy).toBe('U98765');
      expect(mockStorage.set).toHaveBeenCalledWith(
        `karma:${USER_1}`,
        expect.objectContaining({
          points: 8,
          updatedBy: 'U98765',
          lastUpdated: expect.any(String)
        })
      );
    });
    
    testWithContext('should initialize karma for new users', async () => {
      mockStorage.get.mockResolvedValue(null);
      
      const result = await updateUserKarma(USER_1, 5, 'U98765', mockStorage);
      
      expect(result.points).toBe(5);
      expect(result.updatedBy).toBe('U98765');
    });
  });
  
  describe('getKarmaLeaderboard', () => {
    testWithContext('should return leaderboard data when available', async () => {
      const leaderboardData = [
        { userId: USER_1, points: 42 },
        { userId: USER_2, points: 37 },
        { userId: USER_3, points: 21 }
      ];
      
      const karmaData: Record<string, KarmaData> = {
        [USER_1]: { points: 42, lastUpdated: new Date().toISOString() },
        [USER_2]: { points: 37, lastUpdated: new Date().toISOString() },
        [USER_3]: { points: 21, lastUpdated: new Date().toISOString() }
      };
      
      mockStorage.get.mockImplementation(async (key: string) => {
        if (key === 'karma:leaderboard') {
          return leaderboardData;
        }
        const userId = key.replace('karma:', '');
        return karmaData[userId] || null;
      });
      
      const result = await getKarmaLeaderboard(mockStorage);
      
      expect(result).toHaveLength(3);
      expect(result[0].userId).toBe(USER_1);
      expect(result[0].karma.points).toBe(42);
      expect(result[1].userId).toBe(USER_2);
      expect(result[1].karma.points).toBe(37);
      expect(result[2].userId).toBe(USER_3);
      expect(result[2].karma.points).toBe(21);
    });
    
    testWithContext('should handle corrupted leaderboard data', async () => {
      // Simulate corrupted data by returning a non-array
      mockStorage.get.mockImplementation(async (key: string) => {
        if (key === 'karma:leaderboard') {
          return { corrupted: true };
        }
        return null;
      });
      
      const result = await getKarmaLeaderboard(mockStorage);
      
      // Should return fallback data
      expect(result).toHaveLength(3);
      expect(result[0].karma.points).toBeGreaterThan(0);
    });
    
    testWithContext('should handle empty leaderboard', async () => {
      mockStorage.get.mockImplementation(async (key: string) => {
        if (key === 'karma:leaderboard') {
          return [];
        }
        return null;
      });
      
      const result = await getKarmaLeaderboard(mockStorage);
      
      // Should return fallback data
      expect(result).toHaveLength(3);
      expect(result[0].karma.points).toBeGreaterThan(0);
    });
    
    testWithContext('should respect the limit parameter', async () => {
      const leaderboardData = [
        { userId: USER_1, points: 42 },
        { userId: USER_2, points: 37 },
        { userId: USER_3, points: 21 }
      ];
      
      const karmaData: Record<string, KarmaData> = {
        [USER_1]: { points: 42, lastUpdated: new Date().toISOString() },
        [USER_2]: { points: 37, lastUpdated: new Date().toISOString() },
        [USER_3]: { points: 21, lastUpdated: new Date().toISOString() }
      };
      
      mockStorage.get.mockImplementation(async (key: string) => {
        if (key === 'karma:leaderboard') {
          return leaderboardData;
        }
        const userId = key.replace('karma:', '');
        return karmaData[userId] || null;
      });
      
      const result = await getKarmaLeaderboard(mockStorage, 2);
      
      expect(result).toHaveLength(2);
      expect(result[0].userId).toBe(USER_1);
      expect(result[1].userId).toBe(USER_2);
    });
  });
}); 