import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ServeStaticModule } from '@nestjs/serve-static';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { join, isAbsolute } from 'path';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
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
import { LoggerModule } from './common/logger/logger.module';
import { RedisModule } from './redis/redis.module';
import { EncryptionModule } from './common/encryption/encryption.module';
import { validate } from './common/config/env.validation';

@Module({
  imports: [
    LoggerModule,
    RedisModule,
    EncryptionModule,
    ThrottlerModule.forRoot([
      {
        ttl: 60000, // 时间窗口：60秒（1分钟）
        limit: 10000, // 每个IP在1分钟内最多10000次请求
      },
      {
        name: 'dify-api', // 针对 Dify API 的严格限制
        ttl: 60000, // 60秒（1分钟）
        limit: 3000, // 每个IP在1分钟内最多3000次 Dify API 调用
      },
    ]),
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
    QuickReplyModule,
    PrismaModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
