import { Controller, Get, Post, Body, Param, UseGuards } from '@nestjs/common';
import { TicketMessageService } from './ticket-message.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@Controller('ticket-messages')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN', 'AGENT')
export class TicketMessageController {
  constructor(private readonly ticketMessageService: TicketMessageService) {}

  // 回复工单
  @Post(':ticketId/reply')
  create(
    @Param('ticketId') ticketId: string,
    @Body() body: { content: string },
    @CurrentUser() user: any,
  ) {
    return this.ticketMessageService.create(ticketId, user.id, body.content);
  }

  // 获取工单消息列表
  @Get(':ticketId')
  findByTicket(@Param('ticketId') ticketId: string) {
    return this.ticketMessageService.findByTicket(ticketId);
  }
}

