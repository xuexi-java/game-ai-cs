import { Injectable, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import OSS from 'ali-oss';

@Injectable()
export class UploadService {
  private readonly uploadDir: string;
  private readonly useOSS: boolean;
  private ossClient: OSS | null = null;

  constructor(private configService: ConfigService) {
    this.uploadDir =
      this.configService.get<string>('UPLOAD_DIR') || './uploads';
    
    // 检查是否配置了 OSS
    const ossAccessKeyId = this.configService.get<string>('OSS_ACCESS_KEY_ID');
    const ossAccessKeySecret = this.configService.get<string>('OSS_ACCESS_KEY_SECRET');
    const ossBucket = this.configService.get<string>('OSS_BUCKET');
    const ossRegion = this.configService.get<string>('OSS_REGION');
    
    this.useOSS = !!(ossAccessKeyId && ossAccessKeySecret && ossBucket && ossRegion);
    
    // 如果使用 OSS，初始化 OSS 客户端
    if (this.useOSS) {
      this.ossClient = new OSS({
        accessKeyId: ossAccessKeyId,
        accessKeySecret: ossAccessKeySecret,
        bucket: ossBucket,
        region: ossRegion,
        endpoint: this.configService.get<string>('OSS_ENDPOINT') || undefined,
      });
    } else {
      // 使用本地存储，确保目录存在
      this.ensureUploadDirExists();
    }
  }

  private ensureUploadDirExists() {
    if (!fs.existsSync(this.uploadDir)) {
      fs.mkdirSync(this.uploadDir, { recursive: true });
    }
  }

  // 保存文件
  async saveFile(
    file: any,
    ticketId: string,
  ): Promise<{ fileUrl: string; fileName: string; fileType: string; fileSize: number }> {
    // 验证文件类型
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif'];
    if (!allowedTypes.includes(file.mimetype)) {
      throw new BadRequestException('不支持的文件类型，仅支持 JPG、PNG、GIF');
    }

    // 验证文件大小（10MB）
    const maxSize = this.configService.get<number>('MAX_FILE_SIZE') || 10485760;
    if (file.size > maxSize) {
      throw new BadRequestException('文件大小超过限制（10MB）');
    }

    // 生成唯一文件名
    const fileExt = path.extname(file.originalname);
    const fileName = `${uuidv4()}${fileExt}`;
    const objectKey = `tickets/${ticketId}/${fileName}`;

    if (this.useOSS && this.ossClient) {
      // 上传到 OSS
      try {
        const result = await this.ossClient.put(objectKey, file.buffer, {
          mime: file.mimetype,
        });

        // 返回 OSS 文件 URL
        const fileUrl = result.url;
        return {
          fileUrl,
          fileName: file.originalname,
          fileType: file.mimetype,
          fileSize: file.size,
        };
      } catch (error) {
        throw new BadRequestException(`文件上传失败: ${error.message}`);
      }
    } else {
      // 使用本地存储
      const filePath = path.join(this.uploadDir, ticketId, fileName);

      // 确保目录存在
      const ticketDir = path.join(this.uploadDir, ticketId);
      if (!fs.existsSync(ticketDir)) {
        fs.mkdirSync(ticketDir, { recursive: true });
      }

      // 保存文件
      fs.writeFileSync(filePath, file.buffer);

      // 返回文件信息
      const fileUrl = `/uploads/${ticketId}/${fileName}`;
      return {
        fileUrl,
        fileName: file.originalname,
        fileType: file.mimetype,
        fileSize: file.size,
      };
    }
  }

  // 删除文件
  async deleteFile(fileUrl: string): Promise<void> {
    if (this.useOSS && this.ossClient) {
      // 从 OSS 删除文件
      try {
        // 从 URL 中提取 object key
        // 例如: https://game-ai-cs.oss-cn-shenzhen.aliyuncs.com/tickets/xxx/xxx.jpg
        const url = new URL(fileUrl);
        const objectKey = url.pathname.substring(1); // 移除开头的 /
        await this.ossClient.delete(objectKey);
      } catch (error) {
        console.error('删除 OSS 文件失败:', error);
        // 不抛出异常，允许继续执行
      }
    } else {
      // 从本地删除文件
      const filePath = path.join(this.uploadDir, fileUrl.replace('/uploads/', ''));
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }
  }
}
