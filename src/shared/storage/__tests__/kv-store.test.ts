import { CloudflareKVStore } from '../kv-store';

describe('CloudflareKVStore', () => {
  let mockKV: KVNamespace;
  let kvStore: CloudflareKVStore;

  beforeEach(() => {
    // Mock KV Namespace
    mockKV = {
      get: jest.fn(),
      put: jest.fn(),
      delete: jest.fn(),
    } as unknown as KVNamespace;

    kvStore = new CloudflareKVStore(mockKV);
  });

  test('get should retrieve and parse JSON', async () => {
    const mockData = { test: 'value' };
    (mockKV.get as jest.Mock).mockResolvedValue(mockData);

    const result = await kvStore.get<{ test: string }>('testKey');
    
    expect(mockKV.get).toHaveBeenCalledWith('testKey', 'json');
    expect(result).toEqual(mockData);
  });

  test('set should stringify and store data', async () => {
    const testData = { test: 'value' };
    await kvStore.set('testKey', testData);
    
    expect(mockKV.put).toHaveBeenCalledWith('testKey', JSON.stringify(testData), undefined);
  });

  test('delete should remove data', async () => {
    await kvStore.delete('testKey');
    
    expect(mockKV.delete).toHaveBeenCalledWith('testKey');
  });
}); 