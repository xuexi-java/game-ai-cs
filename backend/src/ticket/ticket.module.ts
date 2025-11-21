import { Module, forwardRef } from '@nestjs/common';
import { TicketService } from './ticket.service';
import { TicketController } from './ticket.controller';
import { TicketPriorityService } from './ticket-priority.service';
import { PrismaService } from '../prisma/prisma.service';
import { IssueTypeModule } from '../issue-type/issue-type.module';
import { TicketMessageModule } from '../ticket-message/ticket-message.module';
import { WebsocketModule } from '../websocket/websocket.module';

@Module({
  imports: [
    IssueTypeModule,
    TicketMessageModule,
    forwardRef(() => WebsocketModule),
  ],
  controllers: [TicketController],
  providers: [TicketService, TicketPriorityService, PrismaService],
  exports: [TicketService],
})
export class TicketModule {}
