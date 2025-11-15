/**
 * 会话服务单元测试
 * 
 * 测试覆盖：
 * - 创建会话和AI分流
 * - 客服接入会话
 * - 转人工处理
 * - 关闭会话
 */
import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { SessionService } from './session.service';
import { PrismaService } from '../prisma/prisma.service';
import { DifyService } from '../dify/dify.service';
import { MessageService } from '../message/message.service';
import { CreateSessionDto, TransferToAgentDto } from './dto/create-session.dto';

// Mock axios 模块（DifyService 依赖）
jest.mock('axios');

describe('SessionService', () => {
  let service: SessionService;
  let prismaService: PrismaService;
  let difyService: DifyService;
  let messageService: MessageService;

  const mockPrismaService = {
    ticket: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    session: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
    user: {
      count: jest.fn(),
      update: jest.fn(),
    },
    urgencyRule: {
      findMany: jest.fn(),
    },
  };

  const mockDifyService = {
    triage: jest.fn(),
  };

  const mockMessageService = {
    createAIMessage: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SessionService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
        {
          provide: DifyService,
          useValue: mockDifyService,
        },
        {
          provide: MessageService,
          useValue: mockMessageService,
        },
      ],
    }).compile();

    service = module.get<SessionService>(SessionService);
    prismaService = module.get<PrismaService>(PrismaService);
    difyService = module.get<DifyService>(DifyService);
    messageService = module.get<MessageService>(MessageService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('应该成功创建会话并调用AI分流', async () => {
      const mockTicket = {
        id: 'ticket1',
        description: '问题描述',
        game: {
          id: 'game1',
          difyApiKey: 'api-key',
          difyBaseUrl: 'https://api.dify.ai',
        },
      };

      const mockSession = {
        id: 'session1',
        ticketId: 'ticket1',
        status: 'PENDING',
        ticket: mockTicket,
      };

      const mockDifyResponse = {
        initial_reply: 'AI初始回复',
        suggested_options: ['选项1', '选项2'],
        detected_intent: 'intent1',
        urgency: 'urgent' as const,
      };

      const createSessionDto: CreateSessionDto = {
        ticketId: 'ticket1',
      };

      mockPrismaService.ticket.findUnique.mockResolvedValue(mockTicket);
      mockPrismaService.session.findFirst.mockResolvedValue(null);
      mockPrismaService.session.create.mockResolvedValue(mockSession);
      mockPrismaService.session.findUnique.mockResolvedValue({
        ...mockSession,
        ticket: mockTicket,
      });
      mockDifyService.triage.mockResolvedValue(mockDifyResponse);
      mockMessageService.createAIMessage.mockResolvedValue({
        id: 'msg1',
        content: 'AI初始回复',
      });

      const result = await service.create(createSessionDto);

      expect(result).toBeDefined();
      expect(mockDifyService.triage).toHaveBeenCalledWith(
        '问题描述',
        'api-key',
        'https://api.dify.ai',
      );
      expect(mockMessageService.createAIMessage).toHaveBeenCalled();
    });

    it('应该返回已存在的会话', async () => {
      const mockTicket = {
        id: 'ticket1',
        description: '问题描述',
        game: {
          id: 'game1',
          difyApiKey: 'api-key',
          difyBaseUrl: 'https://api.dify.ai',
        },
      };

      const existingSession = {
        id: 'session1',
        ticketId: 'ticket1',
        status: 'PENDING',
        ticket: mockTicket,
      };

      const createSessionDto: CreateSessionDto = {
        ticketId: 'ticket1',
      };

      mockPrismaService.ticket.findUnique.mockResolvedValue(mockTicket);
      mockPrismaService.session.findFirst.mockResolvedValue(existingSession);

      const result = await service.create(createSessionDto);

      expect(result).toEqual(existingSession);
      expect(mockPrismaService.session.create).not.toHaveBeenCalled();
    });

    it('应该抛出异常当工单不存在', async () => {
      mockPrismaService.ticket.findUnique.mockResolvedValue(null);

      const createSessionDto: CreateSessionDto = {
        ticketId: 'nonexistent',
      };

      await expect(service.create(createSessionDto)).rejects.toThrow(NotFoundException);
    });
  });

  describe('findOne', () => {
    it('应该返回会话详情', async () => {
      const mockSession = {
        id: 'session1',
        ticketId: 'ticket1',
        status: 'IN_PROGRESS',
        ticket: {
          id: 'ticket1',
          game: { id: 'game1' },
          server: { id: 'server1' },
          attachments: [],
        },
        agent: {
          id: 'agent1',
          username: 'agent1',
          realName: '客服1',
        },
        messages: [],
      };

      mockPrismaService.session.findUnique.mockResolvedValue(mockSession);

      const result = await service.findOne('session1');

      expect(result).toEqual(mockSession);
    });

    it('应该抛出异常当会话不存在', async () => {
      mockPrismaService.session.findUnique.mockResolvedValue(null);

      await expect(service.findOne('nonexistent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('findQueuedSessions', () => {
    it('应该返回待接入的会话列表', async () => {
      const mockSessions = [
        {
          id: 'session1',
          status: 'QUEUED',
          priorityScore: 100,
          ticket: {
            id: 'ticket1',
            game: { id: 'game1' },
          },
        },
      ];

      mockPrismaService.session.findMany.mockResolvedValue(mockSessions);

      const result = await service.findQueuedSessions();

      expect(result).toEqual(mockSessions);
      expect(mockPrismaService.session.findMany).toHaveBeenCalledWith({
        where: {
          status: 'QUEUED',
        },
        include: {
          ticket: {
            include: {
              game: true,
            },
          },
        },
        orderBy: [
          { priorityScore: 'desc' },
          { queuedAt: 'asc' },
        ],
      });
    });
  });

  describe('joinSession', () => {
    it('应该成功接入会话', async () => {
      const mockSession = {
        id: 'session1',
        ticketId: 'ticket1',
        status: 'QUEUED',
        ticket: {
          id: 'ticket1',
          game: { id: 'game1' },
          server: { id: 'server1' },
          attachments: [],
        },
        messages: [],
      };

      const updatedSession = {
        ...mockSession,
        agentId: 'agent1',
        status: 'IN_PROGRESS',
        startedAt: new Date(),
      };

      mockPrismaService.session.findUnique.mockResolvedValue(mockSession);
      mockPrismaService.session.update.mockResolvedValue(updatedSession);
      mockPrismaService.user.update.mockResolvedValue({});

      const result = await service.joinSession('session1', 'agent1');

      expect(result.agentId).toBe('agent1');
      expect(result.status).toBe('IN_PROGRESS');
      expect(mockPrismaService.user.update).toHaveBeenCalledWith({
        where: { id: 'agent1' },
        data: { isOnline: true },
      });
    });

    it('应该抛出异常当会话状态不允许接入', async () => {
      const mockSession = {
        id: 'session1',
        status: 'CLOSED',
      };

      mockPrismaService.session.findUnique.mockResolvedValue(mockSession);

      await expect(service.joinSession('session1', 'agent1')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('transferToAgent', () => {
    it('应该将会话加入队列当有在线客服', async () => {
      const mockSession = {
        id: 'session1',
        ticketId: 'ticket1',
        status: 'PENDING',
        ticket: {
          id: 'ticket1',
          ticketNo: 'T-001',
        },
      };

      const transferDto: TransferToAgentDto = {
        urgency: 'URGENT',
      };

      mockPrismaService.session.findUnique.mockResolvedValue(mockSession);
      mockPrismaService.user.count.mockResolvedValue(1);
      mockPrismaService.urgencyRule.findMany.mockResolvedValue([]);
      mockPrismaService.session.update.mockResolvedValue({
        ...mockSession,
        status: 'QUEUED',
        priorityScore: 0,
        queuedAt: new Date(),
      });
      mockPrismaService.session.count.mockResolvedValue(0);

      const result = await service.transferToAgent('session1', transferDto);

      expect(result.queued).toBe(true);
      expect(result.queuePosition).toBeDefined();
    });

    it('应该转为工单当没有在线客服', async () => {
      const mockSession = {
        id: 'session1',
        ticketId: 'ticket1',
        status: 'PENDING',
        ticket: {
          id: 'ticket1',
          ticketNo: 'T-001',
        },
      };

      const transferDto: TransferToAgentDto = {
        urgency: 'URGENT',
      };

      mockPrismaService.session.findUnique.mockResolvedValue(mockSession);
      mockPrismaService.user.count.mockResolvedValue(0);
      mockPrismaService.ticket.update.mockResolvedValue({});
      mockPrismaService.session.update.mockResolvedValue({
        ...mockSession,
        status: 'CLOSED',
        closedAt: new Date(),
      });

      const result = await service.transferToAgent('session1', transferDto);

      expect(result.queued).toBe(false);
      expect(result.message).toContain('加急工单');
    });
  });

  describe('closeSession', () => {
    it('应该成功关闭会话', async () => {
      const mockSession = {
        id: 'session1',
        status: 'IN_PROGRESS',
      };

      const closedSession = {
        ...mockSession,
        status: 'CLOSED',
        closedAt: new Date(),
      };

      mockPrismaService.session.findUnique.mockResolvedValue(mockSession);
      mockPrismaService.session.update.mockResolvedValue(closedSession);

      const result = await service.closeSession('session1');

      expect(result.status).toBe('CLOSED');
      expect(result.closedAt).toBeDefined();
    });
  });
});

