import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { MessageService } from './message.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateMessageDto } from './dto/create-message.dto';
import { SenderType, MessageType } from '@prisma/client';

describe('MessageService', () => {
  let service: MessageService;
  let prismaService: PrismaService;

  const mockPrismaService = {
    session: {
      findUnique: jest.fn(),
    },
    message: {
      create: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MessageService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    service = module.get<MessageService>(MessageService);
    prismaService = module.get<PrismaService>(PrismaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('应该成功创建玩家消息', async () => {
      const mockSession = {
        id: 'session1',
        status: 'IN_PROGRESS',
      };

      const createMessageDto: CreateMessageDto = {
        sessionId: 'session1',
        content: '玩家消息内容',
        messageType: MessageType.TEXT,
      };

      const mockMessage = {
        id: '1',
        sessionId: 'session1',
        senderType: 'PLAYER' as SenderType,
        senderId: null,
        content: '玩家消息内容',
        messageType: MessageType.TEXT,
        createdAt: new Date(),
      };

      mockPrismaService.session.findUnique.mockResolvedValue(mockSession);
      mockPrismaService.message.create.mockResolvedValue(mockMessage);

      const result = await service.create(createMessageDto, 'PLAYER');

      expect(result).toEqual(mockMessage);
      expect(mockPrismaService.message.create).toHaveBeenCalledWith({
        data: {
          sessionId: 'session1',
          senderType: 'PLAYER',
          senderId: null,
          content: '玩家消息内容',
          messageType: MessageType.TEXT,
        },
        include: {},
      });
    });

    it('应该成功创建客服消息', async () => {
      const mockSession = {
        id: 'session1',
        status: 'IN_PROGRESS',
      };

      const createMessageDto: CreateMessageDto = {
        sessionId: 'session1',
        content: '客服回复内容',
        messageType: MessageType.TEXT,
      };

      const mockMessage = {
        id: '1',
        sessionId: 'session1',
        senderType: 'AGENT' as SenderType,
        senderId: 'agent1',
        content: '客服回复内容',
        messageType: MessageType.TEXT,
        agent: {
          id: 'agent1',
          username: 'agent1',
          realName: '客服1',
        },
        createdAt: new Date(),
      };

      mockPrismaService.session.findUnique.mockResolvedValue(mockSession);
      mockPrismaService.message.create.mockResolvedValue(mockMessage);

      const result = await service.create(createMessageDto, 'AGENT', 'agent1');

      expect(result).toEqual(mockMessage);
      expect(mockPrismaService.message.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            senderType: 'AGENT',
            senderId: 'agent1',
          }),
          include: expect.objectContaining({
            agent: expect.any(Object),
          }),
        }),
      );
    });

    it('应该抛出异常当会话不存在', async () => {
      mockPrismaService.session.findUnique.mockResolvedValue(null);

      const createMessageDto: CreateMessageDto = {
        sessionId: 'nonexistent',
        content: '消息内容',
      };

      await expect(service.create(createMessageDto, 'PLAYER')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('findBySession', () => {
    it('应该返回会话的所有消息', async () => {
      const mockSession = {
        id: 'session1',
        status: 'IN_PROGRESS',
      };

      const mockMessages = [
        {
          id: '1',
          sessionId: 'session1',
          content: '消息1',
          createdAt: new Date(),
        },
        {
          id: '2',
          sessionId: 'session1',
          content: '消息2',
          createdAt: new Date(),
        },
      ];

      mockPrismaService.session.findUnique.mockResolvedValue(mockSession);
      mockPrismaService.message.findMany.mockResolvedValue(mockMessages);

      const result = await service.findBySession('session1');

      expect(result).toEqual(mockMessages);
      expect(mockPrismaService.message.findMany).toHaveBeenCalledWith({
        where: { sessionId: 'session1' },
        orderBy: { createdAt: 'asc' },
        take: undefined,
        include: {
          agent: {
            select: {
              id: true,
              username: true,
              realName: true,
            },
          },
        },
      });
    });

    it('应该支持限制消息数量', async () => {
      const mockSession = {
        id: 'session1',
        status: 'IN_PROGRESS',
      };

      const mockMessages = [
        {
          id: '1',
          sessionId: 'session1',
          content: '消息1',
        },
      ];

      mockPrismaService.session.findUnique.mockResolvedValue(mockSession);
      mockPrismaService.message.findMany.mockResolvedValue(mockMessages);

      await service.findBySession('session1', 10);

      expect(mockPrismaService.message.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 10,
        }),
      );
    });

    it('应该抛出异常当会话不存在', async () => {
      mockPrismaService.session.findUnique.mockResolvedValue(null);

      await expect(service.findBySession('nonexistent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('createAIMessage', () => {
    it('应该成功创建AI消息', async () => {
      const mockSession = {
        id: 'session1',
        status: 'PENDING',
      };

      const mockMessage = {
        id: '1',
        sessionId: 'session1',
        senderType: 'AI' as SenderType,
        content: 'AI回复内容',
        messageType: MessageType.TEXT,
      };

      mockPrismaService.session.findUnique.mockResolvedValue(mockSession);
      mockPrismaService.message.create.mockResolvedValue(mockMessage);

      const result = await service.createAIMessage('session1', 'AI回复内容');

      expect(result).toEqual(mockMessage);
    });

    it('应该支持添加元数据', async () => {
      const mockSession = {
        id: 'session1',
        status: 'PENDING',
      };

      const mockMessage = {
        id: '1',
        sessionId: 'session1',
        senderType: 'AI' as SenderType,
        content: 'AI回复内容',
        messageType: MessageType.TEXT,
      };

      const updatedMessage = {
        ...mockMessage,
        metadata: { suggestedOptions: ['选项1', '选项2'] },
      };

      mockPrismaService.session.findUnique.mockResolvedValue(mockSession);
      mockPrismaService.message.create.mockResolvedValue(mockMessage);
      mockPrismaService.message.update.mockResolvedValue(updatedMessage);

      const result = await service.createAIMessage('session1', 'AI回复内容', {
        suggestedOptions: ['选项1', '选项2'],
      });

      expect(result.metadata).toBeDefined();
      expect(mockPrismaService.message.update).toHaveBeenCalled();
    });
  });

  describe('createSystemMessage', () => {
    it('应该成功创建系统通知消息', async () => {
      const mockSession = {
        id: 'session1',
        status: 'IN_PROGRESS',
      };

      const mockMessage = {
        id: '1',
        sessionId: 'session1',
        senderType: 'SYSTEM' as SenderType,
        content: '系统通知',
        messageType: MessageType.SYSTEM_NOTICE,
      };

      mockPrismaService.session.findUnique.mockResolvedValue(mockSession);
      mockPrismaService.message.create.mockResolvedValue(mockMessage);

      const result = await service.createSystemMessage('session1', '系统通知');

      expect(result).toEqual(mockMessage);
      expect(mockPrismaService.message.create).toHaveBeenCalledWith({
        data: {
          sessionId: 'session1',
          senderType: 'SYSTEM',
          senderId: null,
          content: '系统通知',
          messageType: MessageType.SYSTEM_NOTICE,
        },
        include: {},
      });
    });
  });
});

