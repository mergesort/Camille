/**
 * Lost Hours Tests
 */

import { describe, test, expect, jest, beforeEach } from '@jest/globals';
import { processLostHoursMessage, resetLostHoursChannelCache } from '../lost-hours';
import { Logger } from '../../shared/logging/logger';
import { Config } from '../../shared/config/config';
import * as messaging from '../../shared/slack/messaging';

// Mock the messaging module but keep the real MissingScopeError
jest.mock('../../shared/slack/messaging', () => {
  const actual = jest.requireActual('../../shared/slack/messaging') as typeof messaging;
  return {
    ...actual,
    findChannelByName: jest.fn(),
    getSlackChannelInfo: jest.fn(),
    updateSlackChannelTopic: jest.fn()
  };
});

// Type the mocks properly
const mockedFindChannelByName = messaging.findChannelByName as jest.MockedFunction<typeof messaging.findChannelByName>;
const mockedGetSlackChannelInfo = messaging.getSlackChannelInfo as jest.MockedFunction<typeof messaging.getSlackChannelInfo>;
const mockedUpdateSlackChannelTopic = messaging.updateSlackChannelTopic as jest.MockedFunction<typeof messaging.updateSlackChannelTopic>;

describe('Lost Hours Processing', () => {
  let mockLogger: Logger;
  let mockConfig: Config;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();

    // Reset channel cache
    resetLostHoursChannelCache();

    // Setup mock logger
    mockLogger = {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn()
    } as unknown as Logger;

    // Setup mock config
    mockConfig = {
      apiHost: 'https://api.example.com',
      slackApiToken: 'xoxb-test-token',
      slackBotId: 'B12345',
      slackCommunityId: 'T12345',
      slackSigningSecret: 'test-secret'
    };
  });

  test('should detect <#CHANNELID|lost-hours> += 5 pattern', async () => {
    const message = 'Just spent 5 hours debugging this issue <#C12345678|lost-hours> += 5';
    const userId = 'U12345';

    // Mock channel lookup
    mockedFindChannelByName.mockResolvedValue('C12345678');

    // Mock channel info response
    mockedGetSlackChannelInfo.mockResolvedValue({
      topic: 'Bugs you lost hours on, and how you solved them. Cumulatively, 1286 hours lost since June 29, 2017'
    });

    // Mock topic update
    mockedUpdateSlackChannelTopic.mockResolvedValue(undefined);

    const result = await processLostHoursMessage(message, userId, mockLogger, mockConfig);

    expect(result.status).toBe('success');
    expect(result.oldHours).toBe(1286);
    expect(result.newHours).toBe(1291);
    expect(result.increment).toBe(5);
    expect(result.response).toContain('1,286 → 1,291');
  });

  test('should handle decimal increments', async () => {
    const message = '<#C12345678|lost-hours> += 2.5';
    const userId = 'U12345';

    mockedFindChannelByName.mockResolvedValue('C12345678');
    mockedGetSlackChannelInfo.mockResolvedValue({
      topic: 'Bugs you lost hours on, and how you solved them. Cumulatively, 100 hours lost since June 29, 2017'
    });
    mockedUpdateSlackChannelTopic.mockResolvedValue(undefined);

    const result = await processLostHoursMessage(message, userId, mockLogger, mockConfig);

    expect(result.status).toBe('success');
    expect(result.increment).toBe(2.5);
    expect(result.newHours).toBe(102.5);
  });

  test('should handle spaces around operator', async () => {
    const message = '<#C12345678|lost-hours>   +=   10';
    const userId = 'U12345';

    mockedFindChannelByName.mockResolvedValue('C12345678');
    mockedGetSlackChannelInfo.mockResolvedValue({
      topic: 'Bugs you lost hours on, and how you solved them. Cumulatively, 1286 hours lost since June 29, 2017'
    });
    mockedUpdateSlackChannelTopic.mockResolvedValue(undefined);

    const result = await processLostHoursMessage(message, userId, mockLogger, mockConfig);

    expect(result.status).toBe('success');
    expect(result.increment).toBe(10);
  });

  test('should handle channel mention without name (<#CHANNELID> format)', async () => {
    const message = '<#C12345678> += 7';
    const userId = 'U12345';

    mockedFindChannelByName.mockResolvedValue('C12345678');
    mockedGetSlackChannelInfo.mockResolvedValue({
      topic: 'Bugs you lost hours on, and how you solved them. Cumulatively, 1000 hours lost since June 29, 2017'
    });
    mockedUpdateSlackChannelTopic.mockResolvedValue(undefined);

    const result = await processLostHoursMessage(message, userId, mockLogger, mockConfig);

    expect(result.status).toBe('success');
    expect(result.increment).toBe(7);
    expect(result.newHours).toBe(1007);
  });

  test('should reject zero increments', async () => {
    const message = '<#C12345678|lost-hours> += 0';
    const userId = 'U12345';

    mockedFindChannelByName.mockResolvedValue('C12345678');

    const result = await processLostHoursMessage(message, userId, mockLogger, mockConfig);

    expect(result.status).toBe('error');
    expect(result.response).toContain('Invalid value');
  });

  test('should reject unreasonably large increments', async () => {
    const message = '<#C12345678|lost-hours> += 9999';
    const userId = 'U12345';

    mockedFindChannelByName.mockResolvedValue('C12345678');

    const result = await processLostHoursMessage(message, userId, mockLogger, mockConfig);

    expect(result.status).toBe('error');
    expect(result.response).toContain('Invalid value');
  });

  test('should handle missing API token gracefully', async () => {
    const message = '<#C12345678|lost-hours> += 5';
    const userId = 'U12345';
    const configWithoutToken = { ...mockConfig, slackApiToken: undefined };

    const result = await processLostHoursMessage(message, userId, mockLogger, configWithoutToken);

    expect(result.status).toBe('error');
    expect(result.response).toContain('missing API token');
  });

  test('should handle channel not found', async () => {
    const message = '<#C12345678|lost-hours> += 5';
    const userId = 'U12345';

    mockedFindChannelByName.mockResolvedValue(null);

    const result = await processLostHoursMessage(message, userId, mockLogger, mockConfig);

    expect(result.status).toBe('error');
    expect(result.response).toContain('could not find');
  });

  test('should handle topic parsing errors gracefully', async () => {
    const message = '<#C12345678|lost-hours> += 5';
    const userId = 'U12345';

    mockedFindChannelByName.mockResolvedValue('C12345678');
    mockedGetSlackChannelInfo.mockResolvedValue({
      topic: 'This is not the expected format'
    });

    const result = await processLostHoursMessage(message, userId, mockLogger, mockConfig);

    expect(result.status).toBe('error');
    expect(result.response).toContain('could not parse');
  });

  test('should not process messages without lost-hours pattern', async () => {
    const message = 'Just a regular message';
    const userId = 'U12345';

    mockedFindChannelByName.mockResolvedValue('C12345678');

    const result = await processLostHoursMessage(message, userId, mockLogger, mockConfig);

    expect(result.status).toBe('no_match');
    expect(result.response).toBe(null);
  });

  test('should handle API errors gracefully', async () => {
    const message = '<#C12345678|lost-hours> += 5';
    const userId = 'U12345';

    mockedFindChannelByName.mockResolvedValue('C12345678');
    mockedGetSlackChannelInfo.mockRejectedValue(
      new Error('Slack API error')
    );

    const result = await processLostHoursMessage(message, userId, mockLogger, mockConfig);

    expect(result.status).toBe('error');
    expect(result.response).toContain('error updating');
  });

  test('should format large numbers with commas', async () => {
    const message = '<#C12345678|lost-hours> += 100';
    const userId = 'U12345';

    mockedFindChannelByName.mockResolvedValue('C12345678');
    mockedGetSlackChannelInfo.mockResolvedValue({
      topic: 'Bugs you lost hours on, and how you solved them. Cumulatively, 9,900 hours lost since June 29, 2017'
    });
    mockedUpdateSlackChannelTopic.mockResolvedValue(undefined);

    const result = await processLostHoursMessage(message, userId, mockLogger, mockConfig);

    expect(result.status).toBe('success');
    expect(result.response).toContain('9,900 → 10,000');

    // Verify the topic was updated with proper formatting
    expect(mockedUpdateSlackChannelTopic).toHaveBeenCalledWith(
      expect.objectContaining({
        topic: expect.stringContaining('10,000 hours')
      })
    );
  });

  test('should handle missing channels:read scope error', async () => {
    const message = '<#C12345678|lost-hours> += 5';
    const userId = 'U12345';

    // Mock findChannelByName to throw MissingScopeError
    mockedFindChannelByName.mockRejectedValue(
      new messaging.MissingScopeError('channels:read', 'listing channels')
    );

    const result = await processLostHoursMessage(message, userId, mockLogger, mockConfig);

    expect(result.status).toBe('error');
    expect(result.response).toContain('channels:read');
    expect(result.response).toContain('OAuth scope');
  });

  test('should handle missing channels:write.topic scope error', async () => {
    const message = '<#C12345678|lost-hours> += 5';
    const userId = 'U12345';

    mockedFindChannelByName.mockResolvedValue('C12345678');
    mockedGetSlackChannelInfo.mockResolvedValue({
      topic: 'Bugs you lost hours on, and how you solved them. Cumulatively, 1286 hours lost since June 29, 2017'
    });

    // Mock updateSlackChannelTopic to throw MissingScopeError
    mockedUpdateSlackChannelTopic.mockRejectedValue(
      new messaging.MissingScopeError('channels:write.topic', 'updating channel topic')
    );

    const result = await processLostHoursMessage(message, userId, mockLogger, mockConfig);

    expect(result.status).toBe('error');
    expect(result.response).toContain('channels:write.topic');
    expect(result.response).toContain('OAuth scope');
  });
});
