import { Module, Global } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: 'REDIS_CLIENT',
      useFactory: async (configService: ConfigService) => {
        // 优先使用 REDIS_URL，如果没有则使用 REDIS_HOST + REDIS_PORT
        const redisUrl = configService.get<string>('REDIS_URL');
        
        let redis: Redis;
        const commonOptions = {
          maxRetriesPerRequest: 3,
          retryStrategy: (times) => {
            if (times > 5) {
              console.error('Redis 连接失败，已达到最大重试次数');
              return null;
            }
            const delay = Math.min(times * 200, 2000);
            console.log(`Redis 重连中... (${times}/5)，${delay}ms 后重试`);
            return delay;
          },
          connectTimeout: 5000,
          lazyConnect: false,
          enableOfflineQueue: true, // 启用离线队列，避免启动时的警告
          enableReadyCheck: true,
        };
        
        if (redisUrl) {
          redis = new Redis(redisUrl, commonOptions);
        } else {
          // 降级到旧的配置方式
          redis = new Redis({
            host: configService.get<string>('REDIS_HOST') || 'localhost',
            port: configService.get<number>('REDIS_PORT') || 6379,
            ...commonOptions,
          });
        }

        // 等待连接就绪
        return new Promise<Redis>((resolve, reject) => {
          const timeout = setTimeout(() => {
            console.warn('Redis 连接超时，但继续启动应用（离线模式）');
            resolve(redis); // 即使超时也返回实例，让应用继续启动
          }, 5000);

          redis.on('ready', () => {
            clearTimeout(timeout);
            console.log('Redis Client Connected');
            resolve(redis);
          });

          redis.on('error', (err) => {
            console.error('Redis Client Error:', err.message);
            // 不要 reject，让应用继续启动
          });

          redis.on('connect', () => {
            console.log('Redis Client Connecting...');
          });
        });
      },
      inject: [ConfigService],
    },
  ],
  exports: ['REDIS_CLIENT'],
})
export class RedisModule {}

