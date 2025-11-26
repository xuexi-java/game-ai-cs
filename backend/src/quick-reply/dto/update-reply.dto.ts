import { PartialType } from '@nestjs/mapped-types';
import { CreateReplyDto } from './create-reply.dto';
import { IsBoolean, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateReplyDto extends PartialType(CreateReplyDto) {
  @ApiProperty({ example: true, description: '是否启用', required: false })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
