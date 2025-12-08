import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateGameDto, UpdateGameDto } from './dto/create-game.dto';
import { CreateServerDto, UpdateServerDto } from './dto/create-server.dto';
import { EncryptionService } from '../common/encryption/encryption.service';

@Injectable()
export class GameService {
  constructor(
    private prisma: PrismaService,
    private encryptionService: EncryptionService,
  ) {}

  // 游戏管理
  async findAll() {
    return this.prisma.game.findMany({
      where: { deletedAt: null },
      include: {
        servers: {
          where: { deletedAt: null },
          orderBy: { name: 'asc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const game = await this.prisma.game.findUnique({
      where: { id, deletedAt: null },
      include: {
        servers: {
          where: { deletedAt: null },
        },
      },
    });

    if (!game) {
      throw new NotFoundException('游戏不存在');
    }

    return game;
  }

  async findEnabled() {
    return this.prisma.game.findMany({
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
  }

  async create(createGameDto: CreateGameDto) {
    // 加密 API Key
    const encryptedApiKey = this.encryptionService.encrypt(createGameDto.difyApiKey);
    
    return this.prisma.game.create({
      data: {
        ...createGameDto,
        difyApiKey: encryptedApiKey,
      },
      include: {
        servers: true,
      },
    });
  }

  async update(id: string, updateGameDto: UpdateGameDto) {
    await this.findOne(id);
    
    // 如果更新了 API Key，需要加密
    const updateData: any = { ...updateGameDto };
    if (updateGameDto.difyApiKey) {
      updateData.difyApiKey = this.encryptionService.encrypt(updateGameDto.difyApiKey);
    }
    
    return this.prisma.game.update({
      where: { id },
      data: updateData,
      include: {
        servers: true,
      },
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.game.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  // 区服管理
  async findServersByGame(gameId: string) {
    await this.findOne(gameId);
    return this.prisma.server.findMany({
      where: {
        gameId,
        deletedAt: null,
      },
      orderBy: { name: 'asc' },
    });
  }

  async createServer(createServerDto: CreateServerDto) {
    await this.findOne(createServerDto.gameId);
    return this.prisma.server.create({
      data: createServerDto,
    });
  }

  async updateServer(id: string, updateServerDto: UpdateServerDto) {
    const server = await this.prisma.server.findUnique({
      where: { id, deletedAt: null },
    });

    if (!server) {
      throw new NotFoundException('区服不存在');
    }

    return this.prisma.server.update({
      where: { id },
      data: updateServerDto,
    });
  }

  async removeServer(id: string) {
    const server = await this.prisma.server.findUnique({
      where: { id, deletedAt: null },
    });

    if (!server) {
      throw new NotFoundException('区服不存在');
    }

    return this.prisma.server.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }
}
