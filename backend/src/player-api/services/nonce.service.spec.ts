import { Test, TestingModule } from '@nestjs/testing';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { NonceService } from './nonce.service';

describe('NonceService', () => {
  let service: NonceService;
  let mockCacheManager: any;

  beforeEach(async () => {
    mockCacheManager = {
      get: jest.fn(),
      set: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NonceService,
        { provide: CACHE_MANAGER, useValue: mockCacheManager },
      ],
    }).compile();

    service = module.get<NonceService>(NonceService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('isNonceUsed', () => {
    it('should return false for new nonce', async () => {
      mockCacheManager.get.mockResolvedValue(null);

      const result = await service.isNonceUsed('game-1', 'area01', 'uid-123', 'new-nonce');

      expect(result).toBe(false);
      expect(mockCacheManager.get).toHaveBeenCalledWith('player:nonce:game-1:area01:uid-123:new-nonce');
    });

    it('should return true for used nonce', async () => {
      mockCacheManager.get.mockResolvedValue('1');

      const result = await service.isNonceUsed('game-1', 'area01', 'uid-123', 'used-nonce');

      expect(result).toBe(true);
    });
  });

  describe('markNonceUsed', () => {
    it('should store nonce in cache', async () => {
      await service.markNonceUsed('game-1', 'area01', 'uid-123', 'test-nonce');

      expect(mockCacheManager.set).toHaveBeenCalledWith(
        'player:nonce:game-1:area01:uid-123:test-nonce',
        '1',
        300000, // 5 minutes in milliseconds
      );
    });
  });

  describe('checkAndMarkNonce', () => {
    it('should return true and mark nonce for new nonce', async () => {
      mockCacheManager.get.mockResolvedValue(null);

      const result = await service.checkAndMarkNonce('game-1', 'area01', 'uid-123', 'new-nonce');

      expect(result).toBe(true);
      expect(mockCacheManager.set).toHaveBeenCalledWith(
        'player:nonce:game-1:area01:uid-123:new-nonce',
        '1',
        300000,
      );
    });

    it('should return false for duplicate nonce', async () => {
      mockCacheManager.get.mockResolvedValue('1');

      const result = await service.checkAndMarkNonce('game-1', 'area01', 'uid-123', 'duplicate-nonce');

      expect(result).toBe(false);
      expect(mockCacheManager.set).not.toHaveBeenCalled();
    });

    it('should use correct cache key format', async () => {
      mockCacheManager.get.mockResolvedValue(null);

      await service.checkAndMarkNonce('my-game', 'area02', 'player-abc', 'nonce-xyz');

      expect(mockCacheManager.get).toHaveBeenCalledWith('player:nonce:my-game:area02:player-abc:nonce-xyz');
    });

    it('should handle different players independently', async () => {
      mockCacheManager.get
        .mockResolvedValueOnce(null) // First player
        .mockResolvedValueOnce(null); // Second player

      const result1 = await service.checkAndMarkNonce('game-1', 'area01', 'player-1', 'same-nonce');
      const result2 = await service.checkAndMarkNonce('game-1', 'area01', 'player-2', 'same-nonce');

      expect(result1).toBe(true);
      expect(result2).toBe(true);
      expect(mockCacheManager.set).toHaveBeenCalledTimes(2);
    });
  });

  describe('edge cases', () => {
    it('should handle empty nonce', async () => {
      mockCacheManager.get.mockResolvedValue(null);

      const result = await service.checkAndMarkNonce('game-1', 'area01', 'uid-123', '');

      expect(result).toBe(true);
    });

    it('should handle special characters in nonce', async () => {
      mockCacheManager.get.mockResolvedValue(null);
      const specialNonce = 'nonce-with-special-chars_123!@#';

      const result = await service.checkAndMarkNonce('game-1', 'area01', 'uid-123', specialNonce);

      expect(result).toBe(true);
    });
  });
});
