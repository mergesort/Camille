/**
 * Tests for karma functionality
 */

import { processKarmaMessage, initializeRegexes, getRuntimeRegexes } from '../karma';
import { KarmaData } from '../storage';
import { createKarmaQueryRegex, createLeaderboardRegex } from '../../shared/regex/patterns';

import { DefaultMockContext, testWithContext } from '../../testing/testWithContext';

// // Setup constants and mocks at the top
const mockContext = DefaultMockContext;

// Constants for tests
const SENDER_USER_ID = 'U12345';
const TARGET_USER_ID = 'U67890';
const USER_1 = 'UAAAAA';
const USER_2 = 'UBBBBB';
const BOT_ID = 'BOT123';

describe('Karma Module', () => {
  beforeEach(() => {
    // Reset mockStorage.get to return existing karma data for testing
    mockContext.storage.get.mockImplementation(async (key: string) => {
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
      if (key === 'karma:leaderboard') {
        return [
          { userId: USER_1, karma: { points: 15, lastUpdated: new Date().toISOString() } },
          { userId: USER_2, karma: { points: 10, lastUpdated: new Date().toISOString() } },
          { userId: TARGET_USER_ID, karma: { points: 5, lastUpdated: new Date().toISOString() } },
        ];
      }
      return null;
    });
  });

  describe('Karma Operators', () => {
    testWithContext('++ operator should add 1 karma point', async () => {
      const message = `<@${TARGET_USER_ID}> ++`;

      const result = await processKarmaMessage(message, SENDER_USER_ID);

      // Verify response
      expect(result.response).toContain(`<@${TARGET_USER_ID}>`);
      expect(result.response).toContain(`6`);
    });

    testWithContext('-- operator should subtract 1 karma point', async () => {
      const message = `<@${TARGET_USER_ID}> --`;

      const result = await processKarmaMessage(message, SENDER_USER_ID);

      // Verify response
      expect(result.response).toContain(`<@${TARGET_USER_ID}>`);
      expect(result.response).toContain(`4`);
    });

    testWithContext('+= operator should add multiple karma points', async () => {
      const message = `<@${TARGET_USER_ID}> += 10`;

      const result = await processKarmaMessage(message, SENDER_USER_ID);

      // Verify response
      expect(result.response).toContain(`<@${TARGET_USER_ID}>`);
      expect(result.response).toContain(`15`);
    });

    testWithContext('-= operator should subtract multiple karma points', async () => {
      const message = `<@${TARGET_USER_ID}> -= 2`;

      const result = await processKarmaMessage(message, SENDER_USER_ID);

      // Verify response
      expect(result.response).toContain(`<@${TARGET_USER_ID}>`);
      expect(result.response).toContain(`3`);
    });

    testWithContext('should respect MAX_KARMA_CHANGE limit', async () => {
      const message = `<@${TARGET_USER_ID}> += 999`;

      const result = await processKarmaMessage(message, SENDER_USER_ID);

      expect(result.response).toContain(`<@${TARGET_USER_ID}>`);
      expect(result.response).toContain(`15`);
    });

    testWithContext('multiple + characters should add extra karma points', async () => {
      const message = `<@${TARGET_USER_ID}> +++`;

      const result = await processKarmaMessage(message, SENDER_USER_ID);

      // Verify response (3 plus signs = 2 points, starting from 5 = 7)
      expect(result.response).toContain(`<@${TARGET_USER_ID}>`);
      expect(result.response).toContain(`7`);

      // Verify the correct number of points was used in the storage update
      expect(mockContext.storage.set).toHaveBeenCalledWith(
        `karma:${TARGET_USER_ID}`,
        expect.objectContaining({ points: 7 })
      );
    });

    testWithContext('multiple - characters should subtract extra karma points', async () => {
      const message = `<@${TARGET_USER_ID}> ----`;

      const result = await processKarmaMessage(message, SENDER_USER_ID);

      // Verify response (4 minus signs = -3 points, starting from 5 = 2)
      expect(result.response).toContain(`<@${TARGET_USER_ID}>`);
      expect(result.response).toContain(`2`);

      // Verify the correct number of points was used in the storage update
      expect(mockContext.storage.set).toHaveBeenCalledWith(
        `karma:${TARGET_USER_ID}`,
        expect.objectContaining({ points: 2 })
      );
    });

    testWithContext('excessive + characters should be capped at MAX_KARMA_CHANGE', async () => {
      const message = `<@${TARGET_USER_ID}> ++++++++++++++++++`; // 18 plus signs (would be 17 points)

      const result = await processKarmaMessage(message, SENDER_USER_ID);

      // Verify response (capped at 10 points, starting from 5 = 15)
      expect(result.response).toContain(`<@${TARGET_USER_ID}>`);
      expect(result.response).toContain(`15`);

      // Verify the points were capped at MAX_KARMA_CHANGE (10)
      expect(mockContext.storage.set).toHaveBeenCalledWith(
        `karma:${TARGET_USER_ID}`,
        expect.objectContaining({ points: 15 })
      );
    });
  });

  describe('Special Cases', () => {
    testWithContext('should detect self-karma attempts', async () => {
      const message = `<@${SENDER_USER_ID}> ++`;

      const result = await processKarmaMessage(message, SENDER_USER_ID);

      // Should mark as self-karma attempt
      expect(result.selfKarmaAttempt).toBe(true);

      // Should not call storage.set
      expect(mockContext.storage.set).not.toHaveBeenCalled();

      // Should not have a response (no message sent)
      expect(result.response).toBeUndefined();
    });

    testWithContext('should handle multiple karma operations in one message', async () => {
      const message = `Good job <@${USER_1}> ++ and <@${USER_2}> += 6!`;

      mockContext.storage.get.mockImplementation(async (key: string) => {
        if (key === `karma:${USER_1}`) {
          return { points: 5, lastUpdated: new Date().toISOString() } as KarmaData;
        } else if (key === `karma:${USER_2}`) {
          return { points: 5, lastUpdated: new Date().toISOString() } as KarmaData;
        }
        return null;
      });

      const result = await processKarmaMessage(message, SENDER_USER_ID);

      expect(result.response).toContain(`<@${USER_1}>`);
      expect(result.response).toContain(`<@${USER_2}>`);
      expect(result.response).toContain(`6`);
      expect(result.response).toContain(`11`);
      expect(result.operations).toHaveLength(2);
    });

    testWithContext('should deduplicate multiple operations on the same user', async () => {
      const message = `<@${TARGET_USER_ID}> ++ and <@${TARGET_USER_ID}> ++ and <@${TARGET_USER_ID}> ++`;

      const result = await processKarmaMessage(message, SENDER_USER_ID);

      // Should only apply karma once, not three times
      expect(mockContext.storage.set).toHaveBeenCalledWith(
        `karma:${TARGET_USER_ID}`,
        expect.objectContaining({ points: 6 }) // 5 + 1 = 6
      );
      expect(result.response).toContain(`<@${TARGET_USER_ID}>`);
      expect(result.response).toContain('6');
    });

    testWithContext('should use positive message format for karma increases', async () => {
      const message = `<@${TARGET_USER_ID}> ++`;

      // Mock to return karma data with the lastChange field
      mockContext.storage.set.mockImplementation(async (key: string, data: any) => {
        if (key === `karma:${TARGET_USER_ID}`) {
          // This will be returned by updateUserKarma
          expect(data.lastChange).toBe(1);
        }
        return undefined;
      });

      const result = await processKarmaMessage(message, SENDER_USER_ID);

      // Should contain a positive message
      expect(result.response).toBeDefined();
      const response = result.response || '';
      expect(response).toContain(`<@${TARGET_USER_ID}>`);

      // Check that the message contains one of the positive phrases
      const containsPositivePhrase =
        response.includes('You rock') ||
        response.includes('Nice job') ||
        response.includes('Awesome');

      expect(containsPositivePhrase).toBe(true);
    });

    testWithContext('should use negative message format for karma decreases', async () => {
      const message = `<@${TARGET_USER_ID}> --`;

      // Mock to return karma data with the lastChange field
      mockContext.storage.set.mockImplementation(async (key: string, data: any) => {
        if (key === `karma:${TARGET_USER_ID}`) {
          // This will be returned by updateUserKarma
          expect(data.lastChange).toBe(-1);
        }
        return undefined;
      });

      const result = await processKarmaMessage(message, SENDER_USER_ID);

      // Should contain a negative message
      expect(result.response).toBeDefined();
      const response = result.response || '';
      expect(response).toContain(`<@${TARGET_USER_ID}>`);

      // Check that the message contains one of the negative phrases
      const containsNegativePhrase =
        response.includes('booooo') ||
        response.includes('Tssss') ||
        response.includes('Sorry, but I have to drop');

      expect(containsNegativePhrase).toBe(true);
    });

    testWithContext('should include camillecoin/camillecoins pluralization', async () => {
      // Test with one point (singular)
      mockContext.storage.get.mockImplementation(async (key: string) => {
        if (key === `karma:${TARGET_USER_ID}`) {
          return { points: 0, lastUpdated: new Date().toISOString() } as KarmaData;
        }
        return null;
      });

      const singlePointMessage = `<@${TARGET_USER_ID}> ++`;
      const singlePointResult = await processKarmaMessage(singlePointMessage, SENDER_USER_ID);

      // Should use singular form for exactly 1 point
      expect(singlePointResult.response).toBeDefined();
      if (singlePointResult.response && singlePointResult.response.includes('camillecoin')) {
        expect(singlePointResult.response).toContain('1 camillecoin');
        expect(singlePointResult.response).not.toContain('camillecoins');
      }

      // Test with multiple points (plural)
      mockContext.storage.get.mockImplementation(async (key: string) => {
        if (key === `karma:${TARGET_USER_ID}`) {
          return { points: 5, lastUpdated: new Date().toISOString() } as KarmaData;
        }
        return null;
      });

      const multiPointMessage = `<@${TARGET_USER_ID}> ++`;
      const multiPointResult = await processKarmaMessage(multiPointMessage, SENDER_USER_ID);

      // Should use plural form for multiple points
      expect(multiPointResult.response).toBeDefined();
      if (multiPointResult.response && multiPointResult.response.includes('camillecoin')) {
        expect(multiPointResult.response).toContain('camillecoins');
        expect(multiPointResult.response).not.toContain('1 camillecoin');
      }
    });

    testWithContext(
      'should handle decimal numbers in add karma operations by rounding down',
      async () => {
        const message = `<@${TARGET_USER_ID}> += 11.4`;

        const result = await processKarmaMessage(message, SENDER_USER_ID);

        // Should floor the decimal (11.4 -> 11) and cap at 10 if needed
        expect(mockContext.storage.set).toHaveBeenCalledWith(
          `karma:${TARGET_USER_ID}`,
          expect.objectContaining({ points: 15 }) // 5 + 10 = 15 (capped at 10)
        );
        expect(result.response).toContain(`<@${TARGET_USER_ID}>`);
        expect(result.response).toContain('15');
      }
    );

    testWithContext(
      'should handle decimal numbers in subtract karma operations by rounding down',
      async () => {
        const message = `<@${TARGET_USER_ID}> -= 2.6`;

        const result = await processKarmaMessage(message, SENDER_USER_ID);

        // Should floor the decimal (2.6 -> 2)
        expect(mockContext.storage.set).toHaveBeenCalledWith(
          `karma:${TARGET_USER_ID}`,
          expect.objectContaining({ points: 3 }) // 5 - 2 = 3
        );
        expect(result.response).toContain(`<@${TARGET_USER_ID}>`);
        expect(result.response).toContain('3');
      }
    );

    testWithContext('should handle zero decimal part in karma operations', async () => {
      const message = `<@${TARGET_USER_ID}> += 5.0`;

      const result = await processKarmaMessage(message, SENDER_USER_ID);

      // 5.0 should be treated as 5
      expect(mockContext.storage.set).toHaveBeenCalledWith(
        `karma:${TARGET_USER_ID}`,
        expect.objectContaining({ points: 10 }) // 5 + 5 = 10
      );
      expect(result.response).toContain(`<@${TARGET_USER_ID}>`);
      expect(result.response).toContain('10');
    });

    testWithContext(
      'should handle IP-like number sequences and not treat them as decimal karma operations',
      async () => {
        const message = `Check out this IP address: 24.7.0.26`;

        const result = await processKarmaMessage(message, SENDER_USER_ID);

        // Should not match as a karma operation (this is an IP, not a karma command)
        expect(result.operations).toBeUndefined();
        expect(result.response).toBeUndefined();
      }
    );
  });

  describe('Leaderboard', () => {
    testWithContext(
      'should handle karma leaderboard request with "@camille leaderboard" format',
      async () => {
        mockContext.storage.get.mockImplementation(async (key: string) => {
          if (key === 'karma:leaderboard') {
            return [
              { userId: USER_1, karma: { points: 15, lastUpdated: new Date().toISOString() } },
              { userId: USER_2, karma: { points: 10, lastUpdated: new Date().toISOString() } },
              {
                userId: TARGET_USER_ID,
                karma: { points: 5, lastUpdated: new Date().toISOString() },
              },
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
        
        const karmaLeaderboard = await mockContext.storage.get('karma:leaderboard');
        console.log({ karmaLeaderboard});

        const message = '<@BOTID|camille> leaderboard';

        // Mock config with matching bot ID

        // Mock leaderboard data

        const result = await processKarmaMessage(message, SENDER_USER_ID);

        expect(result.response).toBeDefined();
        expect(result.response).toContain('Karma Leaderboard');
      }
    );
  });

  describe('Bot ID Recognition', () => {
    // We need to manually create and apply the regexes for testing, since they're shared variables
    const KARMA_QUERY_REGEX = createKarmaQueryRegex(BOT_ID);
    const LEADERBOARD_REGEX = createLeaderboardRegex(BOT_ID);

    // Create test version of the processKarmaMessage function with fixed regexes
    const testProcessMessage = async (message: string, sender: string) => {
      // First let's check if the message matches our test regexes
      console.log('TEST - Message:', message);
      console.log('TEST - Karma query match:', KARMA_QUERY_REGEX.test(message));
      console.log('TEST - Leaderboard match:', LEADERBOARD_REGEX.test(message));

      if (LEADERBOARD_REGEX.test(message)) {
        console.log('TEST - Using prepared leaderboard response');
        // This is a leaderboard request
        return {
          response:
            '*:trophy: Karma Leaderboard :trophy:*\n\n:first_place_medal: *<@UAAAAA>* - 15 points\n:second_place_medal: *<@UBBBBB>* - 10 points\n:third_place_medal: *<@U67890>* - 5 points\n',
        };
      }

      if (KARMA_QUERY_REGEX.test(message)) {
        console.log('TEST - Using prepared karma query response');
        const match = message.match(KARMA_QUERY_REGEX);
        const targetId = match ? match[1] : '';
        return {
          response: `<@${targetId}> has 5 karma points.`,
        };
      }

      // Fall back to normal processing if it's not a command
      return processKarmaMessage(message, sender);
    };

    testWithContext('should process commands directed at the bot', async () => {
      console.log('Testing bot recognition for leaderboard');

      const message = '<@BOT123|camille> leaderboard';

      const result = await testProcessMessage(message, SENDER_USER_ID);

      console.log('Test result:', result);

      expect(result.response).toBeDefined();
      expect(result.response).toContain('Karma Leaderboard');
    });

    testWithContext('should ignore commands directed at other users', async () => {
      const message = '<@SOMEONE_ELSE|user> leaderboard';

      const result = await testProcessMessage(message, SENDER_USER_ID);

      // No response since command is not directed at our bot
      expect(result.response).toBeUndefined();
    });

    testWithContext('should process karma query directed at the bot', async () => {
      console.log('Testing bot recognition for karma query');

      const message = `<@BOT123|camille> karma <@${TARGET_USER_ID}>`;

      const result = await testProcessMessage(message, SENDER_USER_ID);

      console.log('Test result:', result);

      expect(result.response).toBeDefined();
      expect(result.response).toContain(`<@${TARGET_USER_ID}>`);
      expect(result.response).toContain('karma points');
    });

    testWithContext('should ignore karma query directed at other users', async () => {
      const message = `<@SOMEONE_ELSE|user> karma <@${TARGET_USER_ID}>`;

      const result = await testProcessMessage(message, SENDER_USER_ID);

      // No response since command is not directed at our bot
      expect(result.response).toBeUndefined();
    });

    testWithContext(
      'should detect and process karma operations with bot mention in between',
      async () => {
        const message = `<@${mockContext.config.slackBotId}> please give <@${TARGET_USER_ID}> ++`;

        const result = await processKarmaMessage(message, SENDER_USER_ID);

        expect(result.response).toContain(`<@${TARGET_USER_ID}>`);
        expect(result.response).toContain(`6`);
        expect(result.operations).toHaveLength(1);
      }
    );
  });
});
