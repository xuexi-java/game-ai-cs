import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SignBaseDto } from './sign.dto';

/**
 * 图片上传请求DTO
 * 继承签名验证字段，文件通过 multipart/form-data 上传
 */
export class PlayerUploadDto extends SignBaseDto {
  // 签名字段继承自 SignBaseDto，文件通过 multipart/form-data 上传
}

/**
 * 图片上传响应
 */
export class PlayerUploadResponse {
  @ApiProperty({ description: '是否成功' })
  result: boolean;

  @ApiPropertyOptional({ description: '文件URL' })
  url?: string;

  @ApiPropertyOptional({ description: '错误信息' })
  error?: string;

  @ApiPropertyOptional({ description: '错误码' })
  errorCode?: string;
}

/**
 * 上传错误码
 */
export enum UploadErrorCode {
  NO_FILE = 'NO_FILE',
  INVALID_TYPE = 'INVALID_TYPE',
  FILE_TOO_LARGE = 'FILE_TOO_LARGE',
  UPLOAD_FAILED = 'UPLOAD_FAILED',
  INVALID_TOKEN = 'INVALID_TOKEN',
  EXPIRED_TOKEN = 'EXPIRED_TOKEN',
}

/**
 * 上传错误消息
 */
export const UploadErrorMessages: Record<UploadErrorCode, string> = {
  [UploadErrorCode.NO_FILE]: '请上传文件',
  [UploadErrorCode.INVALID_TYPE]: '不支持的文件类型',
  [UploadErrorCode.FILE_TOO_LARGE]: '文件大小超过限制',
  [UploadErrorCode.UPLOAD_FAILED]: '文件上传失败',
  [UploadErrorCode.INVALID_TOKEN]: 'uploadToken无效',
  [UploadErrorCode.EXPIRED_TOKEN]: 'uploadToken已过期',
};
