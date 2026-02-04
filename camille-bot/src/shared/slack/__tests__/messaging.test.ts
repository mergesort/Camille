/**
 * Slack Messaging Tests
 *
 * Tests for Slack API messaging functions including MissingScopeError handling
 */

import { describe, test, expect, jest, beforeEach } from '@jest/globals';
import {
  MissingScopeError,
  getSlackChannelInfo,
  updateSlackChannelTopic
} from '../messaging';

// Mock global fetch
const mockFetch = jest.fn() as jest.MockedFunction<typeof fetch>;
global.fetch = mockFetch;

describe('MissingScopeError', () => {
  test('should create error with correct properties', () => {
    const error = new MissingScopeError('channels:read', 'listing channels');

    expect(error.name).toBe('MissingScopeError');
    expect(error.neededScope).toBe('channels:read');
    expect(error.operation).toBe('listing channels');
    expect(error.message).toContain('channels:read');
    expect(error.message).toContain('listing channels');
    expect(error.message).toContain('OAuth & Permissions');
  });

  test('should be instanceof Error', () => {
    const error = new MissingScopeError('channels:write.topic', 'updating topic');

    expect(error instanceof Error).toBe(true);
    expect(error instanceof MissingScopeError).toBe(true);
  });

  test('should include reinstall instruction in message', () => {
    const error = new MissingScopeError('channels:read', 'listing channels');

    expect(error.message).toContain('reinstall');
  });
});

describe('getSlackChannelInfo', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  test('should throw MissingScopeError when scope is missing', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        ok: false,
        error: 'missing_scope',
        needed: 'channels:read'
      })
    } as Response);

    await expect(
      getSlackChannelInfo({ channel: 'C12345', token: 'test-token' })
    ).rejects.toThrow(MissingScopeError);
  });

  test('should return channel topic when successful', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        ok: true,
        channel: {
          topic: { value: 'Test channel topic' }
        }
      })
    } as Response);

    const result = await getSlackChannelInfo({
      channel: 'C12345',
      token: 'test-token'
    });

    expect(result.topic).toBe('Test channel topic');
  });

  test('should throw error for other API errors', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        ok: false,
        error: 'channel_not_found'
      })
    } as Response);

    await expect(
      getSlackChannelInfo({ channel: 'C12345', token: 'test-token' })
    ).rejects.toThrow('Failed to get channel info');
  });
});

describe('updateSlackChannelTopic', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  test('should throw MissingScopeError when channels:write.topic scope is missing', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        ok: false,
        error: 'missing_scope',
        needed: 'channels:write.topic'
      })
    } as Response);

    await expect(
      updateSlackChannelTopic({
        channel: 'C12345',
        topic: 'New topic',
        token: 'test-token'
      })
    ).rejects.toThrow(MissingScopeError);

    try {
      await updateSlackChannelTopic({
        channel: 'C12345',
        topic: 'New topic',
        token: 'test-token'
      });
    } catch (error) {
      expect(error).toBeInstanceOf(MissingScopeError);
      expect((error as MissingScopeError).neededScope).toBe('channels:write.topic');
    }
  });

  test('should succeed when API returns ok', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        ok: true
      })
    } as Response);

    await expect(
      updateSlackChannelTopic({
        channel: 'C12345',
        topic: 'New topic',
        token: 'test-token'
      })
    ).resolves.toBeUndefined();
  });

  test('should throw error for other API errors', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        ok: false,
        error: 'not_in_channel'
      })
    } as Response);

    await expect(
      updateSlackChannelTopic({
        channel: 'C12345',
        topic: 'New topic',
        token: 'test-token'
      })
    ).rejects.toThrow('Failed to update channel topic');
  });

  test('should use fallback scope when needed field is not provided', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        ok: false,
        error: 'missing_scope'
        // No 'needed' field
      })
    } as Response);

    try {
      await updateSlackChannelTopic({
        channel: 'C12345',
        topic: 'New topic',
        token: 'test-token'
      });
    } catch (error) {
      expect(error).toBeInstanceOf(MissingScopeError);
      // Should use fallback scope
      expect((error as MissingScopeError).neededScope).toBe('channels:write.topic');
    }
  });
});
