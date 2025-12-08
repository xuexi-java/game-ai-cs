import { Module } from '@nestjs/common';
import { MessageService } from './message.service';
import { MessageController } from './message.controller';
import { PrismaService } from '../prisma/prisma.service';

import { TranslationModule } from '../shared/translation/translation.module';

@Module({
  imports: [TranslationModule],
  controllers: [MessageController],
  providers: [MessageService, PrismaService],
  exports: [MessageService],
})
export class MessageModule { }
