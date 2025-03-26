/**
 * Tests for the auto-responder module
 */

import { processMessageForAutoResponse } from '../auto-responder';
import { Logger } from '../../shared/logging/logger';
import { Config } from '../../shared/config/config';

import { DefaultMockContext, testWithContext } from '../../testing/testWithContext';

// // Setup constants and mocks at the top
const mockContext = DefaultMockContext;

describe('Auto-Responder Module', () => {
    beforeEach(() => {
      jest.clearAllMocks();
    });

    
    describe('processMessageForAutoResponse', () => {
      testWithContext('should detect "hey guys" phrase', async () => {
        const result = await processMessageForAutoResponse(
          'hey guys, how is everyone doing?',
          'USER1',
        );
        
        expect(result.shouldRespond).toBe(true);
        expect(result.response).toContain('promote inclusivity');
        expect(result.response).toContain('alternative to guys');
        expect(mockContext.logger.info).toHaveBeenCalled();
      });
      
      testWithContext('should detect "you guys" phrase', async () => {
        const result = await processMessageForAutoResponse(
          'what do you guys think about this feature?',
          'USER1',
        );
        
        expect(result.shouldRespond).toBe(true);
        expect(result.response).toContain('promote inclusivity');
      });
      
      testWithContext('should detect "thanks guys" phrase', async () => {
        const result = await processMessageForAutoResponse(
          'thanks guys for your help!',
          'USER1',
        );
        
        expect(result.shouldRespond).toBe(true);
        expect(result.response).toContain('promote inclusivity');
      });
      
      testWithContext('should detect "hi guys" phrase', async () => {
        const result = await processMessageForAutoResponse(
          'hi guys, welcome to the channel',
          'USER1',

        );
        
        expect(result.shouldRespond).toBe(true);
        expect(result.response).toContain('promote inclusivity');
      });
      
      testWithContext('should include links in response', async () => {
        const result = await processMessageForAutoResponse(
          'hey guys, what do you think about this?',
          'USER1',

        );
        
        expect(result.shouldRespond).toBe(true);
        expect(result.response).toContain('https://iosfolks.com/hey-guys');
        expect(result.response).toContain('https://iosfolks.com/camille');
      });
      
      testWithContext('should ignore messages without trigger phrases', async () => {
        const result = await processMessageForAutoResponse(
          'hello everyone, how are you all?',
          'USER1',

        );
        
        expect(result.shouldRespond).toBe(false);
        expect(result.response).toBeNull();
      });
      
      testWithContext('should handle errors gracefully', async () => {
        // Mock logger.debug to throw an error
        mockContext.logger.debug = jest.fn().mockImplementation(() => {
          throw new Error('Forced error for testing');
        });
        
        const result = await processMessageForAutoResponse(
          'hey guys',
          'USER1',

        );
        
        expect(result.shouldRespond).toBe(false);
        expect(result.response).toBeNull();
        expect(mockContext.logger.error).toHaveBeenCalled();
      });
    });
  
}); 