import { Controller, Get, Post, Body, Param, UseGuards } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiBody,
} from '@nestjs/swagger';
import { TicketMessageService } from './ticket-message.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('ticket-messages')
@ApiBearerAuth('JWT-auth')
@Controller('ticket-messages')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN', 'AGENT')
export class TicketMessageController {
  constructor(private readonly ticketMessageService: TicketMessageService) {}

  // 回复工单
  @Post(':ticketId/reply')
  @ApiOperation({ summary: '回复工单' })
  @ApiParam({ name: 'ticketId', description: '工单ID' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        content: { type: 'string' },
      },
      required: ['content'],
    },
  })
  @ApiResponse({ status: 201, description: '回复成功' })
  create(
    @Param('ticketId') ticketId: string,
    @Body() body: { content: string },
    @CurrentUser() user: any,
  ) {
    return this.ticketMessageService.create(ticketId, user.id, body.content);
  }

  // 获取工单消息列表
  @Get(':ticketId')
  @ApiOperation({ summary: '获取工单消息列表' })
  @ApiParam({ name: 'ticketId', description: '工单ID' })
  @ApiResponse({ status: 200, description: '返回消息列表' })
  findByTicket(@Param('ticketId') ticketId: string) {
    return this.ticketMessageService.findByTicket(ticketId);
  }
}
