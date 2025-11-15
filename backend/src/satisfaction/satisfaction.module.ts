import { Module } from '@nestjs/common';
import { SatisfactionService } from './satisfaction.service';
import { SatisfactionController } from './satisfaction.controller';
import { PrismaService } from '../prisma/prisma.service';

@Module({
  controllers: [SatisfactionController],
  providers: [SatisfactionService, PrismaService],
  exports: [SatisfactionService],
})
export class SatisfactionModule {}

