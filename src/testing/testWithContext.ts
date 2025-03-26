import { AppContext, asyncContext } from '../shared/context/app-context';

export const DefaultMockContext: {
  [K in keyof AppContext]: jest.Mocked<AppContext[K]>;
} = {
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
  config: {
    slackBotId: 'BOT123',
    slackCommunityId: 'COMM123',
    apiHost: 'https://example.com',
  },
  storage: {
    get: jest.fn(),
    set: jest.fn(),
    delete: jest.fn(),
  },
};

export function testWithContext(name: string, fn: () => void, context?: typeof DefaultMockContext) {
  let ctx = context ?? DefaultMockContext;
  return test(name, () => asyncContext.run(ctx, fn));
}
