import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaService } from './prisma/prisma.service';
import { AuthModule } from './auth/auth.module';
import { GameModule } from './game/game.module';
import { TicketModule } from './ticket/ticket.module';
import { SessionModule } from './session/session.module';
import { MessageModule } from './message/message.module';
import { DifyModule } from './dify/dify.module';
import { UrgencyRuleModule } from './urgency-rule/urgency-rule.module';
import { WebsocketModule } from './websocket/websocket.module';
import { SatisfactionModule } from './satisfaction/satisfaction.module';
import { UploadModule } from './upload/upload.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { TicketMessageModule } from './ticket-message/ticket-message.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env'],
    }),
    AuthModule,
    GameModule,
    TicketModule,
    SessionModule,
    MessageModule,
    DifyModule,
    UrgencyRuleModule,
    WebsocketModule,
    SatisfactionModule,
    UploadModule,
    DashboardModule,
    TicketMessageModule,
  ],
  controllers: [AppController],
  providers: [AppService, PrismaService],
})
export class AppModule {}
