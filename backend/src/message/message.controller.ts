import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
  Query,
} from '@nestjs/common';
import { MessageService } from './message.service';
import { CreateMessageDto } from './dto/create-message.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';

@Controller('messages')
export class MessageController {
  constructor(private readonly messageService: MessageService) {}

  // 玩家端API - 发送消息
  @Public()
  @Post()
  createPlayerMessage(@Body() createMessageDto: CreateMessageDto) {
    return this.messageService.create(createMessageDto, 'PLAYER');
  }

  // 玩家端API - 获取会话消息
  @Public()
  @Get('session/:sessionId')
  findBySession(
    @Param('sessionId') sessionId: string,
    @Query('limit') limit?: string,
  ) {
    return this.messageService.findBySession(
      sessionId,
      limit ? parseInt(limit) : undefined,
    );
  }

  // 管理端API - 客服发送消息
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'AGENT')
  @Post('agent')
  createAgentMessage(
    @Body() createMessageDto: CreateMessageDto,
    @CurrentUser() user: any,
  ) {
    return this.messageService.create(createMessageDto, 'AGENT', user.id);
  }
}
