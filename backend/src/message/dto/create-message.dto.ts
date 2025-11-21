import { IsString, IsNotEmpty, IsOptional, IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export enum MessageType {
  TEXT = 'TEXT',
  IMAGE = 'IMAGE',
  SYSTEM_NOTICE = 'SYSTEM_NOTICE',
  QUICK_OPTION = 'QUICK_OPTION',
}

export class CreateMessageDto {
  @ApiProperty({ description: '会话ID', example: 'session-123' })
  @IsString()
  @IsNotEmpty()
  sessionId: string;

  @ApiProperty({ description: '消息内容', example: '你好，我需要帮助' })
  @IsString()
  @IsNotEmpty()
  content: string;

  @ApiProperty({
    description: '消息类型',
    enum: MessageType,
    example: MessageType.TEXT,
    required: false,
    default: MessageType.TEXT,
  })
  @IsEnum(MessageType)
  @IsOptional()
  messageType?: MessageType = MessageType.TEXT;
}
