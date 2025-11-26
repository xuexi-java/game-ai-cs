import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join, isAbsolute } from 'path';
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
import { UserModule } from './user/user.module';
import { IssueTypeModule } from './issue-type/issue-type.module';
import { QuickReplyModule } from './quick-reply/quick-reply.module';
import { validate } from './common/config/env.validation';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env'],
      validate,
    }),
    ServeStaticModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const configuredDir =
          configService.get<string>('UPLOAD_DIR') || 'uploads';
        const rootPath = isAbsolute(configuredDir)
          ? configuredDir
          : join(process.cwd(), configuredDir);
        return [
          {
            rootPath,
            serveRoot: '/uploads',
          },
        ];
      },
    }),
    AuthModule,
    GameModule,
    IssueTypeModule,
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
    UserModule,
    IssueTypeModule,
    QuickReplyModule,
  ],
  controllers: [AppController],
  providers: [AppService, PrismaService],
})
export class AppModule {}
