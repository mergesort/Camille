/**
 * Tests for the greetings module
 */

import { processGreeting } from '../greetings';
import { Logger } from '../../shared/logging/logger';
import { Config } from '../../shared/config/config';
import { asyncContext } from '../../shared/context/app-context';

// Mock logger
const mockLogger: Logger = {
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
};

// Mock config with a bot ID
const mockConfig: Config = {
  apiHost: 'https://example.com',
  slackApiToken: 'test-token',
  slackSigningSecret: 'test-secret',
  slackBotId: 'U12345678',
  slackCommunityId: 'T12345678'
};

describe('Greetings Module', () => {
  beforeAll(() => {
    asyncContext.enterWith({
      logger: mockLogger,
      config: mockConfig
    });
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });
  
  describe('processGreeting', () => {
    test('should recognize a direct greeting to the bot', async () => {
      const result = await processGreeting(
        'hi <@U12345678>',
        'USER1'
      );
      
      expect(result.isGreeting).toBe(true);
      expect(result.response).toMatch(/back at you <@USER1>/);
      expect(result.shouldAddReaction).toBe(true);
      expect(mockLogger.info).toHaveBeenCalled();
    });
    
    test('should recognize a greeting with the bot mentioned', async () => {
      const result = await processGreeting(
        'hello there <@U12345678>, how are you?',
        'USER1'
      );
      
      expect(result.isGreeting).toBe(true);
      expect(result.response).toMatch(/back at you <@USER1>/);
      expect(result.shouldAddReaction).toBe(true);
    });
    
    test('should ignore messages without a bot mention', async () => {
      const result = await processGreeting(
        'hello everyone',
        'USER1'
      );
      
      expect(result.isGreeting).toBe(false);
      expect(result.response).toBeNull();
      expect(result.shouldAddReaction).toBe(false);
    });
    
    test('should ignore messages to the bot without greetings', async () => {
      const result = await processGreeting(
        '<@U12345678> what is the karma for <@USER2>?',
        'USER1'
      );
      
      expect(result.isGreeting).toBe(false);
      expect(result.response).toBeNull();
      expect(result.shouldAddReaction).toBe(false);
    });
    
    test('should recognize different greeting words', async () => {
      const greetings = [
        'hi <@U12345678>',
        'hello <@U12345678>',
        'hey <@U12345678>',
        'howdy <@U12345678>',
        'gday <@U12345678>',
        'g\'day <@U12345678>',
        'yo <@U12345678>',
        'sup <@U12345678>',
        'heya <@U12345678>',
        'hola <@U12345678>',
        'bonjour <@U12345678>'
      ];
      
      for (const greeting of greetings) {
        const result = await processGreeting(
          greeting,
          'USER1'
        );
        
        expect(result.isGreeting).toBe(true);
        expect(result.response).toMatch(/back at you <@USER1>/);
        expect(result.shouldAddReaction).toBe(true);
      }
    });
    
    test('should handle errors gracefully', async () => {
      // Mock logger.debug to throw an error
      mockLogger.debug = jest.fn().mockImplementation(() => {
        throw new Error('Forced error for testing');
      });
      
      const result = await processGreeting(
        'hi <@U12345678>',
        'USER1'
      );
      
      expect(result.isGreeting).toBe(false);
      expect(result.response).toBeNull();
      expect(result.shouldAddReaction).toBe(false);
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });
}); 