import { normalizeUrl, storeLink, getLinkData } from '../storage';
import { KVStore } from '../../shared/storage/kv-store';

describe('Link Tracking Storage', () => {
  describe('normalizeUrl', () => {
    test('should handle URLs with protocols', () => {
      expect(normalizeUrl('https://www.google.com')).toBe('google.com');
      expect(normalizeUrl('http://www.google.com')).toBe('google.com');
    });
    
    test('should handle URLs without protocols', () => {
      expect(normalizeUrl('google.com')).toBe('google.com');
      expect(normalizeUrl('www.google.com')).toBe('google.com');
    });
    
    test('should handle URLs with trailing slashes', () => {
      expect(normalizeUrl('https://www.google.com/')).toBe('google.com');
      expect(normalizeUrl('google.com/')).toBe('google.com');
    });
    
    test('should remove Slack formatting', () => {
      expect(normalizeUrl('<https://www.google.com>')).toBe('google.com');
      expect(normalizeUrl('<google.com>')).toBe('google.com');
    });
    
    test('should handle Slack pipe format', () => {
      expect(normalizeUrl('https://google.com|google.com')).toBe('google.com');
      expect(normalizeUrl('<http://google.com|google.com>')).toBe('google.com');
    });
    
    test('should remove tracking parameters', () => {
      expect(normalizeUrl('https://google.com?utm_source=twitter')).toBe('google.com');
      expect(normalizeUrl('https://google.com?utm_source=twitter&q=test')).toBe('google.com?q=test');
    });
    
    test('should preserve paths and valid parameters', () => {
      expect(normalizeUrl('https://google.com/search?q=test')).toBe('google.com/search?q=test');
      expect(normalizeUrl('www.example.com/path/to/page.html')).toBe('example.com/path/to/page.html');
    });
    
    test('should handle subdomains', () => {
      expect(normalizeUrl('https://mail.google.com')).toBe('mail.google.com');
      expect(normalizeUrl('mail.google.com')).toBe('mail.google.com');
    });
    
    test('should normalize variations to the same URL', () => {
      // Various ways to format the same URL
      const variations = [
        'https://example.com',
        'http://example.com',
        'http://www.example.com',
        'https://www.example.com',
        'example.com',
        'www.example.com',
        'example.com/'
      ];
      
      // All variations should normalize to the same URL
      const normalized = variations.map(url => normalizeUrl(url));
      
      // Check that all normalized URLs are the same
      const expectedNormalized = 'example.com';
      normalized.forEach(url => {
        expect(url).toBe(expectedNormalized);
      });
    });
    
    test('should normalize http and https to the same URL (always https)', () => {
      const httpUrl = 'http://example.com/page';
      const httpsUrl = 'https://example.com/page';
      
      expect(normalizeUrl(httpUrl)).toBe(normalizeUrl(httpsUrl));
      expect(normalizeUrl(httpUrl)).toBe('example.com/page');
      expect(normalizeUrl(httpsUrl)).toBe('example.com/page');
    });
    
    test('should normalize URLs with and without protocol', () => {
      // Various forms of the same URL with different protocols or no protocol
      const urls = [
        'http://example.com',
        'https://example.com',
        'example.com',
        'http://www.example.com',
        'https://www.example.com',
        'www.example.com'
      ];
      
      // All should normalize to the same value
      const expected = 'example.com';
      
      // Check that all normalize to the same value
      const normalizedUrls = urls.map(url => normalizeUrl(url));
      normalizedUrls.forEach(normalized => {
        expect(normalized).toBe(expected);
      });
    });
    
    test('should handle trailing slashes consistently', () => {
      // Various forms of the same URL with and without trailing slashes
      const urls = [
        'example.com/',
        'example.com',
        'http://example.com/',
        'https://example.com/',
        'http://www.example.com/',
        'www.example.com/'
      ];
      
      // All should normalize to the same value without trailing slash
      const expected = 'example.com';
      
      // Check that all normalize to the same value
      const normalizedUrls = urls.map(url => normalizeUrl(url));
      normalizedUrls.forEach(normalized => {
        expect(normalized).toBe(expected);
      });
    });
    
    test('should preserve paths and parameters while normalizing protocol and www', () => {
      const urls = [
        'http://example.com/path/to/page?param=value',
        'https://example.com/path/to/page?param=value',
        'http://www.example.com/path/to/page?param=value',
        'https://www.example.com/path/to/page?param=value'
      ];
      
      // All should normalize to the same value
      const expected = 'example.com/path/to/page?param=value';
      
      // Check that all normalize to the same value
      const normalizedUrls = urls.map(url => normalizeUrl(url));
      normalizedUrls.forEach(normalized => {
        expect(normalized).toBe(expected);
      });
    });
  });

  describe('storeLink', () => {
    test('should store link data with the normalized URL', async () => {
      // Mock KV Store
      const mockKVStore = {
        get: jest.fn(),
        set: jest.fn().mockResolvedValue(undefined),
        delete: jest.fn()
      };
      
      const linkData = {
        url: 'https://example.com/page',
        channelId: 'C12345',
        messageId: '111111111.111111',
        userId: 'U12345',
        timestamp: '2023-03-01T12:00:00.000Z'
      };
      
      // By default, check if the link exists
      mockKVStore.get.mockResolvedValue(null);
      
      await storeLink('https://www.example.com/page', linkData, mockKVStore);
      
      // Verify it stored with the normalized URL
      expect(mockKVStore.get).toHaveBeenCalledWith('link:example.com/page');
      expect(mockKVStore.set).toHaveBeenCalledWith(
        'link:example.com/page',
        linkData,
        expect.any(Object)
      );
    });
    
    test('should not overwrite existing link data when preserveOriginal is true', async () => {
      // Mock KV Store
      const mockKVStore = {
        get: jest.fn(),
        set: jest.fn().mockResolvedValue(undefined),
        delete: jest.fn()
      };
      
      const existingLinkData = {
        url: 'https://example.com/page',
        channelId: 'C12345',
        messageId: '111111111.111111',
        userId: 'U12345',
        timestamp: '2023-03-01T12:00:00.000Z'
      };
      
      const newLinkData = {
        url: 'https://example.com/page',
        channelId: 'C67890',
        messageId: '222222222.222222',
        userId: 'U67890',
        timestamp: '2023-03-02T12:00:00.000Z'
      };
      
      // Simulate an existing link entry
      mockKVStore.get.mockResolvedValue(existingLinkData);
      
      // Store with preserveOriginal = true (default)
      await storeLink('https://example.com/page', newLinkData, mockKVStore);
      
      // Verify it checked for existing data but didn't overwrite
      expect(mockKVStore.get).toHaveBeenCalledWith('link:example.com/page');
      expect(mockKVStore.set).not.toHaveBeenCalled();
    });
    
    test('should overwrite existing link data when preserveOriginal is false', async () => {
      // Mock KV Store
      const mockKVStore = {
        get: jest.fn(),
        set: jest.fn().mockResolvedValue(undefined),
        delete: jest.fn()
      };
      
      const existingLinkData = {
        url: 'https://example.com/page',
        channelId: 'C12345',
        messageId: '111111111.111111',
        userId: 'U12345',
        timestamp: '2023-03-01T12:00:00.000Z'
      };
      
      const newLinkData = {
        url: 'https://example.com/page',
        channelId: 'C67890',
        messageId: '222222222.222222',
        userId: 'U67890',
        timestamp: '2023-03-02T12:00:00.000Z'
      };
      
      // Simulate an existing link entry
      mockKVStore.get.mockResolvedValue(existingLinkData);
      
      // Store with preserveOriginal = false
      await storeLink('https://example.com/page', newLinkData, mockKVStore, false);
      
      // Verify it checked for existing data but did overwrite
      expect(mockKVStore.get).not.toHaveBeenCalled();
      expect(mockKVStore.set).toHaveBeenCalledWith(
        'link:example.com/page',
        newLinkData,
        expect.any(Object)
      );
    });
  });
}); 