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
import { TicketService } from './ticket.service';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { PaginationDto } from '../common/dto/pagination.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';

@ApiTags('tickets')
@Controller('tickets')
export class TicketController {
  constructor(private readonly ticketService: TicketService) {}

  // 玩家端API - 检查未关闭工单
  @Public()
  @Post('check-open')
  @ApiOperation({ summary: '检查未关闭工单' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        gameId: { type: 'string' },
        serverId: { type: 'string' },
        serverName: { type: 'string' },
        playerIdOrName: { type: 'string' },
      },
      required: ['gameId', 'playerIdOrName'],
    },
  })
  @ApiResponse({ status: 200, description: '检查结果' })
  checkOpenTicket(
    @Body()
    body: {
      gameId: string;
      serverId?: string;
      serverName?: string;
      playerIdOrName: string;
    },
  ) {
    return this.ticketService.checkOpenTicket(
      body.gameId,
      body.serverId || null,
      body.serverName || null,
      body.playerIdOrName,
    );
  }

  // 玩家端API - 检查相同问题类型的未完成工单
  @Public()
  @Post('check-open-by-issue-type')
  @ApiOperation({ summary: '检查相同问题类型的未完成工单' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        gameId: { type: 'string' },
        serverId: { type: 'string' },
        playerIdOrName: { type: 'string' },
        issueTypeId: { type: 'string' },
      },
      required: ['gameId', 'playerIdOrName', 'issueTypeId'],
    },
  })
  @ApiResponse({ status: 200, description: '检查结果' })
  checkOpenTicketByIssueType(
    @Body()
    body: {
      gameId: string;
      serverId?: string; // 可选，可能是 serverId 或 serverName
      playerIdOrName: string;
      issueTypeId: string;
    },
  ) {
    return this.ticketService.checkOpenTicketByIssueType(
      body.gameId,
      body.serverId || null,
      body.playerIdOrName,
      body.issueTypeId,
    );
  }

  // 玩家端API - 创建工单
  @Public()
  @Post()
  @ApiOperation({ summary: '创建工单' })
  @ApiBody({ type: CreateTicketDto })
  @ApiResponse({ status: 201, description: '创建成功' })
  create(@Body() createTicketDto: CreateTicketDto) {
    return this.ticketService.create(createTicketDto);
  }

  // 玩家端API - 根据token获取工单
  @Public()
  @Get('by-token/:token')
  @ApiOperation({ summary: '根据token获取工单' })
  @ApiParam({ name: 'token', description: '工单token' })
  @ApiResponse({ status: 200, description: '返回工单信息' })
  findByToken(@Param('token') token: string) {
    return this.ticketService.findByToken(token);
  }

  // 玩家端API - 根据token获取工单消息列表
  @Public()
  @Get('by-token/:token/messages')
  @ApiOperation({ summary: '根据token获取工单消息列表' })
  @ApiParam({ name: 'token', description: '工单token' })
  @ApiResponse({ status: 200, description: '返回消息列表' })
  getMessagesByToken(@Param('token') token: string) {
    return this.ticketService.getMessagesByToken(token);
  }

  // 玩家端API - 根据token发送工单消息
  @Public()
  @Post('by-token/:token/messages')
  @ApiOperation({ summary: '根据token发送工单消息' })
  @ApiParam({ name: 'token', description: '工单token' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        content: { type: 'string' },
      },
      required: ['content'],
    },
  })
  @ApiResponse({ status: 201, description: '发送成功' })
  sendMessageByToken(
    @Param('token') token: string,
    @Body() body: { content: string },
  ) {
    return this.ticketService.sendMessageByToken(token, body.content);
  }

  // 管理端API - 获取工单列表
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'AGENT')
  @Get()
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: '获取工单列表（管理端）' })
  @ApiQuery({ name: 'status', required: false, description: '工单状态' })
  @ApiQuery({ name: 'priority', required: false, description: '优先级' })
  @ApiQuery({ name: 'issueTypeId', required: false, description: '问题类型ID' })
  @ApiQuery({ name: 'gameId', required: false, description: '游戏ID' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'pageSize', required: false, type: Number })
  @ApiResponse({ status: 200, description: '返回工单列表' })
  findAll(@Query() query: any, @CurrentUser() user: any) {
    return this.ticketService.findAll(
      {
        status: query.status,
        priority: query.priority,
        issueTypeId: query.issueTypeId,
        gameId: query.gameId,
        page: query.page ? parseInt(query.page) : 1,
        pageSize: query.pageSize ? parseInt(query.pageSize) : 10,
        sortBy: query.sortBy || 'createdAt',
        sortOrder: query.sortOrder || 'desc',
      },
      user,
    );
  }

  // 管理端API - 获取工单详情
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'AGENT')
  @Get(':id')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: '获取工单详情（管理端）' })
  @ApiParam({ name: 'id', description: '工单ID' })
  @ApiResponse({ status: 200, description: '返回工单详情' })
  @ApiResponse({ status: 404, description: '工单不存在' })
  findOne(@Param('id') id: string) {
    return this.ticketService.findOne(id);
  }

  // 管理端API - 更新工单状态
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'AGENT')
  @Patch(':id/status')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: '更新工单状态（管理端）' })
  @ApiParam({ name: 'id', description: '工单ID' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['NEW', 'IN_PROGRESS', 'WAITING', 'RESOLVED', 'CLOSED'] },
      },
      required: ['status'],
    },
  })
  @ApiResponse({ status: 200, description: '更新成功' })
  updateStatus(@Param('id') id: string, @Body() body: { status: string }) {
    return this.ticketService.updateStatus(id, body.status);
  }

  // 管理端API - 更新工单优先级
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'AGENT')
  @Patch(':id/priority')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: '更新工单优先级（管理端）' })
  @ApiParam({ name: 'id', description: '工单ID' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        priority: { type: 'string', enum: ['LOW', 'NORMAL', 'HIGH', 'URGENT'] },
      },
      required: ['priority'],
    },
  })
  @ApiResponse({ status: 200, description: '更新成功' })
  updatePriority(@Param('id') id: string, @Body() body: { priority: string }) {
    return this.ticketService.updatePriority(id, body.priority);
  }
}
