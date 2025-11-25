import { Module, forwardRef } from '@nestjs/common';
import { TicketService } from './ticket.service';
import { TicketController } from './ticket.controller';
import { TicketPriorityService } from './ticket-priority.service';
import { TicketSchedulerService } from './ticket-scheduler.service';
import { PrismaService } from '../prisma/prisma.service';
import { IssueTypeModule } from '../issue-type/issue-type.module';
import { TicketMessageModule } from '../ticket-message/ticket-message.module';
import { WebsocketModule } from '../websocket/websocket.module';
import { SessionModule } from '../session/session.module';
import { ScheduleModule } from '@nestjs/schedule';

@Module({
  imports: [
    IssueTypeModule,
    TicketMessageModule,
    forwardRef(() => WebsocketModule),
    forwardRef(() => SessionModule),
    ScheduleModule.forRoot(),
  ],
  controllers: [TicketController],
  providers: [
    TicketService,
    TicketPriorityService,
    TicketSchedulerService,
    PrismaService,
  ],
  exports: [TicketService],
})
export class TicketModule {}
