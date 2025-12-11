import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '@prisma/client';

// 数据库服务
@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{ // 构造函数
  constructor(private configService: ConfigService) {
    super({ // 连接数据库
      datasources: { // 数据源
        db: {
          url: // 数据库连接字符串
            configService.get<string>('DATABASE_URL') || // 从环境变量获取数据库连接字符串
            process.env.DATABASE_URL,
        },
      },
    });
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
