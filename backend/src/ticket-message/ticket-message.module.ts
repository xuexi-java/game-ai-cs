import { Module } from '@nestjs/common';
import { TicketMessageService } from './ticket-message.service';
import { TicketMessageController } from './ticket-message.controller';
import { PrismaService } from '../prisma/prisma.service';

@Module({
  controllers: [TicketMessageController],
  providers: [TicketMessageService, PrismaService],
  exports: [TicketMessageService],
})
export class TicketMessageModule {}

