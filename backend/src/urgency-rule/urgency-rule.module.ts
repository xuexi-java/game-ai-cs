import { Module } from '@nestjs/common';
import { UrgencyRuleService } from './urgency-rule.service';
import { UrgencyRuleController } from './urgency-rule.controller';
import { PrismaService } from '../prisma/prisma.service';

@Module({
  controllers: [UrgencyRuleController],
  providers: [UrgencyRuleService, PrismaService],
  exports: [UrgencyRuleService],
})
export class UrgencyRuleModule {}

