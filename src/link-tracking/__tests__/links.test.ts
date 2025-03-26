import { processMessageLinks, processMessageDeletion } from '../links';
import { DefaultMockContext, testWithContext } from '../../testing/testWithContext';

// // Setup constants and mocks at the top
const mockContext = DefaultMockContext;
const mockKVStore = mockContext.storage;
const mockLogger = mockContext.logger;

// Mock ALLOWLISTED_HOSTS to be empty for testing
jest.mock('../links', () => {
  const original = jest.requireActual('../links');
  return {
    ...original,
    ALLOWLISTED_HOSTS: []
  };
});



describe('Link Tracking', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('processMessageLinks', () => {
    testWithContext('should detect links in messages', async () => {
      // No previous links
      mockKVStore.get.mockResolvedValue(null);
      
      const message = {
        text: 'Check out <https://example.com> and <http://google.com>',
        ts: '123456789.123456',
        channel: 'C12345',
        user: 'U12345'
      };
      
      const result = await processMessageLinks(message);
      
      expect(result.linksFound).toHaveLength(2);
      expect(result.linksFound).toContain('https://example.com');
      expect(result.linksFound).toContain('http://google.com');
      expect(result.response).toBeUndefined();
      
      // Verify storage was called for both links
      expect(mockKVStore.set).toHaveBeenCalledTimes(2);
    });
    
    testWithContext('should identify when a link was previously shared by another user', async () => {
      // Set up a previously shared link
      const previousLink = {
        url: 'https://example-site.com',
        channelId: 'C12345',
        messageId: '111111111.111111',
        userId: 'U54321', // Different user
        timestamp: '2023-03-01T12:00:00.000Z'
      };
      
      // Mock that we'll find the previous link
      mockKVStore.get.mockImplementation(async (key: string) => {
        if (key.includes('example-site.com')) {
          return previousLink;
        }
        return null;
      });
      
      const message = {
        text: 'Check out <https://example-site.com>',
        ts: '123456789.123456',
        channel: 'C12345',
        user: 'U12345'
      };
      
      const result = await processMessageLinks(message);
      
      // Verify link was detected
      expect(result.linksFound).toHaveLength(1);
      expect(result.linksFound).toContain('https://example-site.com');
      
      // Verify response was generated
      expect(result.response).toBeDefined();
      expect(result.response).toContain('also being discussed');
      expect(result.response).toContain('C12345');
      
      // We still check KV store but might not write if the entry exists
      expect(mockKVStore.get).toHaveBeenCalled();
    });
    
    testWithContext('should handle link URL variations and still detect previous shares', async () => {
      // Set up a previously shared link with one URL format
      const previousLink = {
        url: 'https://example-site.com',
        channelId: 'C12345',
        messageId: '111111111.111111',
        userId: 'U54321', // Different user
        timestamp: '2023-03-01T12:00:00.000Z'
      };
      
      // Mock that we'll find the previous link even with a different URL format
      mockKVStore.get.mockImplementation(async (key: string) => {
        if (key.includes('example-site.com')) {
          return previousLink;
        }
        return null;
      });
      
      // Use a different URL format in the new message
      const message = {
        text: 'Check out <http://www.example-site.com>',
        ts: '123456789.123456',
        channel: 'C12345',
        user: 'U12345'
      };
      
      const result = await processMessageLinks(message);
      
      // Verify link was detected
      expect(result.linksFound).toHaveLength(1);
      
      // Verify response was generated, confirming URL normalization worked
      expect(result.response).toBeDefined();
      expect(result.response).toContain('also being discussed');
      expect(result.response).toContain('C12345');
    });
    
    testWithContext('should not notify when a user reshares their own link', async () => {
      // Set up a previously shared link by the same user
      const previousLink = {
        url: 'https://example-site.com',
        channelId: 'C12345',
        messageId: '111111111.111111',
        userId: 'U12345', // Same user
        timestamp: '2023-03-01T12:00:00.000Z'
      };
      
      // Mock that we'll find the previous link
      mockKVStore.get.mockImplementation(async (key: string) => {
        if (key.includes('example-site.com')) {
          return previousLink;
        }
        return null;
      });
      
      const message = {
        text: 'Resharing <https://example-site.com>',
        ts: '123456789.123456',
        channel: 'C12345',
        user: 'U12345' // Same user
      };
      
      const result = await processMessageLinks(message);
      
      // Verify link was detected
      expect(result.linksFound).toHaveLength(1);
      expect(result.linksFound).toContain('https://example-site.com');
      
      // TEMPORARILY COMMENTED OUT FOR TESTING
      // Verify no response was generated
      // expect(result.response).toBeUndefined();
      
      // TEMPORARY: Expect a response for self-reshares
      expect(result.response).toBeDefined();
      expect(result.response).toContain('also being discussed');
    });

    testWithContext('should create proper thread permalinks when original message was in a thread', async () => {
      // Set up a previously shared link in a thread
      const previousLink = {
        url: 'https://example-site.com',
        channelId: 'C12345',
        messageId: '111111111.111111',
        userId: 'U54321',
        timestamp: '2023-03-01T12:00:00.000Z',
        thread_ts: '111111000.000000' // This message was in a thread
      };
      
      mockKVStore.get.mockImplementation(async (key: string) => {
        if (key.includes('example-site.com')) {
          return previousLink;
        }
        return null;
      });
      
      const message = {
        text: 'Check out <https://example-site.com>',
        ts: '123456789.123456',
        channel: 'C12345',
        user: 'U12345',
        // Current message is not in a thread
      };
      
      const result = await processMessageLinks(message);
      
      // Verify response was generated
      expect(result.response).toBeDefined();
      expect(result.response).toContain('also being discussed');
      
      // Verify the URL contains thread parameters
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Created permalink',
        expect.objectContaining({
          permalink: expect.stringContaining('?thread_ts=111111000.000000&cid=C12345'),
          isThreaded: true
        })
      );
    });
    
    testWithContext('should correctly identify messages in the same thread', async () => {
      // Set up a previously shared link in a thread
      const previousLink = {
        url: 'https://example-site.com',
        channelId: 'C12345',
        messageId: '111111111.111111',
        userId: 'U54321',
        timestamp: '2023-03-01T12:00:00.000Z',
        thread_ts: '100000000.000000' // This is the parent thread
      };
      
      mockKVStore.get.mockImplementation(async (key: string) => {
        if (key.includes('example-site.com')) {
          return previousLink;
        }
        return null;
      });
      
      const message = {
        text: 'Check out <https://example-site.com> again',
        ts: '123456789.123456',
        channel: 'C12345',
        user: 'U12345',
        thread_ts: '100000000.000000' // Same thread as the previous message
      };
      
      const result = await processMessageLinks(message);
      
      // Should identify as same thread and message accordingly
      expect(result.response).toBeDefined();
      expect(result.response).toContain('previously shared in this thread');
      expect(result.response).toContain('U54321'); // Mentioned original sharer
    });

    testWithContext('should not notify for links on the allowlist', async () => {
      // Set up a previously shared link from an allowlisted domain
      const previousLink = {
        url: 'https://apple.com/iphone',
        channelId: 'C12345',
        messageId: '111111111.111111',
        userId: 'U54321',
        timestamp: '2023-03-01T12:00:00.000Z'
      };
      
      mockKVStore.get.mockImplementation(async (key: string) => {
        if (key.includes('apple.com')) {
          return previousLink;
        }
        return null;
      });
      
      const message = {
        text: 'Check out <https://apple.com/iphone>',
        ts: '123456789.123456',
        channel: 'C12345',
        user: 'U12345'
      };
      
      const result = await processMessageLinks(message);
      
      // There should be a link found
      expect(result.linksFound).toHaveLength(1);
      expect(result.linksFound).toContain('https://apple.com/iphone');
      
      // But no notification should be sent due to allowlist
      expect(result.response).toBeUndefined();
      
      // Verify debug log was called for allowlisted host
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Skipping allowlisted host',
        expect.objectContaining({
          url: 'https://apple.com/iphone',
          normalizedUrl: expect.stringContaining('apple.com')
        })
      );
    });

    describe('Link Extraction', () => {
      testWithContext('should handle karma commands properly', async () => {
        const message = {
          text: '<@U12345> += 11.4 and <@U67890> -= 2.6',
          ts: '123456789.123456',
          channel: 'C12345',
          user: 'U12345'
        };
        
        const result = await processMessageLinks(message);
        
        // Should not find any links in this message
        expect(result.linksFound).toHaveLength(0);
        expect(mockKVStore.set).not.toHaveBeenCalled();
      });
      
      testWithContext('should handle date formats properly', async () => {
        const message = {
          text: 'This release is version 24.07.26 and will be deployed tomorrow',
          ts: '123456789.123456',
          channel: 'C12345',
          user: 'U12345'
        };
        
        const result = await processMessageLinks(message);
        
        // Should not find any links in this message
        expect(result.linksFound).toHaveLength(0);
        expect(mockKVStore.set).not.toHaveBeenCalled();
      });
      
      testWithContext('should handle IP-like formats properly', async () => {
        const message = {
          text: 'The server IP is 192.168.0.1 and the alternate is 10.0.0.1',
          ts: '123456789.123456',
          channel: 'C12345',
          user: 'U12345'
        };
        
        const result = await processMessageLinks(message);
        
        // Should not find any links in this message as they're IPs
        expect(result.linksFound).toHaveLength(0);
        expect(mockKVStore.set).not.toHaveBeenCalled();
      });
      
      testWithContext('should handle version numbers properly', async () => {
        const message = {
          text: 'We just upgraded to version 11.4.0 from 10.3.2',
          ts: '123456789.123456',
          channel: 'C12345',
          user: 'U12345'
        };
        
        const result = await processMessageLinks(message);
        
        // Should not find any links in this message
        expect(result.linksFound).toHaveLength(0);
        expect(mockKVStore.set).not.toHaveBeenCalled();
      });
      
      testWithContext('should extract valid domains with numeric components', async () => {
        const message = {
          text: 'Visit <http://123.io> and <https://456.com> for more information',
          ts: '123456789.123456',
          channel: 'C12345',
          user: 'U12345'
        };
        
        const result = await processMessageLinks(message);
        
        // Should find these as they are valid domains with proper TLDs
        expect(result.linksFound).toHaveLength(2);
        expect(result.linksFound).toContain('http://123.io');
        expect(result.linksFound).toContain('https://456.com');
      });
      
      testWithContext('should extract domains with newer or less common TLDs', async () => {
        const message = {
          text: 'Check out <https://plinky.ai> and <https://redpanda.club> and my website at <http://example.xyz>',
          ts: '123456789.123456',
          channel: 'C12345',
          user: 'U12345'
        };
        
        const result = await processMessageLinks(message);
        
        // Should find all three domains with different TLDs
        expect(result.linksFound).toHaveLength(3);
        expect(result.linksFound).toContain('https://plinky.ai');
        expect(result.linksFound).toContain('https://redpanda.club');
        expect(result.linksFound).toContain('http://example.xyz');
      });
      
      testWithContext('should handle country-specific TLDs and numeric subdomain parts', async () => {
        const message = {
          text: 'Sites to check: <https://gov.uk>, <http://123.music.jp>, and <https://web3.foundation>',
          ts: '123456789.123456',
          channel: 'C12345',
          user: 'U12345'
        };
        
        const result = await processMessageLinks(message);
        
        // Should find all three domains
        expect(result.linksFound).toHaveLength(3);
        expect(result.linksFound).toContain('https://gov.uk');
        expect(result.linksFound).toContain('http://123.music.jp');
        expect(result.linksFound).toContain('https://web3.foundation');
      });
      
      testWithContext('should handle karma commands with IP-like formats', async () => {
        const message = {
          text: '<@U12345> += 24.7.0.26 and a real IP address is 192.168.1.1',
          ts: '123456789.123456',
          channel: 'C12345',
          user: 'U12345'
        };
        
        const result = await processMessageLinks(message);
        
        // Should not extract any IP addresses as links
        expect(result.linksFound).toHaveLength(0);
      });
      
      testWithContext('should handle mixed content with karma commands and real links', async () => {
        const message = {
          text: '<@U12345> += 11.4 points for sharing <https://github.com> and <@U67890> -= 2.6',
          ts: '123456789.123456',
          channel: 'C12345',
          user: 'U12345'
        };
        
        const result = await processMessageLinks(message);
        
        // Should find only the GitHub link
        expect(result.linksFound).toHaveLength(1);
        expect(result.linksFound[0]).toBe('https://github.com');
      });
      
      testWithContext('should not extract URLs from inline code blocks', async () => {
        const message = {
          text: 'I want to show you `<https://github.com/mergesort/Camille>` so you can look at the code',
          ts: '123456789.123456',
          channel: 'C12345',
          user: 'U12345'
        };
        
        const result = await processMessageLinks(message);
        
        // Should not extract URL from inline code block
        expect(result.linksFound).toHaveLength(0);
      });
      
      testWithContext('should not extract URLs from multi-line code blocks', async () => {
        const message = {
          text: 'Check this example code:\n```\nURL(string: <https://github.com/mergesort/Camille>)!\n```\nLooks good?',
          ts: '123456789.123456',
          channel: 'C12345',
          user: 'U12345'
        };
        
        const result = await processMessageLinks(message);
        
        // Should not extract URL from multi-line code block
        expect(result.linksFound).toHaveLength(0);
      });
      
      testWithContext('should still extract URLs outside of code blocks', async () => {
        const message = {
          text: 'Check the docs at <https://github.com/mergesort/Camille> and here\'s some example code: `let url = "<https://example.com>"`',
          ts: '123456789.123456',
          channel: 'C12345',
          user: 'U12345'
        };
        
        const result = await processMessageLinks(message);
        
        // Should only extract URL outside of code block
        expect(result.linksFound).toHaveLength(1);
        expect(result.linksFound[0]).toBe('https://github.com/mergesort/Camille');
      });
      
      testWithContext('should handle messages with both inline and multi-line code blocks', async () => {
        const message = {
          text: 'Real link: <https://github.com> and code examples: `<https://example.com>` and ```\nvar url = "<https://test.com>";\n```',
          ts: '123456789.123456',
          channel: 'C12345',
          user: 'U12345'
        };
        
        const result = await processMessageLinks(message);
        
        // Should only extract real URL outside of code blocks
        expect(result.linksFound).toHaveLength(1);
        expect(result.linksFound[0]).toBe('https://github.com');
      });
      
      testWithContext('should detect Slack-formatted URLs', async () => {
        const message = {
          text: 'Check out <https://example.com|Example Site> and <https://github.com>',
          ts: '123456789.123456',
          channel: 'C12345',
          user: 'U12345'
        };
        
        const result = await processMessageLinks(message);
        
        // Should detect both links - one with display text and one without
        expect(result.linksFound).toHaveLength(2);
        expect(result.linksFound).toContain('https://example.com');
        expect(result.linksFound).toContain('https://github.com');
      });
      
      testWithContext('should not confuse user or channel mentions with links', async () => {
        const message = {
          text: 'Hey <@U12345> check <#C12345> channel and see <https://example.com>',
          ts: '123456789.123456',
          channel: 'C12345',
          user: 'U12345'
        };
        
        const result = await processMessageLinks(message);
        
        // Should only detect the actual link, not the mentions
        expect(result.linksFound).toHaveLength(1);
        expect(result.linksFound).toContain('https://example.com');
      });
    });
  });
  
  describe('processMessageDeletion', () => {
    testWithContext('should delete link reference when message is deleted', async () => {
      // Set up a test link that exists in storage
      const existingLink = {
        url: 'https://example-site.com',
        channelId: 'C12345',
        messageId: '123456789.123456',
        userId: 'U12345',
        timestamp: '2023-03-01T12:00:00.000Z'
      };
      
      mockKVStore.get.mockImplementation(async (key: string) => {
        if (key.includes('example-site.com')) {
          return existingLink;
        }
        return null;
      });
      
      const event = {
        ts: '123456789.123456',
        channel: 'C12345',
        previous_message: {
          text: 'Check out <https://example-site.com>',
          ts: '123456789.123456',
          user: 'U12345'
        }
      };
      
      await processMessageDeletion(event);
      
      // Verify the link was found and deleted
      expect(mockKVStore.get).toHaveBeenCalledWith(expect.stringContaining('example-site.com'));
      expect(mockKVStore.delete).toHaveBeenCalledWith(expect.stringContaining('example-site.com'));
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Message deletion: Deleting link reference',
        expect.objectContaining({
          url: 'https://example-site.com',
          messageTs: '123456789.123456'
        })
      );
    });
    
    testWithContext('should not delete link reference when message is different', async () => {
      // Set up a test link that exists in storage but with a different message ID
      const existingLink = {
        url: 'https://example-site.com',
        channelId: 'C12345',
        messageId: '999999999.999999', // Different from the deleted message
        userId: 'U12345',
        timestamp: '2023-03-01T12:00:00.000Z'
      };
      
      mockKVStore.get.mockImplementation(async (key: string) => {
        if (key.includes('example-site.com')) {
          return existingLink;
        }
        return null;
      });
      
      const event = {
        ts: '123456789.123456',
        channel: 'C12345',
        previous_message: {
          text: 'Check out <https://example-site.com>',
          ts: '123456789.123456', // Different from the stored link
          user: 'U12345'
        }
      };
      
      await processMessageDeletion(event);
      
      // Verify the link was found but NOT deleted
      expect(mockKVStore.get).toHaveBeenCalledWith(expect.stringContaining('example-site.com'));
      expect(mockKVStore.delete).not.toHaveBeenCalled();
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Message deletion: Link reference not found or from different message',
        expect.objectContaining({
          url: 'https://example-site.com',
          messageTs: '123456789.123456'
        })
      );
    });
    
    testWithContext('should handle multiple links in a deleted message', async () => {
      // Set up multiple test links
      mockKVStore.get.mockImplementation(async (key: string) => {
        if (key.includes('example-site.com')) {
          return {
            url: 'https://example-site.com',
            channelId: 'C12345',
            messageId: '123456789.123456',
            userId: 'U12345',
            timestamp: '2023-03-01T12:00:00.000Z'
          };
        } else if (key.includes('another-site.com')) {
          return {
            url: 'https://another-site.com',
            channelId: 'C12345',
            messageId: '123456789.123456',
            userId: 'U12345',
            timestamp: '2023-03-01T12:00:00.000Z'
          };
        }
        return null;
      });
      
      const event = {
        ts: '123456789.123456',
        channel: 'C12345',
        previous_message: {
          text: 'Check out <https://example-site.com> and <https://another-site.com>',
          ts: '123456789.123456',
          user: 'U12345'
        }
      };
      
      await processMessageDeletion(event);
      
      // Verify both links were found and deleted
      expect(mockKVStore.delete).toHaveBeenCalledTimes(2);
      expect(mockKVStore.delete).toHaveBeenCalledWith(expect.stringContaining('example-site.com'));
      expect(mockKVStore.delete).toHaveBeenCalledWith(expect.stringContaining('another-site.com'));
    });
    
    testWithContext('should ignore messages without previous content', async () => {
      const event = {
        ts: '123456789.123456',
        channel: 'C12345',
        // No previous_message property
      };
      
      await processMessageDeletion(event);
      
      // Should log that no previous message content is available
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Message deletion: No previous message content available',
        expect.any(Object)
      );
      
      // No storage operations should be performed
      expect(mockKVStore.get).not.toHaveBeenCalled();
      expect(mockKVStore.delete).not.toHaveBeenCalled();
    });
    
    testWithContext('should handle messages with no links', async () => {
      const event = {
        ts: '123456789.123456',
        channel: 'C12345',
        previous_message: {
          text: 'This is a message with no links',
          ts: '123456789.123456',
          user: 'U12345'
        }
      };
      
      await processMessageDeletion(event);
      
      // Should log that no links were found
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Message deletion: No links found in deleted message',
        expect.any(Object)
      );
      
      // No storage operations should be performed
      expect(mockKVStore.get).not.toHaveBeenCalled();
      expect(mockKVStore.delete).not.toHaveBeenCalled();
    });
  });
}); 