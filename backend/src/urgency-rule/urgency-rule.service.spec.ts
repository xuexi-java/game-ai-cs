import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { UrgencyRuleService } from './urgency-rule.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUrgencyRuleDto, UpdateUrgencyRuleDto } from './dto/create-urgency-rule.dto';

describe('UrgencyRuleService', () => {
  let service: UrgencyRuleService;
  let prismaService: PrismaService;

  const mockPrismaService = {
    urgencyRule: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    session: {
      findMany: jest.fn(),
      update: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UrgencyRuleService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    service = module.get<UrgencyRuleService>(UrgencyRuleService);
    prismaService = module.get<PrismaService>(PrismaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('findAll', () => {
    it('应该返回所有规则列表', async () => {
      const mockRules = [
        {
          id: '1',
          name: '规则1',
          enabled: true,
          priorityWeight: 10,
          conditions: { keywords: ['紧急'] },
        },
      ];

      mockPrismaService.urgencyRule.findMany.mockResolvedValue(mockRules);

      const result = await service.findAll();

      expect(result).toEqual(mockRules);
      expect(mockPrismaService.urgencyRule.findMany).toHaveBeenCalledWith({
        where: { deletedAt: null },
        orderBy: { createdAt: 'desc' },
      });
    });
  });

  describe('findOne', () => {
    it('应该返回单个规则详情', async () => {
      const mockRule = {
        id: '1',
        name: '规则1',
        enabled: true,
        priorityWeight: 10,
        conditions: { keywords: ['紧急'] },
      };

      mockPrismaService.urgencyRule.findUnique.mockResolvedValue(mockRule);

      const result = await service.findOne('1');

      expect(result).toEqual(mockRule);
    });

    it('应该抛出异常当规则不存在', async () => {
      mockPrismaService.urgencyRule.findUnique.mockResolvedValue(null);

      await expect(service.findOne('nonexistent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('create', () => {
    it('应该成功创建规则', async () => {
      const createDto: CreateUrgencyRuleDto = {
        name: '新规则',
        enabled: true,
        priorityWeight: 20,
        conditions: {
          keywords: ['紧急', '重要'],
          intent: 'complaint',
        },
      };

      const mockRule = {
        id: '1',
        ...createDto,
      };

      mockPrismaService.urgencyRule.create.mockResolvedValue(mockRule);

      const result = await service.create(createDto);

      expect(result).toEqual(mockRule);
      expect(mockPrismaService.urgencyRule.create).toHaveBeenCalledWith({
        data: {
          ...createDto,
          conditions: createDto.conditions as any,
        },
      });
    });
  });

  describe('update', () => {
    it('应该成功更新规则', async () => {
      const existingRule = {
        id: '1',
        name: '规则1',
        enabled: true,
        priorityWeight: 10,
      };

      const updateDto: UpdateUrgencyRuleDto = {
        name: '更新后的规则名',
        priorityWeight: 15,
      };

      const updatedRule = {
        ...existingRule,
        ...updateDto,
      };

      mockPrismaService.urgencyRule.findUnique.mockResolvedValue(existingRule);
      mockPrismaService.urgencyRule.update.mockResolvedValue(updatedRule);

      const result = await service.update('1', updateDto);

      expect(result).toEqual(updatedRule);
    });
  });

  describe('remove', () => {
    it('应该软删除规则', async () => {
      const existingRule = {
        id: '1',
        name: '规则1',
        enabled: true,
      };

      mockPrismaService.urgencyRule.findUnique.mockResolvedValue(existingRule);
      mockPrismaService.urgencyRule.update.mockResolvedValue({
        ...existingRule,
        deletedAt: new Date(),
      });

      const result = await service.remove('1');

      expect(result.deletedAt).toBeDefined();
      expect(mockPrismaService.urgencyRule.update).toHaveBeenCalledWith({
        where: { id: '1' },
        data: { deletedAt: expect.any(Date) },
      });
    });
  });

  describe('recalculateQueue', () => {
    it('应该重新计算队列排序', async () => {
      const mockSessions = [
        {
          id: 'session1',
          status: 'QUEUED',
          ticket: {
            id: 'ticket1',
            description: '紧急问题',
            gameId: 'game1',
            identityStatus: 'VERIFIED_PAYMENT',
            priority: 'URGENT',
          },
        },
      ];

      const mockRules = [
        {
          id: 'rule1',
          enabled: true,
          priorityWeight: 10,
          conditions: {
            keywords: ['紧急'],
          },
        },
      ];

      mockPrismaService.session.findMany.mockResolvedValue(mockSessions);
      mockPrismaService.urgencyRule.findMany.mockResolvedValue(mockRules);
      mockPrismaService.session.update.mockResolvedValue({});

      const result = await service.recalculateQueue();

      expect(result.message).toBe('队列排序已重新计算');
      expect(mockPrismaService.session.update).toHaveBeenCalled();
    });
  });
});

