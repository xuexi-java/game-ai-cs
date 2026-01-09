import { Module, forwardRef } from '@nestjs/common';
import { SessionService } from './session.service';
import { SessionController } from './session.controller';
import { DifyModule } from '../dify/dify.module';
import { MessageModule } from '../message/message.module';
import { WebsocketModule } from '../websocket/websocket.module';
import { TicketModule } from '../ticket/ticket.module';
import { QueueModule } from '../queue/queue.module';
import {
  SessionPriorityService,
  SessionQueueService,
  SessionAIService,
  SessionAssignmentService,
  SessionTransferService,
} from './services';

@Module({
  imports: [
    DifyModule,
    MessageModule,
    forwardRef(() => WebsocketModule),
    forwardRef(() => TicketModule),
    QueueModule,
  ],
  controllers: [SessionController],
  providers: [
    SessionService,
    SessionPriorityService,
    SessionQueueService,
    SessionAIService,
    SessionAssignmentService,
    SessionTransferService,
  ],
  exports: [
    SessionService,
    SessionPriorityService,
    SessionQueueService,
    SessionAIService,
    SessionAssignmentService,
    SessionTransferService,
  ],
})
export class SessionModule {}
