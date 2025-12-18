import { Injectable, OnModuleInit } from '@nestjs/common';
import * as client from 'prom-client';

@Injectable()
export class MetricsService implements OnModuleInit {
  onModuleInit() {
    // 注册默认 Node.js / Process 指标
    client.collectDefaultMetrics({
      prefix: 'game_ai_cs_',
    });
  }

  getMetrics(): Promise<string> {
    return client.register.metrics();
  }
}