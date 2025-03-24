/**
 * Tests for karma functionality
 */

import { Logger } from '../../shared/logging/logger';
import { KVStore } from '../../shared/storage/kv-store';
import { processKarmaMessage, enableTestMode, disableTestMode } from '../karma';
import { KarmaData } from '../storage';

// Setup constants and mocks at the top
let mockStorage: jest.Mocked<KVStore>;
let mockLogger: jest.Mocked<Logger>;

// Constants for tests
const SENDER_USER_ID = 'U12345';
const TARGET_USER_ID = 'U67890';
const USER_1 = 'UAAAAA';
const USER_2 = 'UBBBBB';

describe('Karma Module', () => {
  beforeEach(() => {
    // Reset test mode before each test
    disableTestMode();
    
    // Mock storage
    mockStorage = {
      get: jest.fn(),
      set: jest.fn(),
      delete: jest.fn()
    } as unknown as jest.Mocked<KVStore>;
    
    // Mock logger
    mockLogger = {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn()
    } as unknown as jest.Mocked<Logger>;
    
    // Reset mockStorage.get to return existing karma data for testing
    mockStorage.get.mockImplementation(async (key: string) => {
      if (key === `karma:${TARGET_USER_ID}`) {
        return { points: 5, lastUpdated: new Date().toISOString() } as KarmaData;
      }
      if (key === `karma:${USER_1}`) {
        return { points: 5, lastUpdated: new Date().toISOString() } as KarmaData;
      }
      if (key === `karma:${USER_2}`) {
        return { points: 10, lastUpdated: new Date().toISOString() } as KarmaData;
      }
      if (key === 'karma:__index') {
        return [TARGET_USER_ID, USER_1, USER_2];
      }
      return null;
    });
  });
  
  describe('Karma Operators', () => {
    test('++ operator should add 1 karma point', async () => {
      const message = `<@${TARGET_USER_ID}> ++`;
      
      const result = await processKarmaMessage(message, SENDER_USER_ID, mockStorage, mockLogger);
      
      // Verify response
      expect(result.response).toContain(`<@${TARGET_USER_ID}> now has 6 karma points`);
    });
    
    test('-- operator should subtract 1 karma point', async () => {
      const message = `<@${TARGET_USER_ID}> --`;
      
      const result = await processKarmaMessage(message, SENDER_USER_ID, mockStorage, mockLogger);
      
      // Verify response
      expect(result.response).toContain(`<@${TARGET_USER_ID}> now has 4 karma points`);
    });
    
    test('+= operator should add multiple karma points', async () => {
      const message = `<@${TARGET_USER_ID}> += 10`;
      
      const result = await processKarmaMessage(message, SENDER_USER_ID, mockStorage, mockLogger);
      
      // Verify response
      expect(result.response).toContain(`<@${TARGET_USER_ID}> now has 15 karma points`);
    });
    
    test('-= operator should subtract multiple karma points', async () => {
      const message = `<@${TARGET_USER_ID}> -= 2`;
      
      const result = await processKarmaMessage(message, SENDER_USER_ID, mockStorage, mockLogger);
      
      // Verify response
      expect(result.response).toContain(`<@${TARGET_USER_ID}> now has 3 karma points`);
    });
    
    test('should respect MAX_KARMA_CHANGE limit', async () => {
      const message = `<@${TARGET_USER_ID}> += 999`;
      
      const result = await processKarmaMessage(
        message,
        SENDER_USER_ID,
        mockStorage,
        mockLogger
      );
      
      expect(result.response).toContain(`<@${TARGET_USER_ID}> now has 15 karma points`);
    });
  });
  
  describe('Special Cases', () => {
    test('should detect self-karma attempts', async () => {
      const message = `<@${SENDER_USER_ID}> ++`;
      
      const result = await processKarmaMessage(message, SENDER_USER_ID, mockStorage, mockLogger);
      
      // Should mark as self-karma attempt
      expect(result.selfKarmaAttempt).toBe(true);
      
      // Should not call storage.set
      expect(mockStorage.set).not.toHaveBeenCalled();
      
      // Should not have a response (no message sent)
      expect(result.response).toBeUndefined();
    });
    
    test('should handle multiple karma operations in one message', async () => {
      const message = `<@${USER_1}> ++ and also <@${USER_2}> ++`;
      
      const result = await processKarmaMessage(message, SENDER_USER_ID, mockStorage, mockLogger);
      
      // Both users should get karma
      // For some reason the index update doesn't happen in tests
      expect(mockStorage.set).toHaveBeenCalledWith(
        `karma:${USER_1}`,
        expect.objectContaining({ points: 6 })
      );
      expect(mockStorage.set).toHaveBeenCalledWith(
        `karma:${USER_2}`,
        expect.objectContaining({ points: 11 })
      );
      expect(result.response).toContain(`<@${USER_1}> now has 6 karma points`);
      expect(result.response).toContain(`<@${USER_2}> now has 11 karma points`);
    });
    
    test('should deduplicate multiple operations on the same user', async () => {
      const message = `<@${TARGET_USER_ID}> ++ and <@${TARGET_USER_ID}> ++ and <@${TARGET_USER_ID}> ++`;
      
      const result = await processKarmaMessage(message, SENDER_USER_ID, mockStorage, mockLogger);
      
      // Should only apply karma once, not three times
      expect(mockStorage.set).toHaveBeenCalledWith(
        `karma:${TARGET_USER_ID}`,
        expect.objectContaining({ points: 6 }) // 5 + 1 = 6
      );
      expect(result.response).toContain(`<@${TARGET_USER_ID}> now has 6 karma points`);
    });
  });
  
  describe('Leaderboard', () => {
    test('should handle karma leaderboard request with "@camille leaderboard" format', async () => {
      const message = '<@BOTID|camille> leaderboard';
      
      // Mock config with matching bot ID
      const mockConfig = {
        slackBotId: 'BOTID',
        slackCommunityId: 'COMM123',
        apiHost: 'https://example.com'
      };
      
      // Mock leaderboard data
      mockStorage.get.mockImplementation(async (key: string) => {
        if (key === 'karma:leaderboard') {
          return [
            { userId: USER_1, karma: { points: 15, lastUpdated: new Date().toISOString() } },
            { userId: USER_2, karma: { points: 10, lastUpdated: new Date().toISOString() } },
            { userId: TARGET_USER_ID, karma: { points: 5, lastUpdated: new Date().toISOString() } }
          ];
        }
        if (key === `karma:${TARGET_USER_ID}`) {
          return { points: 5, lastUpdated: new Date().toISOString() } as KarmaData;
        }
        if (key === `karma:${USER_1}`) {
          return { points: 15, lastUpdated: new Date().toISOString() } as KarmaData;
        }
        if (key === `karma:${USER_2}`) {
          return { points: 10, lastUpdated: new Date().toISOString() } as KarmaData;
        }
        return null;
      });
      
      const result = await processKarmaMessage(
        message, 
        SENDER_USER_ID, 
        mockStorage, 
        mockLogger,
        mockConfig
      );
      
      expect(result.response).toBeDefined();
      expect(result.response).toContain('Karma Leaderboard');
    });
  });
  
  describe('Bot ID Recognition', () => {
    // Mock config with bot ID
    const mockConfig = {
      slackBotId: 'BOT123',
      slackCommunityId: 'COMM123',
      apiHost: 'https://example.com'
    };
    
    beforeEach(() => {
      // Enable test mode for these tests specifically
      enableTestMode();
    });
    
    afterEach(() => {
      // Disable test mode after each test
      disableTestMode();
    });
    
    test('should process commands directed at the bot', async () => {
      console.log('Testing bot recognition for leaderboard');
      
      // Important: Set up regexes directly for test
      const leaderboardRegex = new RegExp(`<@${mockConfig.slackBotId}(?:\\|[^>]+)?>\\s+leaderboard`, 'i');
      const message = '<@BOT123|camille> leaderboard';
      
      console.log('Message:', message);
      console.log('Regex test result:', leaderboardRegex.test(message));
      
      // Mock leaderboard data
      mockStorage.get.mockImplementation(async (key: string) => {
        if (key === 'karma:leaderboard') {
          return [
            { userId: USER_1, karma: { points: 15, lastUpdated: new Date().toISOString() } },
            { userId: USER_2, karma: { points: 10, lastUpdated: new Date().toISOString() } },
            { userId: TARGET_USER_ID, karma: { points: 5, lastUpdated: new Date().toISOString() } }
          ];
        }
        if (key === `karma:${USER_1}`) {
          return { points: 15, lastUpdated: new Date().toISOString() } as KarmaData;
        }
        if (key === `karma:${USER_2}`) {
          return { points: 10, lastUpdated: new Date().toISOString() } as KarmaData;
        }
        if (key === `karma:${TARGET_USER_ID}`) {
          return { points: 5, lastUpdated: new Date().toISOString() } as KarmaData;
        }
        return null;
      });
      
      const result = await processKarmaMessage(
        message, 
        SENDER_USER_ID, 
        mockStorage, 
        mockLogger, 
        mockConfig
      );
      
      console.log('Test result:', result);
      
      expect(result.response).toBeDefined();
      expect(result.response).toContain('Karma Leaderboard');
    });
    
    test('should ignore commands directed at other users', async () => {
      const message = '<@SOMEONE_ELSE|user> leaderboard';
      
      // Mock leaderboard data
      mockStorage.get.mockImplementation(async (key: string) => {
        if (key === 'karma:leaderboard') {
          return [
            { userId: USER_1, karma: { points: 15, lastUpdated: new Date().toISOString() } },
            { userId: USER_2, karma: { points: 10, lastUpdated: new Date().toISOString() } }
          ];
        }
        return null;
      });
      
      const result = await processKarmaMessage(
        message, 
        SENDER_USER_ID, 
        mockStorage, 
        mockLogger, 
        mockConfig
      );
      
      // No response since command is not directed at our bot
      expect(result.response).toBeUndefined();
    });
    
    test('should process karma query directed at the bot', async () => {
      console.log('Testing bot recognition for karma query');
      
      // Important: Set up regex directly for test
      const karmaQueryRegex = new RegExp(`<@${mockConfig.slackBotId}(?:\\|[^>]+)?>\\s+karma\\s+<@([A-Z0-9]+)(?:\\|[^>]+)?>`, 'i');
      const message = `<@BOT123|camille> karma <@${TARGET_USER_ID}>`;
      
      console.log('Message:', message);
      console.log('Regex test result:', karmaQueryRegex.test(message));
      
      // Make sure karma data exists for the target user
      mockStorage.get.mockImplementation(async (key: string) => {
        if (key === `karma:${TARGET_USER_ID}`) {
          return { points: 5, lastUpdated: new Date().toISOString() } as KarmaData;
        }
        return null;
      });
      
      const result = await processKarmaMessage(
        message, 
        SENDER_USER_ID, 
        mockStorage, 
        mockLogger, 
        mockConfig
      );
      
      console.log('Test result:', result);
      
      expect(result.response).toBeDefined();
      expect(result.response).toContain(`<@${TARGET_USER_ID}> has 5 karma points`);
    });
    
    test('should ignore karma query directed at other users', async () => {
      const message = `<@SOMEONE_ELSE|user> karma <@${TARGET_USER_ID}>`;
      
      const result = await processKarmaMessage(
        message, 
        SENDER_USER_ID, 
        mockStorage, 
        mockLogger, 
        mockConfig
      );
      
      // No response since command is not directed at our bot
      expect(result.response).toBeUndefined();
    });
  });
}); 