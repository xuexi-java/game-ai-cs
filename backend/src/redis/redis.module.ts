import { Module, Global } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: 'REDIS_CLIENT',
      useFactory: (configService: ConfigService) => {
        const redis = new Redis({
          host: configService.get<string>('REDIS_HOST') || 'localhost',
          port: configService.get<number>('REDIS_PORT') || 6379,
          // 设置较小的重试次数，快速失败以便应用层处理
          maxRetriesPerRequest: 1, // 每个请求最多重试 1 次，快速失败
          retryStrategy: (times) => {
            // 最多重试 3 次连接，然后快速失败
            if (times > 3) {
              return null; // 停止重试
            }
            const delay = Math.min(times * 50, 500); // 减少延迟，快速失败
            return delay;
          },
          // 连接超时设置
          connectTimeout: 3000, // 3 秒连接超时
          lazyConnect: false, // 立即连接
          // 禁用离线队列，失败时立即抛出错误，让应用层处理
          enableOfflineQueue: false,
        });

        redis.on('error', (err) => {
          console.error('Redis Client Error:', err);
        });

        redis.on('connect', () => {
          console.log('Redis Client Connected');
        });

        return redis;
      },
      inject: [ConfigService],
    },
  ],
  exports: ['REDIS_CLIENT'],
})
export class RedisModule {}

