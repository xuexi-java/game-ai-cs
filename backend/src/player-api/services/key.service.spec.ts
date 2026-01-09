import { Test, TestingModule } from '@nestjs/testing';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { ConfigService } from '@nestjs/config';
import { KeyService, KeyData } from './key.service';

describe('KeyService', () => {
  let service: KeyService;
  let mockCacheManager: any;
  let mockConfigService: any;

  beforeEach(async () => {
    mockCacheManager = {
      get: jest.fn(),
      set: jest.fn(),
      del: jest.fn(),
    };

    mockConfigService = {
      get: jest.fn().mockImplementation((key: string, defaultValue?: any) => {
        if (key === 'PLAYER_API_KEY_TTL') return 3600;
        if (key === 'WS_URL') return 'wss://cs.example.com';
        return defaultValue;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        KeyService,
        { provide: CACHE_MANAGER, useValue: mockCacheManager },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<KeyService>(KeyService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('generateKey', () => {
    it('should generate a unique key', () => {
      const key1 = service.generateKey();
      const key2 = service.generateKey();

      expect(key1).toBeDefined();
      expect(key2).toBeDefined();
      expect(key1).not.toBe(key2);
      expect(key1).toMatch(/^[a-f0-9]+-[a-f0-9]+$/);
    });
  });

  describe('storeKey', () => {
    it('should store key data in cache', async () => {
      const keyData: KeyData = {
        gameid: 'game-1',
        uid: 'player-123',
        areaid: 'area01',
        tid: 'T-123',
        createdAt: Date.now(),
      };

      await service.storeKey('test-key', keyData);

      expect(mockCacheManager.set).toHaveBeenCalledWith(
        'player:connect:key:test-key',
        JSON.stringify(keyData),
        3600000, // TTL in milliseconds
      );
    });
  });

  describe('getKeyData', () => {
    it('should return key data when exists', async () => {
      const keyData: KeyData = {
        gameid: 'game-1',
        uid: 'player-123',
        areaid: 'area01',
        tid: 'T-123',
        createdAt: Date.now(),
      };
      mockCacheManager.get.mockResolvedValue(JSON.stringify(keyData));

      const result = await service.getKeyData('test-key');

      expect(result).toEqual(keyData);
      expect(mockCacheManager.get).toHaveBeenCalledWith('player:connect:key:test-key');
    });

    it('should return null when key does not exist', async () => {
      mockCacheManager.get.mockResolvedValue(null);

      const result = await service.getKeyData('non-existent-key');

      expect(result).toBeNull();
    });

    it('should return null when cached data is invalid JSON', async () => {
      mockCacheManager.get.mockResolvedValue('invalid-json');

      const result = await service.getKeyData('bad-key');

      expect(result).toBeNull();
    });
  });

  describe('verifyKey', () => {
    it('should return valid=true when key and tid match', async () => {
      const keyData: KeyData = {
        gameid: 'game-1',
        uid: 'player-123',
        areaid: 'area01',
        tid: 'T-123',
        createdAt: Date.now(),
      };
      mockCacheManager.get.mockResolvedValue(JSON.stringify(keyData));

      const result = await service.verifyKey('test-key', 'T-123');

      expect(result.valid).toBe(true);
      expect(result.data).toEqual(keyData);
    });

    it('should return valid=false when key does not exist', async () => {
      mockCacheManager.get.mockResolvedValue(null);

      const result = await service.verifyKey('non-existent-key', 'T-123');

      expect(result.valid).toBe(false);
      expect(result.data).toBeUndefined();
    });

    it('should return valid=false when tid does not match', async () => {
      const keyData: KeyData = {
        gameid: 'game-1',
        uid: 'player-123',
        areaid: 'area01',
        tid: 'T-123',
        createdAt: Date.now(),
      };
      mockCacheManager.get.mockResolvedValue(JSON.stringify(keyData));

      const result = await service.verifyKey('test-key', 'T-WRONG');

      expect(result.valid).toBe(false);
    });
  });

  describe('deleteKey', () => {
    it('should delete key from cache', async () => {
      await service.deleteKey('test-key');

      expect(mockCacheManager.del).toHaveBeenCalledWith('player:connect:key:test-key');
    });
  });

  describe('getKeyExpireAt', () => {
    it('should return expiration timestamp', () => {
      const before = Date.now();
      const expireAt = service.getKeyExpireAt();
      const after = Date.now();

      expect(expireAt).toBeGreaterThan(before + 3599000);
      expect(expireAt).toBeLessThan(after + 3601000);
    });
  });

  describe('generateWsUrl', () => {
    it('should return base WebSocket URL from config', () => {
      const url = service.generateWsUrl();

      expect(url).toBe('wss://cs.example.com');
    });
  });

  describe('request cache (idempotency)', () => {
    const gameid = 'game-1';
    const uid = 'player-123';
    const requestId = 'req-12345';
    const cacheData = {
      tid: 'T-123',
      key: 'key-abc',
      wsUrl: 'wss://url',
      expireAt: Date.now() + 60000,
    };

    it('should store request cache', async () => {
      await service.storeRequestCache(gameid, uid, requestId, cacheData);

      expect(mockCacheManager.set).toHaveBeenCalledWith(
        `player:request:${gameid}:${uid}:${requestId}`,
        JSON.stringify(cacheData),
        60000, // REQUEST_CACHE_TTL in milliseconds
      );
    });

    it('should get request cache when exists', async () => {
      mockCacheManager.get.mockResolvedValue(JSON.stringify(cacheData));

      const result = await service.getRequestCache(gameid, uid, requestId);

      expect(result).toEqual(cacheData);
    });

    it('should return null when request cache does not exist', async () => {
      mockCacheManager.get.mockResolvedValue(null);

      const result = await service.getRequestCache(gameid, uid, requestId);

      expect(result).toBeNull();
    });
  });

  describe('player socket management', () => {
    const gameid = 'game-1';
    const uid = 'player-123';
    const socketId = 'socket-abc123';

    it('should store player socket', async () => {
      await service.storePlayerSocket(gameid, uid, socketId);

      expect(mockCacheManager.set).toHaveBeenCalledWith(
        `player:socket:${gameid}:${uid}`,
        socketId,
        86400000, // 24 hours in milliseconds
      );
    });

    it('should get player socket', async () => {
      mockCacheManager.get.mockResolvedValue(socketId);

      const result = await service.getPlayerSocket(gameid, uid);

      expect(result).toBe(socketId);
    });

    it('should return null when player socket does not exist', async () => {
      mockCacheManager.get.mockResolvedValue(null);

      const result = await service.getPlayerSocket(gameid, uid);

      expect(result).toBeNull();
    });

    it('should delete player socket', async () => {
      await service.deletePlayerSocket(gameid, uid);

      expect(mockCacheManager.del).toHaveBeenCalledWith(
        `player:socket:${gameid}:${uid}`,
      );
    });
  });
});
