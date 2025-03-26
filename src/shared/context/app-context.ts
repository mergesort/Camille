import { AsyncLocalStorage } from 'async_hooks';
import type { KVStore } from '../storage/kv-store';
import type { Logger } from '../logging/logger';
import type { Config } from '../config/config';

export interface AppContext {
  storage: KVStore;
  logger: Logger;
  config: Config;
}

export const asyncContext = new AsyncLocalStorage<AppContext>();

export const withContext = async <T>(
  context: AppContext,
  fn: () => Promise<T>
): Promise<T> => {
  return asyncContext.run(context, fn);
};

export const getStorage = (): KVStore => {
  const store = asyncContext.getStore()?.storage;
  if (!store) throw new Error('Storage accessed outside context');
  return store;
};

export const getLogger = (): Logger => {
  const logger = asyncContext.getStore()?.logger;
  if (!logger) throw new Error('Logger accessed outside context');
  return logger;
};

export const getConfig = (): Config => {
  const config = asyncContext.getStore()?.config;
  if (!config) throw new Error('Config accessed outside context');
  return config;
}; 
1