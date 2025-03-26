/**
 * KV Storage
 *
 * Abstracts storage operations to allow for future swapping of backends.
 */

export interface KVStore {
  get<T>(key: string): Promise<T | null>;
  set(key: string, value: any, options?: KVStoreOptions): Promise<void>;
  delete(key: string): Promise<void>;
}

export interface KVStoreOptions {
  expirationTtl?: number; // in seconds
}

export class CloudflareKVStore implements KVStore {
  private kv: KVNamespace;

  constructor(kv: KVNamespace) {
    this.kv = kv;
  }

  async get<T>(key: string): Promise<T | null> {
    const value = await this.kv.get(key, 'json');
    return value as T | null;
  }

  async set(key: string, value: any, options?: KVStoreOptions): Promise<void> {
    await this.kv.put(key, JSON.stringify(value), options);
  }

  async delete(key: string): Promise<void> {
    await this.kv.delete(key);
  }
} 