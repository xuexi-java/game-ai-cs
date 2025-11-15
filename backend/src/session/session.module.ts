import { Module } from '@nestjs/common';
import { SessionService } from './session.service';
import { SessionController } from './session.controller';
import { PrismaService } from '../prisma/prisma.service';
import { DifyModule } from '../dify/dify.module';
import { MessageModule } from '../message/message.module';

@Module({
  imports: [DifyModule, MessageModule],
  controllers: [SessionController],
  providers: [SessionService, PrismaService],
  exports: [SessionService],
})
export class SessionModule {}

