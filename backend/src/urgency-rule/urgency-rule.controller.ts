import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
} from '@nestjs/common';
import { UrgencyRuleService } from './urgency-rule.service';
import {
  CreateUrgencyRuleDto,
  UpdateUrgencyRuleDto,
} from './dto/create-urgency-rule.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';

@Controller('urgency-rules')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class UrgencyRuleController {
  constructor(private readonly urgencyRuleService: UrgencyRuleService) {}

  @Get()
  findAll() {
    return this.urgencyRuleService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.urgencyRuleService.findOne(id);
  }

  @Post()
  create(@Body() createUrgencyRuleDto: CreateUrgencyRuleDto) {
    return this.urgencyRuleService.create(createUrgencyRuleDto);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updateUrgencyRuleDto: UpdateUrgencyRuleDto,
  ) {
    return this.urgencyRuleService.update(id, updateUrgencyRuleDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.urgencyRuleService.remove(id);
  }

  @Post('recalculate-queue')
  recalculateQueue() {
    return this.urgencyRuleService.recalculateQueue();
  }
}

