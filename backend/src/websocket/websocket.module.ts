import { Module } from '@nestjs/common';
import { WebsocketGateway } from './websocket.gateway';
import { PrismaService } from '../prisma/prisma.service';
import { MessageService } from '../message/message.service';
import { MessageModule } from '../message/message.module';

@Module({
  imports: [MessageModule],
  providers: [WebsocketGateway, PrismaService],
  exports: [WebsocketGateway],
})
export class WebsocketModule {}

