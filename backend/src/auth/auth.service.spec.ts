/**
 * 认证服务单元测试
 * 
 * 测试覆盖：
 * - 用户验证（管理员、客服、bcrypt密码）
 * - 登录功能
 * - Token验证
 */
import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';

// Mock bcrypt 模块以避免文件锁定问题
jest.mock('bcrypt', () => ({
  hash: jest.fn((password: string) => Promise.resolve(`hashed_${password}`)),
  compare: jest.fn((password: string, hash: string) => {
    // 简单的 mock 逻辑：如果 hash 以 hashed_ 开头，则验证成功
    return Promise.resolve(hash.startsWith('hashed_'));
  }),
}));

import * as bcrypt from 'bcrypt';

describe('AuthService', () => {
  // 测试中使用的服务实例
  let service: AuthService;
  let prismaService: PrismaService;
  let jwtService: JwtService;
  let configService: ConfigService;

  // Mock Prisma 服务（模拟数据库操作）
  const mockPrismaService = {
    user: {
      findUnique: jest.fn(), // Mock 查找用户方法
      update: jest.fn(),     // Mock 更新用户方法
    },
  };

  // Mock JWT 服务（模拟 Token 生成和验证）
  const mockJwtService = {
    sign: jest.fn(),   // Mock Token 签名方法
    verify: jest.fn(), // Mock Token 验证方法
  };

  // Mock 配置服务（模拟环境变量读取）
  const mockConfigService = {
    get: jest.fn(),
  };

  // 每个测试前执行：创建测试模块并获取服务实例
  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
        {
          provide: JwtService,
          useValue: mockJwtService,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    prismaService = module.get<PrismaService>(PrismaService);
    jwtService = module.get<JwtService>(JwtService);
    configService = module.get<ConfigService>(ConfigService);
  });

  // 每个测试后执行：清理所有 Mock 调用记录
  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('validateUser', () => {
    it('应该成功验证管理员用户', async () => {
      const mockUser = {
        id: '1',
        username: 'admin',
        password: 'admin123',
        role: 'ADMIN',
        deletedAt: null,
      };

      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);

      const result = await service.validateUser('admin', 'admin123');

      expect(result).toEqual({
        id: '1',
        username: 'admin',
        role: 'ADMIN',
        deletedAt: null,
      });
      expect(mockPrismaService.user.findUnique).toHaveBeenCalledWith({
        where: { username: 'admin' },
      });
    });

    it('应该成功验证客服用户', async () => {
      const mockUser = {
        id: '2',
        username: 'agent1',
        password: 'agent123',
        role: 'AGENT',
        deletedAt: null,
      };

      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);

      const result = await service.validateUser('agent1', 'agent123');

      expect(result).toEqual({
        id: '2',
        username: 'agent1',
        role: 'AGENT',
        deletedAt: null,
      });
    });

    it('应该成功验证使用bcrypt加密的密码', async () => {
      // 使用 bcrypt 格式的 hash（以 $2b$ 开头）
      const hashedPassword = '$2b$10$hashedpassword123';
      const mockUser = {
        id: '3',
        username: 'user1',
        password: hashedPassword,
        role: 'AGENT',
        deletedAt: null,
      };

      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);
      // Mock bcrypt.compare 返回 true
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      const result = await service.validateUser('user1', 'password123');

      expect(result).toBeDefined();
      expect(bcrypt.compare).toHaveBeenCalledWith('password123', hashedPassword);
    });

    it('应该抛出异常当用户不存在', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null);

      await expect(service.validateUser('nonexistent', 'password')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('应该抛出异常当用户已删除', async () => {
      const mockUser = {
        id: '1',
        username: 'admin',
        password: 'admin123',
        role: 'ADMIN',
        deletedAt: new Date(),
      };

      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);

      await expect(service.validateUser('admin', 'admin123')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('应该抛出异常当密码错误', async () => {
      const mockUser = {
        id: '1',
        username: 'admin',
        password: 'admin123',
        role: 'ADMIN',
        deletedAt: null,
      };

      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);

      await expect(service.validateUser('admin', 'wrongpassword')).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('login', () => {
    it('应该成功登录并返回token', async () => {
      const mockUser = {
        id: '1',
        username: 'admin',
        password: 'admin123',
        role: 'ADMIN',
        realName: '管理员',
        deletedAt: null,
      };

      const mockToken = 'mock-jwt-token';

      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);
      mockPrismaService.user.update.mockResolvedValue(mockUser);
      mockJwtService.sign.mockReturnValue(mockToken);
      mockConfigService.get.mockReturnValue('8h');

      const loginDto: LoginDto = {
        username: 'admin',
        password: 'admin123',
      };

      const result = await service.login(loginDto);

      expect(result).toEqual({
        accessToken: mockToken,
        user: {
          id: '1',
          username: 'admin',
          role: 'ADMIN',
          realName: '管理员',
        },
      });
      expect(mockJwtService.sign).toHaveBeenCalledWith(
        { username: 'admin', sub: '1', role: 'ADMIN' },
        { expiresIn: '8h' },
      );
      expect(mockPrismaService.user.update).toHaveBeenCalledWith({
        where: { id: '1' },
        data: { lastLoginAt: expect.any(Date) },
      });
    });
  });

  describe('validateToken', () => {
    it('应该成功验证有效token', async () => {
      const mockPayload = { username: 'admin', sub: '1', role: 'ADMIN' };
      mockJwtService.verify.mockReturnValue(mockPayload);

      const result = await service.validateToken('valid-token');

      expect(result).toEqual(mockPayload);
      expect(mockJwtService.verify).toHaveBeenCalledWith('valid-token');
    });

    it('应该抛出异常当token无效', async () => {
      mockJwtService.verify.mockImplementation(() => {
        throw new Error('Invalid token');
      });

      await expect(service.validateToken('invalid-token')).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });
});

