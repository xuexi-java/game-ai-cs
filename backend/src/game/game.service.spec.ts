import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { GameService } from './game.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateGameDto, UpdateGameDto } from './dto/create-game.dto';
import { CreateServerDto, UpdateServerDto } from './dto/create-server.dto';

describe('GameService', () => {
  let service: GameService;
  let prismaService: PrismaService;

  const mockPrismaService = {
    game: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    server: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GameService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    service = module.get<GameService>(GameService);
    prismaService = module.get<PrismaService>(PrismaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('findAll', () => {
    it('应该返回所有游戏列表', async () => {
      const mockGames = [
        {
          id: '1',
          name: '游戏1',
          enabled: true,
          servers: [],
        },
      ];

      mockPrismaService.game.findMany.mockResolvedValue(mockGames);

      const result = await service.findAll();

      expect(result).toEqual(mockGames);
      expect(mockPrismaService.game.findMany).toHaveBeenCalledWith({
        where: { deletedAt: null },
        include: {
          servers: {
            where: { deletedAt: null },
            orderBy: { name: 'asc' },
          },
        },
        orderBy: { createdAt: 'desc' },
      });
    });
  });

  describe('findOne', () => {
    it('应该返回单个游戏详情', async () => {
      const mockGame = {
        id: '1',
        name: '游戏1',
        enabled: true,
        servers: [],
      };

      mockPrismaService.game.findUnique.mockResolvedValue(mockGame);

      const result = await service.findOne('1');

      expect(result).toEqual(mockGame);
      expect(mockPrismaService.game.findUnique).toHaveBeenCalledWith({
        where: { id: '1', deletedAt: null },
        include: {
          servers: {
            where: { deletedAt: null },
          },
        },
      });
    });

    it('应该抛出异常当游戏不存在', async () => {
      mockPrismaService.game.findUnique.mockResolvedValue(null);

      await expect(service.findOne('nonexistent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('findEnabled', () => {
    it('应该返回所有启用的游戏', async () => {
      const mockGames = [
        {
          id: '1',
          name: '游戏1',
          enabled: true,
          servers: [],
        },
      ];

      mockPrismaService.game.findMany.mockResolvedValue(mockGames);

      const result = await service.findEnabled();

      expect(result).toEqual(mockGames);
      expect(mockPrismaService.game.findMany).toHaveBeenCalledWith({
        where: {
          enabled: true,
          deletedAt: null,
        },
        include: {
          servers: {
            where: {
              enabled: true,
              deletedAt: null,
            },
          },
        },
        orderBy: { name: 'asc' },
      });
    });
  });

  describe('create', () => {
    it('应该成功创建游戏', async () => {
      const createGameDto: CreateGameDto = {
        name: '新游戏',
        icon: 'icon.png',
        enabled: true,
        difyApiKey: 'api-key',
        difyBaseUrl: 'https://api.dify.ai',
      };

      const mockGame = {
        id: '1',
        ...createGameDto,
        servers: [],
      };

      mockPrismaService.game.create.mockResolvedValue(mockGame);

      const result = await service.create(createGameDto);

      expect(result).toEqual(mockGame);
      expect(mockPrismaService.game.create).toHaveBeenCalledWith({
        data: createGameDto,
        include: {
          servers: true,
        },
      });
    });
  });

  describe('update', () => {
    it('应该成功更新游戏', async () => {
      const existingGame = {
        id: '1',
        name: '游戏1',
        enabled: true,
      };

      const updateGameDto: UpdateGameDto = {
        name: '更新后的游戏名',
      };

      const updatedGame = {
        ...existingGame,
        ...updateGameDto,
        servers: [],
      };

      mockPrismaService.game.findUnique.mockResolvedValue(existingGame);
      mockPrismaService.game.update.mockResolvedValue(updatedGame);

      const result = await service.update('1', updateGameDto);

      expect(result).toEqual(updatedGame);
      expect(mockPrismaService.game.update).toHaveBeenCalledWith({
        where: { id: '1' },
        data: updateGameDto,
        include: {
          servers: true,
        },
      });
    });
  });

  describe('remove', () => {
    it('应该软删除游戏', async () => {
      const existingGame = {
        id: '1',
        name: '游戏1',
        enabled: true,
      };

      mockPrismaService.game.findUnique.mockResolvedValue(existingGame);
      mockPrismaService.game.update.mockResolvedValue({
        ...existingGame,
        deletedAt: new Date(),
      });

      const result = await service.remove('1');

      expect(result.deletedAt).toBeDefined();
      expect(mockPrismaService.game.update).toHaveBeenCalledWith({
        where: { id: '1' },
        data: { deletedAt: expect.any(Date) },
      });
    });
  });

  describe('createServer', () => {
    it('应该成功创建区服', async () => {
      const existingGame = {
        id: '1',
        name: '游戏1',
      };

      const createServerDto: CreateServerDto = {
        gameId: '1',
        name: '区服1',
        enabled: true,
      };

      const mockServer = {
        id: '1',
        ...createServerDto,
      };

      mockPrismaService.game.findUnique.mockResolvedValue(existingGame);
      mockPrismaService.server.create.mockResolvedValue(mockServer);

      const result = await service.createServer(createServerDto);

      expect(result).toEqual(mockServer);
      expect(mockPrismaService.server.create).toHaveBeenCalledWith({
        data: createServerDto,
      });
    });
  });

  describe('updateServer', () => {
    it('应该成功更新区服', async () => {
      const existingServer = {
        id: '1',
        name: '区服1',
        gameId: '1',
        deletedAt: null,
      };

      const updateServerDto: UpdateServerDto = {
        name: '更新后的区服名',
      };

      const updatedServer = {
        ...existingServer,
        ...updateServerDto,
      };

      mockPrismaService.server.findUnique.mockResolvedValue(existingServer);
      mockPrismaService.server.update.mockResolvedValue(updatedServer);

      const result = await service.updateServer('1', updateServerDto);

      expect(result).toEqual(updatedServer);
    });

    it('应该抛出异常当区服不存在', async () => {
      mockPrismaService.server.findUnique.mockResolvedValue(null);

      await expect(service.updateServer('nonexistent', {})).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('removeServer', () => {
    it('应该软删除区服', async () => {
      const existingServer = {
        id: '1',
        name: '区服1',
        gameId: '1',
        deletedAt: null,
      };

      mockPrismaService.server.findUnique.mockResolvedValue(existingServer);
      mockPrismaService.server.update.mockResolvedValue({
        ...existingServer,
        deletedAt: new Date(),
      });

      const result = await service.removeServer('1');

      expect(result.deletedAt).toBeDefined();
    });
  });
});

