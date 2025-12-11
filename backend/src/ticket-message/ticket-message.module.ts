import { Module, forwardRef } from '@nestjs/common';
import { TicketMessageService } from './ticket-message.service';
import { TicketMessageController } from './ticket-message.controller';
import { PrismaService } from '../prisma/prisma.service';
import { WebsocketModule } from '../websocket/websocket.module';
import { TranslationModule } from '../shared/translation/translation.module';
import { TicketModule } from '../ticket/ticket.module';

@Module({
  imports: [
    forwardRef(() => WebsocketModule),
    forwardRef(() => TicketModule),
    TranslationModule,
  ],
  controllers: [TicketMessageController],
  providers: [TicketMessageService, PrismaService],
  exports: [TicketMessageService],
})
export class TicketMessageModule {}
