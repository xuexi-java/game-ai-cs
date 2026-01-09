import { Test, TestingModule } from '@nestjs/testing';
import { PlayerApiService, CloseReason, ClosedBy } from './player-api.service';
import { PrismaService } from '../prisma/prisma.service';
import { KeyService } from './services/key.service';
import { TokenService } from './services/token.service';
import { UploadService } from '../upload/upload.service';

describe('PlayerApiService', () => {
  let service: PlayerApiService;
  let mockPrisma: any;
  let mockKeyService: any;
  let mockTokenService: any;
  let mockUploadService: any;

  const mockGame = {
    id: 'game-1',
    name: 'Test Game',
    enabled: true,
    playerApiEnabled: true,
    playerApiSecret: 'test-secret-key',
    deletedAt: null,
  };

  const mockServer = {
    id: 'server-1',
    gameId: 'game-1',
    name: 'Test Server',
    areaCode: 'area01',
    enabled: true,
  };

  const mockIssueType = {
    id: 'issue-type-1',
    name: 'Technical Issue',
    routeMode: 'AI',
    enabled: true,
    deletedAt: null,
  };

  const mockTicket = {
    id: 'ticket-1',
    ticketNo: 'T-20240101-12345678',
    gameId: 'game-1',
    serverId: 'server-1',
    playerIdOrName: 'TestPlayer',
    playerUid: 'player-uid-123',
    playerAreaId: 'area01',
    description: 'Test description',
    status: 'IN_PROGRESS',
    token: 'test-token',
    deletedAt: null,
    ticketIssueTypes: [{ issueType: mockIssueType }],
    sessions: [],
  };

  const mockSession = {
    id: 'session-1',
    ticketId: 'ticket-1',
    status: 'PENDING',
  };

  beforeEach(async () => {
    mockPrisma = {
      game: {
        findFirst: jest.fn(),
      },
      server: {
        findFirst: jest.fn(),
      },
      issueType: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
      },
      ticket: {
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      session: {
        findFirst: jest.fn(),
        create: jest.fn(),
      },
      message: {
        findMany: jest.fn(),
      },
      ticketIssueType: {
        create: jest.fn(),
      },
    };

    mockKeyService = {
      generateKey: jest.fn().mockReturnValue('test-key-12345'),
      storeKey: jest.fn().mockResolvedValue(undefined),
      generateWsUrl: jest.fn().mockReturnValue('wss://cs.example.com'),
      getKeyExpireAt: jest.fn().mockReturnValue(Date.now() + 3600000),
      getRequestCache: jest.fn().mockResolvedValue(null),
      storeRequestCache: jest.fn().mockResolvedValue(undefined),
    };

    mockTokenService = {
      generateWsToken: jest.fn().mockReturnValue('mock-ws-token'),
      generateUploadToken: jest.fn().mockReturnValue('mock-upload-token'),
      verifyWsToken: jest.fn().mockReturnValue({ valid: true, payload: {} }),
      verifyUploadToken: jest.fn().mockReturnValue({ valid: true, payload: {} }),
    };

    mockUploadService = {
      uploadFile: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PlayerApiService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: KeyService, useValue: mockKeyService },
        { provide: TokenService, useValue: mockTokenService },
        { provide: UploadService, useValue: mockUploadService },
      ],
    }).compile();

    service = module.get<PlayerApiService>(PlayerApiService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('CloseReason and ClosedBy enums', () => {
    it('should have correct CloseReason values', () => {
      expect(CloseReason.RESOLVED).toBe('RESOLVED');
      expect(CloseReason.MANUAL_PLAYER).toBe('MANUAL_PLAYER');
      expect(CloseReason.MANUAL_AGENT).toBe('MANUAL_AGENT');
      expect(CloseReason.AUTO_TIMEOUT).toBe('AUTO_TIMEOUT');
      expect(CloseReason.AUTO_CLOSED_BY_NEW_TICKET).toBe('AUTO_CLOSED_BY_NEW_TICKET');
      expect(CloseReason.DATA_CLEANUP).toBe('DATA_CLEANUP');
    });

    it('should have correct ClosedBy values', () => {
      expect(ClosedBy.PLAYER).toBe('PLAYER');
      expect(ClosedBy.AGENT).toBe('AGENT');
      expect(ClosedBy.SYSTEM).toBe('SYSTEM');
    });
  });
});
