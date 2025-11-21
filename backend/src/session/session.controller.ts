import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Patch,
  UseGuards,
  Query,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
  ApiBody,
} from '@nestjs/swagger';
import { SessionService } from './session.service';
import { CreateSessionDto, TransferToAgentDto } from './dto/create-session.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';

@ApiTags('sessions')
@Controller('sessions')
export class SessionController {
  constructor(private readonly sessionService: SessionService) {}

  // 玩家端API - 创建会话
  @Public()
  @Post()
  @ApiOperation({ summary: '创建会话（玩家端）' })
  @ApiResponse({ status: 201, description: '创建成功' })
  create(@Body() createSessionDto: CreateSessionDto) {
    return this.sessionService.create(createSessionDto);
  }

  // 玩家端API - 发送消息并触发AI回复
  @Public()
  @Post(':id/messages')
  @ApiOperation({ summary: '发送消息并触发AI回复（玩家端）' })
  @ApiParam({ name: 'id', description: '会话ID' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        content: { type: 'string' },
        messageType: { type: 'string', enum: ['TEXT', 'IMAGE'] },
      },
      required: ['content'],
    },
  })
  @ApiResponse({ status: 200, description: '发送成功' })
  sendPlayerMessage(
    @Param('id') id: string,
    @Body()
    body: {
      content: string;
      messageType?: 'TEXT' | 'IMAGE';
    },
  ) {
    return this.sessionService.handlePlayerMessage(
      id,
      body.content,
      body.messageType ? (body.messageType as any) : undefined,
    );
  }

  // 玩家端API - 获取会话详情
  @Public()
  @Get(':id')
  @ApiOperation({ summary: '获取会话详情（玩家端）' })
  @ApiParam({ name: 'id', description: '会话ID' })
  @ApiResponse({ status: 200, description: '返回会话信息' })
  findOne(@Param('id') id: string) {
    return this.sessionService.findOne(id);
  }

  // 玩家端API - 转人工
  @Public()
  @Post(':id/transfer-to-agent')
  @ApiOperation({ summary: '转人工客服（玩家端）' })
  @ApiParam({ name: 'id', description: '会话ID' })
  @ApiBody({ type: TransferToAgentDto })
  @ApiResponse({ status: 200, description: '转接成功' })
  transferToAgent(
    @Param('id') id: string,
    @Body() transferDto: TransferToAgentDto,
  ) {
    return this.sessionService.transferToAgent(id, transferDto);
  }

  // 管理端API - 获取待接入会话列表
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'AGENT')
  @Get('workbench/queued')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: '获取待接入会话列表（管理端）' })
  @ApiResponse({ status: 200, description: '返回待接入会话列表' })
  findQueuedSessions(@CurrentUser() user: any) {
    return this.sessionService.findQueuedSessions(user);
  }

  // 管理端API - 会话列表（支持管理员查看全部，客服仅查看自己的会话）
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'AGENT')
  @Get()
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: '获取会话列表（管理端）' })
  @ApiQuery({ name: 'status', required: false, description: '会话状态' })
  @ApiQuery({ name: 'agentId', required: false, description: '客服ID' })
  @ApiQuery({ name: 'gameId', required: false, description: '游戏ID' })
  @ApiQuery({ name: 'search', required: false, description: '搜索关键词' })
  @ApiQuery({ name: 'transferredToAgent', required: false, type: Boolean })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'pageSize', required: false, type: Number })
  @ApiResponse({ status: 200, description: '返回会话列表' })
  findAll(@Query() query: any, @CurrentUser() user: any) {
    return this.sessionService.findAll(
      {
        status: query.status,
        agentId: query.agentId,
        gameId: query.gameId,
        search: query.search,
        transferredToAgent:
          query.transferredToAgent !== undefined
            ? query.transferredToAgent === 'true'
            : undefined,
        page: query.page ? parseInt(query.page) : 1,
        pageSize: query.pageSize ? parseInt(query.pageSize) : 10,
        sortBy: query.sortBy || 'createdAt',
        sortOrder: query.sortOrder || 'desc',
      },
      user,
    );
  }

  // 管理端API - 客服接入会话
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'AGENT')
  @Post(':id/join')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: '客服接入会话（管理端）' })
  @ApiParam({ name: 'id', description: '会话ID' })
  @ApiResponse({ status: 200, description: '接入成功' })
  joinSession(@Param('id') id: string, @CurrentUser() user: any) {
    return this.sessionService.joinSession(id, user.id);
  }

  // 管理端API - 结束会话
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'AGENT')
  @Patch(':id/close')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: '结束会话（管理端）' })
  @ApiParam({ name: 'id', description: '会话ID' })
  @ApiResponse({ status: 200, description: '结束成功' })
  closeSession(@Param('id') id: string) {
    return this.sessionService.closeSession(id);
  }

  // 玩家端API - 结束聊天
  @Public()
  @Patch(':id/close-player')
  @ApiOperation({ summary: '结束聊天（玩家端）' })
  @ApiParam({ name: 'id', description: '会话ID' })
  @ApiResponse({ status: 200, description: '结束成功' })
  closeByPlayer(@Param('id') id: string) {
    return this.sessionService.closeByPlayer(id);
  }

  // 管理端API - 管理员手动分配会话给指定客服
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @Post(':id/assign')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: '管理员手动分配会话给指定客服' })
  @ApiParam({ name: 'id', description: '会话ID' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        agentId: { type: 'string', description: '客服ID' },
      },
      required: ['agentId'],
    },
  })
  @ApiResponse({ status: 200, description: '分配成功' })
  assignSession(
    @Param('id') id: string,
    @Body() body: { agentId: string },
  ) {
    return this.sessionService.assignSession(id, body.agentId);
  }

  // 管理端API - 自动分配会话（根据客服当前接待数量）
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'AGENT')
  @Post(':id/auto-assign')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: '自动分配会话（根据客服当前接待数量）' })
  @ApiParam({ name: 'id', description: '会话ID' })
  @ApiResponse({ status: 200, description: '自动分配成功' })
  autoAssignSession(@Param('id') id: string) {
    return this.sessionService.autoAssignSession(id);
  }
}
