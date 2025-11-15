import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { SatisfactionService } from './satisfaction.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateRatingDto } from './dto/create-rating.dto';

describe('SatisfactionService', () => {
  let service: SatisfactionService;
  let prismaService: PrismaService;

  const mockPrismaService = {
    session: {
      findUnique: jest.fn(),
    },
    satisfactionRating: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SatisfactionService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    service = module.get<SatisfactionService>(SatisfactionService);
    prismaService = module.get<PrismaService>(PrismaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('应该成功创建满意度评价', async () => {
      const mockSession = {
        id: 'session1',
        ticketId: 'ticket1',
        status: 'CLOSED',
        agentId: 'agent1', // 添加 agentId 字段
        ticket: { id: 'ticket1' },
        agent: { id: 'agent1' },
      };

      const createRatingDto: CreateRatingDto = {
        sessionId: 'session1',
        rating: 5,
        tags: ['服务态度好', '响应速度快'],
        comment: '非常满意',
      };

      const mockRating = {
        id: '1',
        ...createRatingDto,
        ticketId: 'ticket1',
        agentId: 'agent1',
      };

      mockPrismaService.session.findUnique.mockResolvedValue(mockSession);
      mockPrismaService.satisfactionRating.findUnique.mockResolvedValue(null);
      mockPrismaService.satisfactionRating.create.mockResolvedValue(mockRating);

      const result = await service.create(createRatingDto);

      expect(result).toEqual(mockRating);
      expect(mockPrismaService.satisfactionRating.create).toHaveBeenCalledWith({
        data: {
          sessionId: 'session1',
          ticketId: 'ticket1',
          agentId: 'agent1',
          rating: 5,
          tags: ['服务态度好', '响应速度快'],
          comment: '非常满意',
        },
      });
    });

    it('应该抛出异常当会话不存在', async () => {
      mockPrismaService.session.findUnique.mockResolvedValue(null);

      const createRatingDto: CreateRatingDto = {
        sessionId: 'nonexistent',
        rating: 5,
        tags: [],
      };

      await expect(service.create(createRatingDto)).rejects.toThrow(NotFoundException);
    });

    it('应该抛出异常当会话尚未结束', async () => {
      const mockSession = {
        id: 'session1',
        status: 'IN_PROGRESS',
      };

      mockPrismaService.session.findUnique.mockResolvedValue(mockSession);

      const createRatingDto: CreateRatingDto = {
        sessionId: 'session1',
        rating: 5,
        tags: [],
      };

      await expect(service.create(createRatingDto)).rejects.toThrow(BadRequestException);
    });

    it('应该抛出异常当会话已评价', async () => {
      const mockSession = {
        id: 'session1',
        status: 'CLOSED',
        ticket: { id: 'ticket1' },
        agent: { id: 'agent1' },
      };

      const existingRating = {
        id: '1',
        sessionId: 'session1',
        rating: 4,
      };

      mockPrismaService.session.findUnique.mockResolvedValue(mockSession);
      mockPrismaService.satisfactionRating.findUnique.mockResolvedValue(existingRating);

      const createRatingDto: CreateRatingDto = {
        sessionId: 'session1',
        rating: 5,
        tags: [],
      };

      await expect(service.create(createRatingDto)).rejects.toThrow(BadRequestException);
    });
  });

  describe('findBySession', () => {
    it('应该返回会话的评价', async () => {
      const mockRating = {
        id: '1',
        sessionId: 'session1',
        rating: 5,
        agent: {
          id: 'agent1',
          username: 'agent1',
          realName: '客服1',
        },
      };

      mockPrismaService.satisfactionRating.findUnique.mockResolvedValue(mockRating);

      const result = await service.findBySession('session1');

      expect(result).toEqual(mockRating);
    });
  });

  describe('getAgentStats', () => {
    it('应该返回客服的评价统计', async () => {
      const mockRatings = [
        { id: '1', rating: 5 },
        { id: '2', rating: 4 },
        { id: '3', rating: 5 },
        { id: '4', rating: 3 },
        { id: '5', rating: 5 },
      ];

      mockPrismaService.satisfactionRating.findMany.mockResolvedValue(mockRatings);

      const result = await service.getAgentStats('agent1');

      expect(result).toEqual({
        total: 5,
        average: 4.4,
        distribution: {
          1: 0,
          2: 0,
          3: 1,
          4: 1,
          5: 3,
        },
      });
    });

    it('应该返回空统计当没有评价', async () => {
      mockPrismaService.satisfactionRating.findMany.mockResolvedValue([]);

      const result = await service.getAgentStats('agent1');

      expect(result).toEqual({
        total: 0,
        average: 0,
        distribution: {
          1: 0,
          2: 0,
          3: 0,
          4: 0,
          5: 0,
        },
      });
    });

    it('应该支持日期范围过滤', async () => {
      const mockRatings = [
        { id: '1', rating: 5 },
        { id: '2', rating: 4 },
      ];

      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-12-31');

      mockPrismaService.satisfactionRating.findMany.mockResolvedValue(mockRatings);

      const result = await service.getAgentStats('agent1', startDate, endDate);

      expect(result.total).toBe(2);
      expect(mockPrismaService.satisfactionRating.findMany).toHaveBeenCalledWith({
        where: {
          agentId: 'agent1',
          createdAt: {
            gte: startDate,
            lte: endDate,
          },
        },
      });
    });
  });
});

