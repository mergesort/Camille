import { processHelpCommand } from '../help';
import { KVStore } from '../../shared/storage/kv-store';
import { Logger } from '../../shared/logging/logger';
import { Config } from '../../shared/config/config';
import { asyncContext } from '../../shared/context/app-context';

describe('Help Module', () => {
  // Mock dependencies
  let mockStorage: jest.Mocked<KVStore>;
  let mockLogger: jest.Mocked<Logger>;
  const mockConfig = {} as Config;
  
  beforeAll(() => {
    asyncContext.enterWith({
      logger: mockLogger,
      config: mockConfig,
      storage: mockStorage
    });
  });

  beforeEach(() => {
    // Setup mocks
    mockStorage = {
      get: jest.fn(),
      set: jest.fn(),
      delete: jest.fn(),
    } as unknown as jest.Mocked<KVStore>;
    
    mockLogger = {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    } as unknown as jest.Mocked<Logger>;
  });
  
  describe('Help Command', () => {
    test('should detect "@camille help" command', async () => {
      const message = '<@U12345|camille> help';
      
      const result = await processHelpCommand(message);
      
      expect(result.response).toBeDefined();
      expect(result.response).toContain('Available Commands');
      expect(result.response).toContain('Karma System');
    });
    
    test('should not detect standalone "help" command', async () => {
      const message = 'help';
      
      const result = await processHelpCommand(message);
      
      expect(result.response).toBeUndefined();
    });
    
    test('should not detect help command within other text', async () => {
      const message = 'I need help with something';
      
      const result = await processHelpCommand(message);
      
      expect(result.response).toBeUndefined();
    });
    
    test('should include all command categories in help message', async () => {
      const message = '<@U12345|camille> help';
      
      const result = await processHelpCommand(message);
      
      expect(result.response).toBeDefined();
      expect(result.response).toContain('Karma System');
      expect(result.response).toContain('Help');
      expect(result.response).toContain('Tips');
    });
    
    test('help message should include karma commands', async () => {
      const message = '<@U12345|camille> help';
      
      const result = await processHelpCommand(message);
      
      expect(result.response).toBeDefined();
      expect(result.response).toContain('@username++');
      expect(result.response).toContain('@username--');
      expect(result.response).toContain('@username+= N');
      expect(result.response).toContain('@username-= N');
      expect(result.response).toContain('karma @username');
    });
  });

  describe('Bot ID Recognition', () => {
    // Mock config with bot ID
    const mockConfig = {
      slackBotId: 'BOT123',
      slackCommunityId: 'COMM123',
      apiHost: 'https://example.com'
    };
    
    test('should process help command directed at the bot', async () => {
      const message = '<@BOT123|camille> help';
      
      const result = await processHelpCommand(
        message, 
      );
      
      expect(result.response).toBeDefined();
      expect(result.response).toContain('Available Commands');
    });
    
    test('should ignore help command directed at other users', async () => {
      const message = '<@SOMEONE_ELSE|user> help';
      
      const result = await processHelpCommand(
        message, 
      );
      
      // No response since command is not directed at our bot
      expect(result.response).toBeUndefined();
    });
  });
}); 