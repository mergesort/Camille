/**
 * Tests for the auto-responder module
 */

import { processMessageForAutoResponse } from '../auto-responder';
import { Logger } from '../../shared/logging/logger';
import { Config } from '../../shared/config/config';

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

describe('Auto-Responder Module', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });
  
  describe('processMessageForAutoResponse', () => {
    test('should detect "hey guys" phrase', async () => {
      const result = await processMessageForAutoResponse(
        'hey guys, how is everyone doing?',
        'USER1',
        mockLogger,
        mockConfig
      );
      
      expect(result.shouldRespond).toBe(true);
      expect(result.response).toContain('promote inclusivity');
      expect(result.response).toContain('alternative to guys');
      expect(mockLogger.info).toHaveBeenCalled();
    });
    
    test('should detect "you guys" phrase', async () => {
      const result = await processMessageForAutoResponse(
        'what do you guys think about this feature?',
        'USER1',
        mockLogger,
        mockConfig
      );
      
      expect(result.shouldRespond).toBe(true);
      expect(result.response).toContain('promote inclusivity');
    });
    
    test('should detect "thanks guys" phrase', async () => {
      const result = await processMessageForAutoResponse(
        'thanks guys for your help!',
        'USER1',
        mockLogger,
        mockConfig
      );
      
      expect(result.shouldRespond).toBe(true);
      expect(result.response).toContain('promote inclusivity');
    });
    
    test('should detect "hi guys" phrase', async () => {
      const result = await processMessageForAutoResponse(
        'hi guys, welcome to the channel',
        'USER1',
        mockLogger,
        mockConfig
      );
      
      expect(result.shouldRespond).toBe(true);
      expect(result.response).toContain('promote inclusivity');
    });
    
    test('should include links in response', async () => {
      const result = await processMessageForAutoResponse(
        'hey guys, what do you think about this?',
        'USER1',
        mockLogger,
        mockConfig
      );
      
      expect(result.shouldRespond).toBe(true);
      expect(result.response).toContain('https://iosfolks.com/hey-guys');
      expect(result.response).toContain('https://iosfolks.com/camille');
    });
    
    test('should ignore messages without trigger phrases', async () => {
      const result = await processMessageForAutoResponse(
        'hello everyone, how are you all?',
        'USER1',
        mockLogger,
        mockConfig
      );
      
      expect(result.shouldRespond).toBe(false);
      expect(result.response).toBeNull();
    });
    
    test('should handle errors gracefully', async () => {
      // Mock logger.debug to throw an error
      mockLogger.debug = jest.fn().mockImplementation(() => {
        throw new Error('Forced error for testing');
      });
      
      const result = await processMessageForAutoResponse(
        'hey guys',
        'USER1',
        mockLogger,
        mockConfig
      );
      
      expect(result.shouldRespond).toBe(false);
      expect(result.response).toBeNull();
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });
}); 