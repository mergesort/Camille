import { getUserKarma, setUserKarma, updateUserKarma } from '../storage';
import { KVStore } from '../../shared/storage/kv-store';

describe('Karma Storage', () => {
  // Mock KVStore
  let mockStorage: jest.Mocked<KVStore>;
  
  // Test user ID
  const USER_ID = 'U12345';
  
  beforeEach(() => {
    // Setup mock
    mockStorage = {
      get: jest.fn(),
      set: jest.fn(),
      delete: jest.fn(),
    } as unknown as jest.Mocked<KVStore>;
    
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
    test('should return null for users with no karma', async () => {
      mockStorage.get.mockResolvedValue(null);
      
      const result = await getUserKarma(USER_ID, mockStorage);
      
      expect(mockStorage.get).toHaveBeenCalledWith(`karma:${USER_ID}`);
      expect(result).toBeNull();
    });
    
    test('should return karma data for users with karma', async () => {
      const mockKarma = { points: 42, lastUpdated: new Date().toISOString() };
      mockStorage.get.mockResolvedValue(mockKarma);
      
      const result = await getUserKarma(USER_ID, mockStorage);
      
      expect(mockStorage.get).toHaveBeenCalledWith(`karma:${USER_ID}`);
      expect(result).toEqual(mockKarma);
    });
  });
  
  describe('setUserKarma', () => {
    test('should store karma data with the correct key', async () => {
      const points = 10;
      const updatedBy = 'U67890';
      
      await setUserKarma(USER_ID, points, updatedBy, mockStorage);
      
      expect(mockStorage.set).toHaveBeenCalledWith(
        `karma:${USER_ID}`,
        expect.objectContaining({
          points: 10,
          updatedBy: 'U67890'
        })
      );
    });
    
    test('should include timestamp in stored data', async () => {
      // Mock Date.now to get consistent test results
      const mockDate = new Date('2023-01-01T12:00:00Z');
      const originalDate = global.Date;
      global.Date = jest.fn(() => mockDate) as unknown as DateConstructor;
      
      await setUserKarma(USER_ID, 5, undefined, mockStorage);
      
      expect(mockStorage.set).toHaveBeenCalledWith(
        `karma:${USER_ID}`,
        expect.objectContaining({
          points: 5,
          lastUpdated: mockDate.toISOString()
        })
      );
      
      // Restore Date
      global.Date = originalDate;
    });
  });
  
  describe('updateUserKarma', () => {
    test('should initialize karma at 0 for new users', async () => {
      mockStorage.get.mockResolvedValue(null);
      
      const result = await updateUserKarma(USER_ID, 5, 'U67890', mockStorage);
      
      expect(result.points).toBe(5); // 0 + 5 = 5
      expect(mockStorage.set).toHaveBeenCalledWith(
        `karma:${USER_ID}`,
        expect.objectContaining({ points: 5 })
      );
    });
    
    test('should add karma to existing points', async () => {
      mockStorage.get.mockResolvedValue({
        points: 10,
        lastUpdated: new Date().toISOString()
      });
      
      const result = await updateUserKarma(USER_ID, 3, 'U67890', mockStorage);
      
      expect(result.points).toBe(13); // 10 + 3 = 13
      expect(mockStorage.set).toHaveBeenCalledWith(
        `karma:${USER_ID}`,
        expect.objectContaining({ points: 13 })
      );
    });
    
    test('should subtract karma from existing points', async () => {
      mockStorage.get.mockResolvedValue({
        points: 10,
        lastUpdated: new Date().toISOString()
      });
      
      const result = await updateUserKarma(USER_ID, -3, 'U67890', mockStorage);
      
      expect(result.points).toBe(7); // 10 - 3 = 7
      expect(mockStorage.set).toHaveBeenCalledWith(
        `karma:${USER_ID}`,
        expect.objectContaining({ points: 7 })
      );
    });
    
    test('should update lastUpdated timestamp', async () => {
      mockStorage.get.mockResolvedValue({
        points: 10,
        lastUpdated: '2022-01-01T00:00:00Z'
      });
      
      // Mock Date.now to get consistent test results
      const mockDate = new Date('2023-01-01T12:00:00Z');
      const originalDate = global.Date;
      global.Date = jest.fn(() => mockDate) as unknown as DateConstructor;
      
      const result = await updateUserKarma(USER_ID, 5, 'U67890', mockStorage);
      
      expect(result.lastUpdated).toBe(mockDate.toISOString());
      
      // Restore Date
      global.Date = originalDate;
    });
    
    test('should update the updatedBy field', async () => {
      mockStorage.get.mockResolvedValue({
        points: 10,
        lastUpdated: new Date().toISOString(),
        updatedBy: 'OLD_USER'
      });
      
      const result = await updateUserKarma(USER_ID, 5, 'NEW_USER', mockStorage);
      
      expect(result.updatedBy).toBe('NEW_USER');
    });
  });
}); 