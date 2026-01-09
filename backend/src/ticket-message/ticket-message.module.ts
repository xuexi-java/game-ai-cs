import { Module, forwardRef } from '@nestjs/common';
import { TicketMessageService } from './ticket-message.service';
import { TicketMessageController } from './ticket-message.controller';
import { WebsocketModule } from '../websocket/websocket.module';
import { TicketModule } from '../ticket/ticket.module';

@Module({
  imports: [
    forwardRef(() => WebsocketModule),
    forwardRef(() => TicketModule),
  ],
  controllers: [TicketMessageController],
  providers: [TicketMessageService],
  exports: [TicketMessageService],
})
export class TicketMessageModule {}
