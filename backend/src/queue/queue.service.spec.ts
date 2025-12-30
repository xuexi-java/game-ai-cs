import { Test, TestingModule } from '@nestjs/testing';
import { QueueService } from './queue.service';
import { PrismaService } from '../prisma/prisma.service';
import { AppLogger } from '../common/logger/app-logger.service';
import Redis from 'ioredis';

describe('QueueService', () => {
  let service: QueueService;
  let mockRedis: jest.Mocked<Partial<Redis>>;
  let mockPrisma: jest.Mocked<Partial<PrismaService>>;
  let mockLogger: jest.Mocked<Partial<AppLogger>>;

  beforeEach(async () => {
    // Mock Redis
    mockRedis = {
      zadd: jest.fn().mockResolvedValue(1),
      zrem: jest.fn().mockResolvedValue(1),
      zrevrank: jest.fn().mockResolvedValue(0),
      zrevrange: jest.fn().mockResolvedValue(['session-1', 'session-2']),
      zcard: jest.fn().mockResolvedValue(2),
      ping: jest.fn().mockResolvedValue('PONG'),
      scan: jest.fn().mockResolvedValue(['0', []]),
      status: 'ready',
    };

    // Mock Prisma
    mockPrisma = {
      session: {
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn().mockResolvedValue({}),
      } as any,
      $queryRaw: jest.fn().mockResolvedValue([{ 1: 1 }]),
    };

    // Mock Logger
    mockLogger = {
      setContext: jest.fn(),
      log: jest.fn(),
      debug: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      logBusiness: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        QueueService,
        { provide: 'REDIS_CLIENT', useValue: mockRedis },
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AppLogger, useValue: mockLogger },
      ],
    }).compile();

    service = module.get<QueueService>(QueueService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('calculateScore', () => {
    it('should calculate higher score for higher priority', () => {
      const date = new Date('2024-01-01T00:00:00Z');
      // Access private method through any type casting
      const score1 = (service as any).calculateScore(100, date);
      const score2 = (service as any).calculateScore(50, date);
      expect(score1).toBeGreaterThan(score2);
    });

    it('should calculate higher score for earlier time with same priority', () => {
      const earlierDate = new Date('2024-01-01T00:00:00Z');
      const laterDate = new Date('2024-01-02T00:00:00Z');
      const score1 = (service as any).calculateScore(100, earlierDate);
      const score2 = (service as any).calculateScore(100, laterDate);
      expect(score1).toBeGreaterThan(score2);
    });

    it('should handle negative priority score', () => {
      const date = new Date();
      const score = (service as any).calculateScore(-10, date);
      expect(score).toBeGreaterThanOrEqual(0);
    });
  });

  describe('isRedisAvailable', () => {
    it('should return true when Redis responds with PONG', async () => {
      mockRedis.ping!.mockResolvedValue('PONG');
      const result = await service.isRedisAvailable();
      expect(result).toBe(true);
    });

    it('should return false when Redis ping fails', async () => {
      mockRedis.ping!.mockRejectedValue(new Error('Connection refused'));
      const result = await service.isRedisAvailable();
      expect(result).toBe(false);
    });

    it('should return false when Redis ping times out', async () => {
      mockRedis.ping!.mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve('PONG'), 5000)),
      );
      const result = await service.isRedisAvailable();
      expect(result).toBe(false);
    });
  });

  describe('addToUnassignedQueue', () => {
    it('should add session to unassigned queue', async () => {
      const sessionId = 'test-session-id';
      const priorityScore = 100;
      const queuedAt = new Date();

      await service.addToUnassignedQueue(sessionId, priorityScore, queuedAt);

      expect(mockRedis.zadd).toHaveBeenCalledWith(
        'queue:unassigned',
        expect.any(Number),
        sessionId,
      );
    });

    it('should throw error when Redis fails', async () => {
      mockRedis.zadd!.mockRejectedValue(new Error('Redis error'));

      await expect(
        service.addToUnassignedQueue('session-1', 100, new Date()),
      ).rejects.toThrow('Redis error');
    });
  });

  describe('addToAgentQueue', () => {
    it('should add session to agent queue', async () => {
      const sessionId = 'test-session-id';
      const agentId = 'agent-1';
      const priorityScore = 100;
      const queuedAt = new Date();

      await service.addToAgentQueue(sessionId, agentId, priorityScore, queuedAt);

      expect(mockRedis.zadd).toHaveBeenCalledWith(
        `queue:agent:${agentId}`,
        expect.any(Number),
        sessionId,
      );
    });
  });

  describe('removeFromQueue', () => {
    it('should remove session from unassigned queue', async () => {
      await service.removeFromQueue('session-1');

      expect(mockRedis.zrem).toHaveBeenCalledWith('queue:unassigned', 'session-1');
    });

    it('should remove session from both queues when agentId is provided', async () => {
      await service.removeFromQueue('session-1', 'agent-1');

      expect(mockRedis.zrem).toHaveBeenCalledWith('queue:unassigned', 'session-1');
      expect(mockRedis.zrem).toHaveBeenCalledWith('queue:agent:agent-1', 'session-1');
    });
  });

  describe('getQueuePosition', () => {
    it('should return position starting from 1', async () => {
      mockRedis.zrevrank!.mockResolvedValue(0); // First position

      const position = await service.getQueuePosition('session-1');

      expect(position).toBe(1);
    });

    it('should return null when session not in queue', async () => {
      mockRedis.zrevrank!.mockResolvedValue(null);

      const position = await service.getQueuePosition('non-existent');

      expect(position).toBeNull();
    });

    it('should use agent queue when agentId is provided', async () => {
      mockRedis.zrevrank!.mockResolvedValue(2);

      const position = await service.getQueuePosition('session-1', 'agent-1');

      expect(mockRedis.zrevrank).toHaveBeenCalledWith(
        'queue:agent:agent-1',
        'session-1',
      );
      expect(position).toBe(3);
    });
  });

  describe('getQueueSessionIds', () => {
    it('should return session IDs in priority order', async () => {
      mockRedis.zrevrange!.mockResolvedValue(['session-1', 'session-2']);

      const sessionIds = await service.getQueueSessionIds();

      expect(sessionIds).toEqual(['session-1', 'session-2']);
    });

    it('should respect limit parameter', async () => {
      await service.getQueueSessionIds(null, 5);

      expect(mockRedis.zrevrange).toHaveBeenCalledWith('queue:unassigned', 0, 4);
    });
  });

  describe('getQueueLength', () => {
    it('should return queue length', async () => {
      mockRedis.zcard!.mockResolvedValue(5);

      const length = await service.getQueueLength();

      expect(length).toBe(5);
    });
  });

  describe('addToUnassignedQueueWithRetry', () => {
    it('should return true on success', async () => {
      const result = await service.addToUnassignedQueueWithRetry(
        'session-1',
        100,
        new Date(),
      );

      expect(result).toBe(true);
    });

    it('should return false when Redis is unavailable', async () => {
      mockRedis.ping!.mockRejectedValue(new Error('Connection refused'));

      const result = await service.addToUnassignedQueueWithRetry(
        'session-1',
        100,
        new Date(),
      );

      expect(result).toBe(false);
    });
  });

  describe('moveToAgentQueue', () => {
    it('should move session from unassigned to agent queue', async () => {
      const sessionId = 'session-1';
      const agentId = 'agent-1';
      const priorityScore = 100;
      const queuedAt = new Date();

      await service.moveToAgentQueue(sessionId, agentId, priorityScore, queuedAt);

      expect(mockRedis.zrem).toHaveBeenCalledWith('queue:unassigned', sessionId);
      expect(mockRedis.zadd).toHaveBeenCalledWith(
        `queue:agent:${agentId}`,
        expect.any(Number),
        sessionId,
      );
    });
  });

  describe('isConnectionError', () => {
    it('should identify connection errors', () => {
      const isConnectionError = (service as any).isConnectionError;

      expect(isConnectionError.call(service, new Error('ECONNREFUSED'))).toBe(true);
      expect(isConnectionError.call(service, new Error('Connection timeout'))).toBe(true);
      expect(isConnectionError.call(service, new Error('maxRetriesPerRequest'))).toBe(true);
      expect(isConnectionError.call(service, new Error('Some other error'))).toBe(false);
    });
  });
});
