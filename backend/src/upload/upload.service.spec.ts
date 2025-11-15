/**
 * 文件上传服务单元测试
 * 
 * 测试覆盖：
 * - 本地文件存储
 * - 阿里云 OSS 存储
 * - 文件类型验证
 * - 文件大小验证
 * - 文件删除
 */
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { BadRequestException } from '@nestjs/common';
import { UploadService } from './upload.service';
import * as fs from 'fs';
import * as path from 'path';

// Mock fs 模块
jest.mock('fs');
const mockedFs = fs as jest.Mocked<typeof fs>;

// Mock ali-oss 模块（创建虚拟 mock，不依赖实际包）
const mockPut = jest.fn();
const mockDelete = jest.fn();
const mockOSSClient = {
  put: mockPut,
  delete: mockDelete,
};

jest.mock('ali-oss', () => {
  const MockOSS = jest.fn().mockImplementation(() => mockOSSClient);
  return {
    __esModule: true,
    default: MockOSS,
  };
}, { virtual: true });

describe('UploadService', () => {
  let service: UploadService;
  let configService: ConfigService;

  const mockConfigService = {
    get: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    // 默认配置：使用本地存储
    mockConfigService.get.mockImplementation((key: string) => {
      const config: Record<string, any> = {
        UPLOAD_DIR: './uploads',
        MAX_FILE_SIZE: 10485760, // 10MB
      };
      return config[key];
    });
  });

  describe('本地存储模式', () => {
    beforeEach(async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          UploadService,
          {
            provide: ConfigService,
            useValue: mockConfigService,
          },
        ],
      }).compile();

      service = module.get<UploadService>(UploadService);
      configService = module.get<ConfigService>(ConfigService);
    });

    it('应该成功保存文件到本地', async () => {
      const mockFile = {
        originalname: 'test.jpg',
        mimetype: 'image/jpeg',
        size: 1024,
        buffer: Buffer.from('test file content'),
      };

      mockedFs.existsSync.mockReturnValue(false);
      mockedFs.mkdirSync.mockImplementation(() => undefined);
      mockedFs.writeFileSync.mockImplementation(() => undefined);

      const result = await service.saveFile(mockFile, 'ticket-123');

      expect(result).toHaveProperty('fileUrl');
      expect(result).toHaveProperty('fileName', 'test.jpg');
      expect(result).toHaveProperty('fileType', 'image/jpeg');
      expect(result).toHaveProperty('fileSize', 1024);
      expect(result.fileUrl).toContain('/uploads/ticket-123/');
      expect(mockedFs.writeFileSync).toHaveBeenCalled();
    });

    it('应该抛出异常当文件类型不支持', async () => {
      const mockFile = {
        originalname: 'test.pdf',
        mimetype: 'application/pdf',
        size: 1024,
        buffer: Buffer.from('test'),
      };

      await expect(service.saveFile(mockFile, 'ticket-123')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('应该抛出异常当文件大小超过限制', async () => {
      const mockFile = {
        originalname: 'test.jpg',
        mimetype: 'image/jpeg',
        size: 10485761, // 超过 10MB
        buffer: Buffer.from('test'),
      };

      await expect(service.saveFile(mockFile, 'ticket-123')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('应该支持 PNG 文件', async () => {
      const mockFile = {
        originalname: 'test.png',
        mimetype: 'image/png',
        size: 1024,
        buffer: Buffer.from('test'),
      };

      mockedFs.existsSync.mockReturnValue(false);
      mockedFs.mkdirSync.mockImplementation(() => undefined);
      mockedFs.writeFileSync.mockImplementation(() => undefined);

      const result = await service.saveFile(mockFile, 'ticket-123');

      expect(result.fileType).toBe('image/png');
    });

    it('应该支持 GIF 文件', async () => {
      const mockFile = {
        originalname: 'test.gif',
        mimetype: 'image/gif',
        size: 1024,
        buffer: Buffer.from('test'),
      };

      mockedFs.existsSync.mockReturnValue(false);
      mockedFs.mkdirSync.mockImplementation(() => undefined);
      mockedFs.writeFileSync.mockImplementation(() => undefined);

      const result = await service.saveFile(mockFile, 'ticket-123');

      expect(result.fileType).toBe('image/gif');
    });

    it('应该成功删除本地文件', async () => {
      const fileUrl = '/uploads/ticket-123/test.jpg';
      mockedFs.existsSync.mockReturnValue(true);
      mockedFs.unlinkSync.mockImplementation(() => undefined);

      await service.deleteFile(fileUrl);

      expect(mockedFs.unlinkSync).toHaveBeenCalled();
    });

    it('应该处理删除不存在的文件', async () => {
      const fileUrl = '/uploads/ticket-123/nonexistent.jpg';
      mockedFs.existsSync.mockReturnValue(false);

      await service.deleteFile(fileUrl);

      expect(mockedFs.unlinkSync).not.toHaveBeenCalled();
    });
  });

  describe('OSS 存储模式', () => {
    beforeEach(async () => {
      // 重置 mock
      mockPut.mockClear();
      mockDelete.mockClear();

      // 配置 OSS 环境变量
      mockConfigService.get.mockImplementation((key: string) => {
        const config: Record<string, any> = {
          UPLOAD_DIR: './uploads',
          MAX_FILE_SIZE: 10485760,
          OSS_ACCESS_KEY_ID: 'test-access-key-id',
          OSS_ACCESS_KEY_SECRET: 'test-access-key-secret',
          OSS_BUCKET: 'test-bucket',
          OSS_REGION: 'oss-cn-shenzhen',
          OSS_ENDPOINT: 'oss-cn-shenzhen.aliyuncs.com',
        };
        return config[key];
      });

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          UploadService,
          {
            provide: ConfigService,
            useValue: mockConfigService,
          },
        ],
      }).compile();

      service = module.get<UploadService>(UploadService);
      configService = module.get<ConfigService>(ConfigService);
    });

    it('应该成功上传文件到 OSS', async () => {
      const mockFile = {
        originalname: 'test.jpg',
        mimetype: 'image/jpeg',
        size: 1024,
        buffer: Buffer.from('test file content'),
      };

      const mockOSSResult = {
        url: 'https://test-bucket.oss-cn-shenzhen.aliyuncs.com/tickets/ticket-123/test-uuid.jpg',
      };

      mockPut.mockResolvedValue(mockOSSResult);

      const result = await service.saveFile(mockFile, 'ticket-123');

      expect(result).toHaveProperty('fileUrl', mockOSSResult.url);
      expect(result).toHaveProperty('fileName', 'test.jpg');
      expect(result).toHaveProperty('fileType', 'image/jpeg');
      expect(result).toHaveProperty('fileSize', 1024);
      expect(mockPut).toHaveBeenCalledWith(
        expect.stringContaining('tickets/ticket-123/'),
        mockFile.buffer,
        { mime: 'image/jpeg' },
      );
    });

    it('应该抛出异常当 OSS 上传失败', async () => {
      const mockFile = {
        originalname: 'test.jpg',
        mimetype: 'image/jpeg',
        size: 1024,
        buffer: Buffer.from('test'),
      };

      mockPut.mockRejectedValue(new Error('OSS upload failed'));

      await expect(service.saveFile(mockFile, 'ticket-123')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('应该成功从 OSS 删除文件', async () => {
      const fileUrl =
        'https://test-bucket.oss-cn-shenzhen.aliyuncs.com/tickets/ticket-123/test.jpg';
      mockDelete.mockResolvedValue({});

      await service.deleteFile(fileUrl);

      expect(mockDelete).toHaveBeenCalledWith(
        'tickets/ticket-123/test.jpg',
      );
    });

    it('应该处理 OSS 删除失败但不抛出异常', async () => {
      const fileUrl =
        'https://test-bucket.oss-cn-shenzhen.aliyuncs.com/tickets/ticket-123/test.jpg';
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      mockDelete.mockRejectedValue(new Error('Delete failed'));

      await service.deleteFile(fileUrl);

      expect(consoleSpy).toHaveBeenCalledWith(
        '删除 OSS 文件失败:',
        expect.any(Error),
      );
      consoleSpy.mockRestore();
    });
  });

  describe('配置选项', () => {
    it('应该使用自定义上传目录', async () => {
      mockConfigService.get.mockImplementation((key: string) => {
        if (key === 'UPLOAD_DIR') return './custom-uploads';
        if (key === 'MAX_FILE_SIZE') return 10485760;
        return undefined;
      });

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          UploadService,
          {
            provide: ConfigService,
            useValue: mockConfigService,
          },
        ],
      }).compile();

      service = module.get<UploadService>(UploadService);

      const mockFile = {
        originalname: 'test.jpg',
        mimetype: 'image/jpeg',
        size: 1024,
        buffer: Buffer.from('test'),
      };

      mockedFs.existsSync.mockReturnValue(false);
      mockedFs.mkdirSync.mockImplementation(() => undefined);
      mockedFs.writeFileSync.mockImplementation(() => undefined);

      await service.saveFile(mockFile, 'ticket-123');

      expect(mockedFs.mkdirSync).toHaveBeenCalledWith(
        expect.stringContaining('custom-uploads'),
        { recursive: true },
      );
    });

    it('应该使用自定义文件大小限制', async () => {
      mockConfigService.get.mockImplementation((key: string) => {
        if (key === 'UPLOAD_DIR') return './uploads';
        if (key === 'MAX_FILE_SIZE') return 5242880; // 5MB
        return undefined;
      });

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          UploadService,
          {
            provide: ConfigService,
            useValue: mockConfigService,
          },
        ],
      }).compile();

      service = module.get<UploadService>(UploadService);

      const mockFile = {
        originalname: 'test.jpg',
        mimetype: 'image/jpeg',
        size: 5242881, // 超过 5MB
        buffer: Buffer.from('test'),
      };

      await expect(service.saveFile(mockFile, 'ticket-123')).rejects.toThrow(
        BadRequestException,
      );
    });
  });
});

