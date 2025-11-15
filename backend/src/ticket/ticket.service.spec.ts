import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { TicketService } from './ticket.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTicketDto } from './dto/create-ticket.dto';

describe('TicketService', () => {
  let service: TicketService;
  let prismaService: PrismaService;

  const mockPrismaService = {
    ticket: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TicketService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    service = module.get<TicketService>(TicketService);
    prismaService = module.get<PrismaService>(PrismaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('checkOpenTicket', () => {
    it('应该返回true当存在未关闭的工单', async () => {
      const mockTicket = {
        id: '1',
        ticketNo: 'T-20240101-001',
        status: 'NEW',
      };

      mockPrismaService.ticket.findFirst.mockResolvedValue(mockTicket);

      const result = await service.checkOpenTicket('game1', 'server1', 'player1');

      expect(result).toEqual({
        hasOpenTicket: true,
        ticketNo: 'T-20240101-001',
        ticketId: '1',
      });
    });

    it('应该返回false当不存在未关闭的工单', async () => {
      mockPrismaService.ticket.findFirst.mockResolvedValue(null);

      const result = await service.checkOpenTicket('game1', 'server1', 'player1');

      expect(result).toEqual({
        hasOpenTicket: false,
        ticketNo: undefined,
        ticketId: undefined,
      });
    });
  });

  describe('create', () => {
    it('应该成功创建工单', async () => {
      const createTicketDto: CreateTicketDto = {
        gameId: 'game1',
        serverId: 'server1',
        playerIdOrName: 'player1',
        description: '问题描述',
        occurredAt: new Date().toISOString(),
      };

      const mockTicket = {
        id: '1',
        ticketNo: 'T-20240101-001',
        token: 'mock-token',
        ...createTicketDto,
        status: 'NEW',
        identityStatus: 'NOT_VERIFIED',
      };

      mockPrismaService.ticket.create.mockResolvedValue(mockTicket);

      const result = await service.create(createTicketDto);

      expect(result).toHaveProperty('ticketId');
      expect(result).toHaveProperty('ticketNo');
      expect(result).toHaveProperty('token');
      expect(mockPrismaService.ticket.create).toHaveBeenCalled();
    });

    it('应该异步验证支付身份当提供订单号', async () => {
      const createTicketDto: CreateTicketDto = {
        gameId: 'game1',
        serverId: 'server1',
        playerIdOrName: 'player1',
        description: '问题描述',
        paymentOrderNo: 'ORDER123',
      };

      const mockTicket = {
        id: '1',
        ticketNo: 'T-20240101-001',
        token: 'mock-token',
        ...createTicketDto,
        status: 'NEW',
        identityStatus: 'NOT_VERIFIED',
      };

      mockPrismaService.ticket.create.mockResolvedValue(mockTicket);
      mockPrismaService.ticket.update.mockResolvedValue({
        ...mockTicket,
        identityStatus: 'VERIFIED_PAYMENT',
      });

      await service.create(createTicketDto);

      // 等待异步操作完成
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(mockPrismaService.ticket.create).toHaveBeenCalled();
    });
  });

  describe('findByToken', () => {
    it('应该根据token返回工单', async () => {
      const mockTicket = {
        id: '1',
        ticketNo: 'T-20240101-001',
        token: 'valid-token',
        deletedAt: null,
        game: { id: 'game1', name: '游戏1' },
        server: { id: 'server1', name: '区服1' },
        attachments: [],
      };

      mockPrismaService.ticket.findUnique.mockResolvedValue(mockTicket);

      const result = await service.findByToken('valid-token');

      expect(result).toEqual(mockTicket);
      expect(mockPrismaService.ticket.findUnique).toHaveBeenCalledWith({
        where: { token: 'valid-token' },
        include: {
          game: true,
          server: true,
          attachments: {
            orderBy: { sortOrder: 'asc' },
          },
        },
      });
    });

    it('应该抛出异常当工单不存在', async () => {
      mockPrismaService.ticket.findUnique.mockResolvedValue(null);

      await expect(service.findByToken('invalid-token')).rejects.toThrow(NotFoundException);
    });

    it('应该抛出异常当工单已删除', async () => {
      const mockTicket = {
        id: '1',
        ticketNo: 'T-20240101-001',
        token: 'deleted-token',
        deletedAt: new Date(),
      };

      mockPrismaService.ticket.findUnique.mockResolvedValue(mockTicket);

      await expect(service.findByToken('deleted-token')).rejects.toThrow(NotFoundException);
    });
  });

  describe('findOne', () => {
    it('应该返回工单详情', async () => {
      const mockTicket = {
        id: '1',
        ticketNo: 'T-20240101-001',
        deletedAt: null,
        game: { id: 'game1', name: '游戏1' },
        server: { id: 'server1', name: '区服1' },
        attachments: [],
        sessions: [],
      };

      mockPrismaService.ticket.findUnique.mockResolvedValue(mockTicket);

      const result = await service.findOne('1');

      expect(result).toEqual(mockTicket);
    });

    it('应该抛出异常当工单不存在', async () => {
      mockPrismaService.ticket.findUnique.mockResolvedValue(null);

      await expect(service.findOne('nonexistent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('updateStatus', () => {
    it('应该成功更新工单状态', async () => {
      const existingTicket = {
        id: '1',
        status: 'NEW',
        deletedAt: null,
      };

      const updatedTicket = {
        ...existingTicket,
        status: 'IN_PROGRESS',
      };

      mockPrismaService.ticket.findUnique.mockResolvedValue(existingTicket);
      mockPrismaService.ticket.update.mockResolvedValue(updatedTicket);

      const result = await service.updateStatus('1', 'IN_PROGRESS');

      expect(result.status).toBe('IN_PROGRESS');
    });
  });

  describe('updatePriority', () => {
    it('应该成功更新工单优先级', async () => {
      const existingTicket = {
        id: '1',
        priority: 'NORMAL',
        deletedAt: null,
      };

      const updatedTicket = {
        ...existingTicket,
        priority: 'URGENT',
      };

      mockPrismaService.ticket.findUnique.mockResolvedValue(existingTicket);
      mockPrismaService.ticket.update.mockResolvedValue(updatedTicket);

      const result = await service.updatePriority('1', 'URGENT');

      expect(result.priority).toBe('URGENT');
    });
  });

  describe('findAll', () => {
    it('应该返回分页的工单列表', async () => {
      const mockTickets = [
        {
          id: '1',
          ticketNo: 'T-20240101-001',
          status: 'NEW',
          game: { id: 'game1', name: '游戏1' },
          server: { id: 'server1', name: '区服1' },
        },
      ];

      mockPrismaService.ticket.findMany.mockResolvedValue(mockTickets);
      mockPrismaService.ticket.count.mockResolvedValue(1);

      const result = await service.findAll({
        page: 1,
        pageSize: 10,
      });

      expect(result).toEqual({
        data: mockTickets,
        total: 1,
        page: 1,
        pageSize: 10,
        totalPages: 1,
      });
    });

    it('应该支持状态过滤', async () => {
      const mockTickets = [
        {
          id: '1',
          ticketNo: 'T-20240101-001',
          status: 'NEW',
        },
      ];

      mockPrismaService.ticket.findMany.mockResolvedValue(mockTickets);
      mockPrismaService.ticket.count.mockResolvedValue(1);

      const result = await service.findAll({
        status: 'NEW',
        page: 1,
        pageSize: 10,
      });

      expect(mockPrismaService.ticket.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: 'NEW',
          }),
        }),
      );
    });
  });
});

