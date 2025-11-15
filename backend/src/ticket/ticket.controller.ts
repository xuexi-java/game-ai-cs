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
import { TicketService } from './ticket.service';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { PaginationDto } from '../common/dto/pagination.dto';

@Controller('tickets')
export class TicketController {
  constructor(private readonly ticketService: TicketService) {}

  // 玩家端API - 检查未关闭工单
  @Post('check-open')
  checkOpenTicket(
    @Body() body: { gameId: string; serverId?: string; playerIdOrName: string },
  ) {
    return this.ticketService.checkOpenTicket(
      body.gameId,
      body.serverId || null,
      body.playerIdOrName,
    );
  }

  // 玩家端API - 创建工单
  @Post()
  create(@Body() createTicketDto: CreateTicketDto) {
    return this.ticketService.create(createTicketDto);
  }

  // 玩家端API - 根据token获取工单
  @Get('by-token/:token')
  findByToken(@Param('token') token: string) {
    return this.ticketService.findByToken(token);
  }

  // 管理端API - 获取工单列表
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'AGENT')
  @Get()
  findAll(@Query() query: any) {
    return this.ticketService.findAll({
      status: query.status,
      priority: query.priority,
      gameId: query.gameId,
      page: query.page ? parseInt(query.page) : 1,
      pageSize: query.pageSize ? parseInt(query.pageSize) : 10,
      sortBy: query.sortBy || 'createdAt',
      sortOrder: query.sortOrder || 'desc',
    });
  }

  // 管理端API - 获取工单详情
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'AGENT')
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.ticketService.findOne(id);
  }

  // 管理端API - 更新工单状态
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'AGENT')
  @Patch(':id/status')
  updateStatus(@Param('id') id: string, @Body() body: { status: string }) {
    return this.ticketService.updateStatus(id, body.status);
  }

  // 管理端API - 更新工单优先级
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'AGENT')
  @Patch(':id/priority')
  updatePriority(@Param('id') id: string, @Body() body: { priority: string }) {
    return this.ticketService.updatePriority(id, body.priority);
  }
}

