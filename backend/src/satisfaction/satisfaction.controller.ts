import { Controller, Get, Post, Body, Param, UseGuards, Query } from '@nestjs/common';
import { SatisfactionService } from './satisfaction.service';
import { CreateRatingDto } from './dto/create-rating.dto';
import { Public } from '../common/decorators/public.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';

@Controller('satisfaction')
export class SatisfactionController {
  constructor(private readonly satisfactionService: SatisfactionService) {}

  // 玩家端API - 提交满意度评价
  @Public()
  @Post()
  create(@Body() createRatingDto: CreateRatingDto) {
    return this.satisfactionService.create(createRatingDto);
  }

  // 玩家端API - 获取评价
  @Public()
  @Get('session/:sessionId')
  findBySession(@Param('sessionId') sessionId: string) {
    return this.satisfactionService.findBySession(sessionId);
  }

  // 管理端API - 获取客服评价统计
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'AGENT')
  @Get('agent/:agentId/stats')
  getAgentStats(
    @Param('agentId') agentId: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.satisfactionService.getAgentStats(
      agentId,
      startDate ? new Date(startDate) : undefined,
      endDate ? new Date(endDate) : undefined,
    );
  }
}

