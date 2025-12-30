import { Test, TestingModule } from '@nestjs/testing';
import { TicketQueryService } from './ticket-query.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AppLogger } from '../../common/logger/app-logger.service';
import { TicketMessageService } from '../../ticket-message/ticket-message.service';
import { NotFoundException } from '../../common/exceptions';

describe('TicketQueryService', () => {
  let service: TicketQueryService;
  let mockPrisma: jest.Mocked<Partial<PrismaService>>;
  let mockLogger: jest.Mocked<Partial<AppLogger>>;
  let mockTicketMessageService: jest.Mocked<Partial<TicketMessageService>>;

  const mockTicket = {
    id: 'ticket-1',
    ticketNo: 'T-20240101-12345678',
    token: 'test-token',
    status: 'WAITING',
    description: 'Test issue',
    gameId: 'game-1',
    playerIdOrName: 'player1',
    serverId: null,
    serverName: 'Server 1',
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    game: { id: 'game-1', name: 'Test Game' },
    server: null,
    attachments: [],
    sessions: [],
    ticketIssueTypes: [
      {
        issueType: { id: 'issue-1', name: 'Bug' },
      },
    ],
  };

  beforeEach(async () => {
    // Mock Prisma
    mockPrisma = {
      ticket: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
      } as any,
    };

    // Mock Logger
    mockLogger = {
      setContext: jest.fn(),
      log: jest.fn(),
      debug: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };

    // Mock TicketMessageService
    mockTicketMessageService = {
      findByTicket: jest.fn().mockResolvedValue([]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TicketQueryService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AppLogger, useValue: mockLogger },
        { provide: TicketMessageService, useValue: mockTicketMessageService },
      ],
    }).compile();

    service = module.get<TicketQueryService>(TicketQueryService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('checkOpenTicket', () => {
    it('should return hasOpenTicket: true when open ticket exists', async () => {
      (mockPrisma.ticket!.findFirst as jest.Mock).mockResolvedValue(mockTicket);

      const result = await service.checkOpenTicket(
        'game-1',
        null,
        'Server 1',
        'player1',
      );

      expect(result.hasOpenTicket).toBe(true);
      expect(result.ticket).toEqual({
        id: mockTicket.id,
        ticketNo: mockTicket.ticketNo,
        token: mockTicket.token,
      });
    });

    it('should return hasOpenTicket: false when no open ticket', async () => {
      (mockPrisma.ticket!.findFirst as jest.Mock).mockResolvedValue(null);

      const result = await service.checkOpenTicket(
        'game-1',
        null,
        'Server 1',
        'player1',
      );

      expect(result.hasOpenTicket).toBe(false);
      expect(result.ticket).toBeNull();
    });

    it('should use serverId when provided', async () => {
      (mockPrisma.ticket!.findFirst as jest.Mock).mockResolvedValue(null);

      await service.checkOpenTicket('game-1', 'server-1', null, 'player1');

      expect(mockPrisma.ticket!.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            serverId: 'server-1',
          }),
        }),
      );
    });
  });

  describe('findOpenTicketsByPlayer', () => {
    it('should return formatted tickets', async () => {
      (mockPrisma.ticket!.findMany as jest.Mock).mockResolvedValue([mockTicket]);

      const result = await service.findOpenTicketsByPlayer(
        'game-1',
        null,
        null,
        'player1',
      );

      expect(result).toHaveLength(1);
      expect(result[0]).toHaveProperty('id', mockTicket.id);
      expect(result[0]).toHaveProperty('ticketNo', mockTicket.ticketNo);
      expect(result[0]).toHaveProperty('issueTypes');
    });

    it('should return empty array when no tickets', async () => {
      (mockPrisma.ticket!.findMany as jest.Mock).mockResolvedValue([]);

      const result = await service.findOpenTicketsByPlayer(
        'game-1',
        null,
        null,
        'player1',
      );

      expect(result).toEqual([]);
    });
  });

  describe('checkOpenTicketByIssueType', () => {
    it('should find ticket by issue type', async () => {
      (mockPrisma.ticket!.findFirst as jest.Mock).mockResolvedValue(mockTicket);

      const result = await service.checkOpenTicketByIssueType(
        'game-1',
        'server-1',
        'player1',
        'issue-1',
      );

      expect(result.hasOpenTicket).toBe(true);
      expect(mockPrisma.ticket!.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            ticketIssueTypes: { some: { issueTypeId: 'issue-1' } },
          }),
        }),
      );
    });
  });

  describe('findByToken', () => {
    it('should return ticket when found', async () => {
      (mockPrisma.ticket!.findUnique as jest.Mock).mockResolvedValue(mockTicket);

      const result = await service.findByToken('test-token');

      expect(result).toEqual(mockTicket);
    });

    it('should throw NotFoundException when ticket not found', async () => {
      (mockPrisma.ticket!.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(service.findByToken('invalid-token')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw NotFoundException when ticket is deleted', async () => {
      (mockPrisma.ticket!.findUnique as jest.Mock).mockResolvedValue({
        ...mockTicket,
        deletedAt: new Date(),
      });

      await expect(service.findByToken('test-token')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('findOne', () => {
    it('should return ticket when found', async () => {
      (mockPrisma.ticket!.findUnique as jest.Mock).mockResolvedValue(mockTicket);

      const result = await service.findOne('ticket-1');

      expect(result).toEqual(mockTicket);
    });

    it('should throw NotFoundException when ticket not found', async () => {
      (mockPrisma.ticket!.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(service.findOne('invalid-id')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('findByTicketNo', () => {
    it('should return ticket when found', async () => {
      (mockPrisma.ticket!.findFirst as jest.Mock).mockResolvedValue(mockTicket);

      const result = await service.findByTicketNo('T-20240101-12345678');

      expect(result).toEqual(mockTicket);
    });

    it('should throw NotFoundException when ticket not found', async () => {
      (mockPrisma.ticket!.findFirst as jest.Mock).mockResolvedValue(null);

      await expect(service.findByTicketNo('invalid-no')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('getMessagesByTicketNo', () => {
    it('should return messages for ticket', async () => {
      (mockPrisma.ticket!.findFirst as jest.Mock).mockResolvedValue(mockTicket);
      mockTicketMessageService.findByTicket!.mockResolvedValue([
        { id: 'msg-1', content: 'Hello' },
      ]);

      const result = await service.getMessagesByTicketNo('T-20240101-12345678');

      expect(result).toHaveLength(1);
      expect(mockTicketMessageService.findByTicket).toHaveBeenCalledWith('ticket-1');
    });
  });

  describe('findAll', () => {
    it('should return paginated tickets', async () => {
      (mockPrisma.ticket!.findMany as jest.Mock).mockResolvedValue([mockTicket]);
      (mockPrisma.ticket!.count as jest.Mock).mockResolvedValue(1);

      const result = await service.findAll({ page: 1, pageSize: 10 });

      expect(result).toEqual({
        items: [mockTicket],
        total: 1,
        page: 1,
        pageSize: 10,
        totalPages: 1,
      });
    });

    it('should filter by status', async () => {
      (mockPrisma.ticket!.findMany as jest.Mock).mockResolvedValue([]);
      (mockPrisma.ticket!.count as jest.Mock).mockResolvedValue(0);

      await service.findAll({ status: 'WAITING' });

      expect(mockPrisma.ticket!.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: 'WAITING',
          }),
        }),
      );
    });

    it('should filter by agent role', async () => {
      (mockPrisma.ticket!.findMany as jest.Mock).mockResolvedValue([]);
      (mockPrisma.ticket!.count as jest.Mock).mockResolvedValue(0);

      await service.findAll({}, { id: 'agent-1', role: 'AGENT' });

      expect(mockPrisma.ticket!.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            sessions: { some: { agentId: 'agent-1' } },
          }),
        }),
      );
    });

    it('should use default pagination', async () => {
      (mockPrisma.ticket!.findMany as jest.Mock).mockResolvedValue([]);
      (mockPrisma.ticket!.count as jest.Mock).mockResolvedValue(0);

      const result = await service.findAll({});

      expect(result.page).toBe(1);
      expect(result.pageSize).toBe(10);
    });

    it('should filter by date range', async () => {
      (mockPrisma.ticket!.findMany as jest.Mock).mockResolvedValue([]);
      (mockPrisma.ticket!.count as jest.Mock).mockResolvedValue(0);

      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-12-31');

      await service.findAll({ startDate, endDate });

      expect(mockPrisma.ticket!.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            createdAt: {
              gte: startDate,
              lte: endDate,
            },
          }),
        }),
      );
    });
  });
});
