import { Module } from '@nestjs/common';
import { TicketService } from './ticket.service';
import { TicketController } from './ticket.controller';
import { PrismaService } from '../prisma/prisma.service';

@Module({
  controllers: [TicketController],
  providers: [TicketService, PrismaService],
  exports: [TicketService],
})
export class TicketModule {}

