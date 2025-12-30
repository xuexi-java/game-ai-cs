import { Test, TestingModule } from '@nestjs/testing';
import { SessionService } from './session.service';
import { PrismaService } from '../prisma/prisma.service';
import { AppLogger } from '../common/logger/app-logger.service';
import { MessageService } from '../message/message.service';
import { WebsocketGateway } from '../websocket/websocket.gateway';
import { TicketService } from '../ticket/ticket.service';
import { QueueService } from '../queue/queue.service';
import {
  SessionQueueService,
  SessionAIService,
  SessionAssignmentService,
  SessionTransferService,
} from './services';
import { NotFoundException, BadRequestException } from '@nestjs/common';

describe('SessionService', () => {
  let service: SessionService;
  let mockPrisma: any;
  let mockLogger: any;
  let mockMessageService: any;
  let mockWebsocketGateway: any;
  let mockTicketService: any;
  let mockQueueService: any;
  let mockSessionAIService: any;
  let mockSessionQueueService: any;
  let mockSessionAssignmentService: any;
  let mockSessionTransferService: any;

  const mockSession = {
    id: 'session-1',
    ticketId: 'ticket-1',
    agentId: null,
    status: 'PENDING',
    difyStatus: null,
    priorityScore: 50,
    queuePosition: null,
    queuedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ticket: {
      id: 'ticket-1',
      ticketNo: 'T-20240101-12345678',
      status: 'IN_PROGRESS',
      game: { id: 'game-1', name: 'Test Game' },
      server: null,
      attachments: [],
      ticketIssueTypes: [],
    },
    agent: null,
    messages: [],
  };

  const mockTicket = {
    id: 'ticket-1',
    ticketNo: 'T-20240101-12345678',
    status: 'IN_PROGRESS',
    game: { id: 'game-1', name: 'Test Game' },
  };

  beforeEach(async () => {
    mockPrisma = {
      session: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        count: jest.fn(),
      },
      ticket: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
      },
      user: {
        update: jest.fn(),
      },
      message: {
        findMany: jest.fn(),
      },
      $transaction: jest.fn(),
    };

    mockLogger = {
      setContext: jest.fn(),
      log: jest.fn(),
      debug: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      logBusiness: jest.fn(),
    };

    mockMessageService = {
      create: jest.fn(),
      createSystemMessage: jest.fn(),
    };

    mockWebsocketGateway = {
      notifyMessage: jest.fn(),
      notifySessionUpdate: jest.fn(),
      notifyNewSession: jest.fn(),
      notifyQueueUpdate: jest.fn(),
    };

    mockTicketService = {
      checkAndUpdateTicketStatus: jest.fn(),
      updateStatus: jest.fn(),
    };

    mockQueueService = {
      removeFromQueueWithRetry: jest.fn().mockResolvedValue(true),
    };

    mockSessionAIService = {
      triggerAIResponseAsync: jest.fn(),
      processAiReply: jest.fn().mockResolvedValue(undefined),
    };

    mockSessionQueueService = {
      reorderQueue: jest.fn(),
    };

    mockSessionAssignmentService = {
      joinSession: jest.fn(),
      assignSession: jest.fn(),
      autoAssignSession: jest.fn(),
      autoAssignAgentOnly: jest.fn(),
    };

    mockSessionTransferService = {
      transferToAgent: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SessionService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AppLogger, useValue: mockLogger },
        { provide: MessageService, useValue: mockMessageService },
        { provide: WebsocketGateway, useValue: mockWebsocketGateway },
        { provide: TicketService, useValue: mockTicketService },
        { provide: QueueService, useValue: mockQueueService },
        { provide: SessionAIService, useValue: mockSessionAIService },
        { provide: SessionQueueService, useValue: mockSessionQueueService },
        { provide: SessionAssignmentService, useValue: mockSessionAssignmentService },
        { provide: SessionTransferService, useValue: mockSessionTransferService },
      ],
    }).compile();

    service = module.get<SessionService>(SessionService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('should create a new session', async () => {
      mockPrisma.ticket.findUnique.mockResolvedValue(mockTicket);
      mockPrisma.session.findFirst.mockResolvedValue(null);
      mockPrisma.session.create.mockResolvedValue(mockSession);

      const result = await service.create({ ticketId: 'ticket-1' });

      expect(result).toBeDefined();
      expect(result.id).toBe('session-1');
      expect(mockSessionAIService.triggerAIResponseAsync).toHaveBeenCalled();
    });

    it('should return existing session if one exists', async () => {
      mockPrisma.ticket.findUnique.mockResolvedValue(mockTicket);
      mockPrisma.session.findFirst.mockResolvedValue(mockSession);

      const result = await service.create({ ticketId: 'ticket-1' });

      expect(result).toEqual(mockSession);
      expect(mockPrisma.session.create).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException when ticket not found', async () => {
      mockPrisma.ticket.findUnique.mockResolvedValue(null);

      await expect(service.create({ ticketId: 'invalid' })).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('handlePlayerMessage', () => {
    it('should create player message and trigger AI', async () => {
      mockPrisma.session.findUnique.mockResolvedValue(mockSession);
      mockMessageService.create.mockResolvedValue({ id: 'msg-1', content: 'Hello' });

      const result = await service.handlePlayerMessage('session-1', 'Hello');

      expect(result.playerMessage).toBeDefined();
      expect(mockWebsocketGateway.notifyMessage).toHaveBeenCalled();
    });

    it('should throw BadRequestException for empty content', async () => {
      await expect(service.handlePlayerMessage('session-1', '')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw NotFoundException when session not found', async () => {
      mockPrisma.session.findUnique.mockResolvedValue(null);

      await expect(service.handlePlayerMessage('invalid', 'Hello')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw BadRequestException when session is closed', async () => {
      mockPrisma.session.findUnique.mockResolvedValue({
        ...mockSession,
        status: 'CLOSED',
      });

      await expect(service.handlePlayerMessage('session-1', 'Hello')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should not trigger AI when session is IN_PROGRESS with agent', async () => {
      mockPrisma.session.findUnique.mockResolvedValue({
        ...mockSession,
        status: 'IN_PROGRESS',
        agentId: 'agent-1',
      });
      mockMessageService.create.mockResolvedValue({ id: 'msg-1', content: 'Hello' });

      const result = await service.handlePlayerMessage('session-1', 'Hello');

      expect(result.aiMessage).toBeNull();
      expect(mockSessionAIService.processAiReply).not.toHaveBeenCalled();
    });
  });

  describe('findOne', () => {
    it('should return session when found', async () => {
      mockPrisma.session.findUnique.mockResolvedValue(mockSession);

      const result = await service.findOne('session-1');

      expect(result).toBeDefined();
      expect(result.id).toBe('session-1');
    });

    it('should throw NotFoundException when session not found', async () => {
      mockPrisma.session.findUnique.mockResolvedValue(null);

      await expect(service.findOne('invalid')).rejects.toThrow(NotFoundException);
    });

    it('should restrict agent access to own sessions', async () => {
      mockPrisma.session.findUnique.mockResolvedValue({
        ...mockSession,
        agentId: 'other-agent',
      });

      await expect(
        service.findOne('session-1', { id: 'agent-1', role: 'AGENT' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('closeSession', () => {
    it('should close session (agent)', async () => {
      mockPrisma.session.findUnique
        .mockResolvedValueOnce(mockSession) // for findOne
        .mockResolvedValueOnce({ ticketId: 'ticket-1', status: 'PENDING', agentId: null });
      mockPrisma.session.update.mockResolvedValue({
        ...mockSession,
        status: 'CLOSED',
        closedAt: new Date(),
      });
      mockMessageService.createSystemMessage.mockResolvedValue({ id: 'sys-msg' });

      const result = await service.closeSession('session-1');

      expect(result.status).toBe('CLOSED');
      expect(mockSessionQueueService.reorderQueue).toHaveBeenCalled();
      expect(mockTicketService.checkAndUpdateTicketStatus).toHaveBeenCalled();
    });
  });

  describe('closeByPlayer', () => {
    it('should close session (player)', async () => {
      mockPrisma.session.findUnique
        .mockResolvedValueOnce({ ticketId: 'ticket-1', status: 'PENDING', agentId: null })
        .mockResolvedValueOnce(mockSession);
      mockPrisma.session.update.mockResolvedValue({
        ...mockSession,
        status: 'CLOSED',
        closedAt: new Date(),
      });
      mockMessageService.createSystemMessage.mockResolvedValue({ id: 'sys-msg' });

      const result = await service.closeByPlayer('session-1');

      expect(result.status).toBe('CLOSED');
      expect(mockQueueService.removeFromQueueWithRetry).toHaveBeenCalled();
    });

    it('should throw NotFoundException when session not found', async () => {
      mockPrisma.session.findUnique.mockResolvedValue(null);

      await expect(service.closeByPlayer('invalid')).rejects.toThrow(NotFoundException);
    });

    it('should return existing session if already closed', async () => {
      mockPrisma.session.findUnique
        .mockResolvedValueOnce({ ticketId: 'ticket-1', status: 'CLOSED', agentId: null })
        .mockResolvedValueOnce({ ...mockSession, status: 'CLOSED' });

      const result = await service.closeByPlayer('session-1');

      expect(result.status).toBe('CLOSED');
      expect(mockPrisma.session.update).not.toHaveBeenCalled();
    });
  });

  describe('joinSession', () => {
    it('should delegate to SessionAssignmentService', async () => {
      mockPrisma.session.findUnique.mockResolvedValue(mockSession);
      mockSessionAssignmentService.joinSession.mockResolvedValue({
        ...mockSession,
        agentId: 'agent-1',
        status: 'IN_PROGRESS',
      });

      await service.joinSession('session-1', 'agent-1');

      expect(mockSessionAssignmentService.joinSession).toHaveBeenCalled();
    });
  });

  describe('transferToAgent', () => {
    it('should delegate to SessionTransferService', async () => {
      mockSessionTransferService.transferToAgent.mockResolvedValue({
        queued: true,
        queuePosition: 1,
      });

      await service.transferToAgent('session-1', { urgency: 'NORMAL' });

      expect(mockSessionTransferService.transferToAgent).toHaveBeenCalledWith(
        'session-1',
        { urgency: 'NORMAL' },
      );
    });
  });

  describe('reorderQueue', () => {
    it('should delegate to SessionQueueService', async () => {
      await service.reorderQueue();

      expect(mockSessionQueueService.reorderQueue).toHaveBeenCalled();
    });
  });

  describe('findActiveSessionByTicket', () => {
    it('should find active session by ticket ID', async () => {
      mockPrisma.session.findFirst.mockResolvedValue(mockSession);

      const result = await service.findActiveSessionByTicket('ticket-1');

      expect(result).toBeDefined();
      expect(mockPrisma.session.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            ticketId: 'ticket-1',
            status: { in: ['PENDING', 'QUEUED', 'IN_PROGRESS'] },
          }),
        }),
      );
    });

    it('should return null when no active session', async () => {
      mockPrisma.session.findFirst.mockResolvedValue(null);

      const result = await service.findActiveSessionByTicket('ticket-1');

      expect(result).toBeNull();
    });
  });

  describe('getTicketMessages', () => {
    it('should return all messages for ticket sessions', async () => {
      mockPrisma.ticket.findUnique.mockResolvedValue(mockTicket);
      mockPrisma.session.findMany.mockResolvedValue([{ id: 'session-1' }]);
      mockPrisma.message.findMany.mockResolvedValue([
        { id: 'msg-1', content: 'Hello' },
        { id: 'msg-2', content: 'World' },
      ]);

      const result = await service.getTicketMessages('ticket-1');

      expect(result).toHaveLength(2);
    });

    it('should throw NotFoundException when ticket not found', async () => {
      mockPrisma.ticket.findUnique.mockResolvedValue(null);

      await expect(service.getTicketMessages('invalid')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should return empty array when no sessions', async () => {
      mockPrisma.ticket.findUnique.mockResolvedValue(mockTicket);
      mockPrisma.session.findMany.mockResolvedValue([]);

      const result = await service.getTicketMessages('ticket-1');

      expect(result).toEqual([]);
    });
  });
});
