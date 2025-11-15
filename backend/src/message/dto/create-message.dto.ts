import { IsString, IsNotEmpty, IsOptional, IsEnum } from 'class-validator';

export enum MessageType {
  TEXT = 'TEXT',
  IMAGE = 'IMAGE',
  SYSTEM_NOTICE = 'SYSTEM_NOTICE',
  QUICK_OPTION = 'QUICK_OPTION',
}

export class CreateMessageDto {
  @IsString()
  @IsNotEmpty()
  sessionId: string;

  @IsString()
  @IsNotEmpty()
  content: string;

  @IsEnum(MessageType)
  @IsOptional()
  messageType?: MessageType = MessageType.TEXT;
}

