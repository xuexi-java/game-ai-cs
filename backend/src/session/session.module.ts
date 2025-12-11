import { Module, forwardRef } from '@nestjs/common';
import { SessionService } from './session.service';
import { SessionController } from './session.controller';
import { PrismaService } from '../prisma/prisma.service';
import { DifyModule } from '../dify/dify.module';
import { MessageModule } from '../message/message.module';
import { WebsocketModule } from '../websocket/websocket.module';
import { TicketModule } from '../ticket/ticket.module';
import { QueueModule } from '../queue/queue.module';
import { TranslationModule } from '../shared/translation/translation.module';

@Module({
  imports: [
    DifyModule,
    MessageModule,
    TranslationModule,
    forwardRef(() => WebsocketModule),
    forwardRef(() => TicketModule),
    QueueModule,
  ],
  controllers: [SessionController],
  providers: [SessionService, PrismaService],
  exports: [SessionService],
})
export class SessionModule {}
