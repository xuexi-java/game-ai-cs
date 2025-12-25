import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

@Injectable()
export class EncryptionService {
  private readonly algorithm = 'aes-256-gcm';
  private readonly keyLength = 32;
  private readonly ivLength = 16;
  private readonly key: Buffer;

  constructor(private configService: ConfigService) {
    // 从环境变量获取加密密钥，如果没有则使用默认密钥（生产环境必须设置）
    const secretKey =
      this.configService.get<string>('ENCRYPTION_SECRET_KEY') ||
      'default-secret-key-change-in-production-32-chars!!';

    // 使用 PBKDF2 派生密钥
    this.key = crypto.pbkdf2Sync(
      secretKey,
      'game-ai-encryption-salt',
      100000,
      this.keyLength,
      'sha256',
    );
  }

  /**
   * 加密敏感数据
   */
  encrypt(text: string): string {
    if (!text) {
      return text;
    }

    try {
      const iv = crypto.randomBytes(this.ivLength);
      const cipher = crypto.createCipheriv(this.algorithm, this.key, iv);

      let encrypted = cipher.update(text, 'utf8', 'hex');
      encrypted += cipher.final('hex');

      const tag = cipher.getAuthTag();

      // 格式: iv:tag:encrypted
      return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted}`;
    } catch (error) {
      console.error('[Encryption] 加密失败:', error);
      throw new Error('数据加密失败');
    }
  }

  /**
   * 解密敏感数据
   */
  decrypt(encryptedText: string): string {
    if (!encryptedText) {
      return encryptedText;
    }

    // 检查是否是加密格式（包含冒号分隔符）
    if (!encryptedText.includes(':')) {
      // 如果不是加密格式，可能是旧数据，直接返回（向后兼容）
      console.warn('[Encryption] 检测到未加密数据，建议重新加密');
      return encryptedText;
    }

    try {
      const parts = encryptedText.split(':');
      if (parts.length !== 3) {
        throw new Error('无效的加密格式');
      }

      const iv = Buffer.from(parts[0], 'hex');
      const tag = Buffer.from(parts[1], 'hex');
      const encrypted = parts[2];

      const decipher = crypto.createDecipheriv(this.algorithm, this.key, iv);
      decipher.setAuthTag(tag);

      let decrypted = decipher.update(encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');

      return decrypted;
    } catch (error) {
      console.error('[Encryption] 解密失败:', error);
      // 如果解密失败，可能是旧数据，尝试直接返回（向后兼容）
      if (error.message.includes('无效的加密格式')) {
        throw error;
      }
      console.warn('[Encryption] 解密失败，返回原始值（向后兼容）');
      return encryptedText;
    }
  }

  /**
   * 检查字符串是否是加密格式
   */
  isEncrypted(text: string): boolean {
    if (!text || !text.includes(':')) {
      return false;
    }
    const parts = text.split(':');
    return (
      parts.length === 3 && parts.every((part) => /^[0-9a-f]+$/i.test(part))
    );
  }
}
