import { Module, Global } from '@nestjs/common';
import { TraceService } from './trace.service';
import { AppLogger } from './app-logger.service';
import { LoggerService } from './logger.service';

/**
 * 日志模块
 * 
 * 使用 @Global() 装饰器，使得 TraceService、AppLogger 和 LoggerService
 * 在整个应用中可用，无需在每个模块中重复导入
 */
@Global()
@Module({
  providers: [TraceService, AppLogger, LoggerService],
  exports: [TraceService, AppLogger, LoggerService],
})
export class LoggerModule {}
