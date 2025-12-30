import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ServeStaticModule } from '@nestjs/serve-static';
import { ThrottlerModule } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerStorageRedisService } from 'nestjs-throttler-storage-redis';
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
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { RedisModule } from './redis/redis.module';
import { EncryptionModule } from './common/encryption/encryption.module';
import { CacheModule } from './common/cache/cache.module';
import { validate } from './common/config/env.validation';
import { AppThrottlerGuard } from './common/guards/app-throttler.guard';
import {
  getDifyThrottleKey,
  isDifyHttpRequest,
} from './common/guards/throttle-keys';
// import { MetricsModule } from './metrics/metrics.module'; // disabled for fast release

@Module({
  imports: [
    // MetricsModule, // disabled for fast release
    ScheduleModule.forRoot(),
    LoggerModule,
    RedisModule,
    EncryptionModule,
    CacheModule,
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const redisUrl = configService.get<string>('REDIS_URL');
        const redisHost = configService.get<string>('REDIS_HOST', 'localhost');
        const redisPort = configService.get<number>('REDIS_PORT', 6379);
        const storage = redisUrl
          ? new ThrottlerStorageRedisService(redisUrl)
          : new ThrottlerStorageRedisService({
              host: redisHost,
              port: redisPort,
            });

        // 从环境变量读取限流配置
        const globalTtl = configService.get<number>('THROTTLE_GLOBAL_TTL', 60000);
        const globalLimit = configService.get<number>('THROTTLE_GLOBAL_LIMIT', 200);
        const difyTtl = configService.get<number>('THROTTLE_DIFY_TTL', 60000);
        const difyLimit = configService.get<number>('THROTTLE_DIFY_LIMIT', 100);

        return {
          throttlers: [
            {
              ttl: globalTtl,
              limit: globalLimit,
            },
            {
              name: 'dify-api',
              ttl: difyTtl,
              limit: difyLimit,
              getTracker: getDifyThrottleKey,
              skipIf: (context) => {
                if (context.getType() !== 'http') {
                  return true;
                }
                const req = context.switchToHttp().getRequest();
                return !isDifyHttpRequest(req);
              },
            },
          ],
          storage,
        };
      },
    }),
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
    LoggingInterceptor,
    HttpExceptionFilter,
    {
      provide: APP_GUARD,
      useClass: AppThrottlerGuard,
    },
  ],
})
export class AppModule {}
