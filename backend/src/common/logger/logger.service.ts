import {
  Injectable,
  LoggerService as NestLoggerService,
  OnModuleDestroy,
} from '@nestjs/common';
import { createWriteStream, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

// 简单的日期格式化函数，避免依赖 date-fns
function formatDate(date: Date, formatStr: string): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  const milliseconds = String(date.getMilliseconds()).padStart(3, '0');

  return formatStr
    .replace('yyyy', String(year))
    .replace('MM', month)
    .replace('dd', day)
    .replace('HH', hours)
    .replace('mm', minutes)
    .replace('ss', seconds)
    .replace('SSS', milliseconds);
}

export enum LogLevel {
  ERROR = 0,
  WARN = 1,
  LOG = 2,
  DEBUG = 3,
  VERBOSE = 4,
}

@Injectable()
export class LoggerService implements NestLoggerService, OnModuleDestroy {
  private logLevel: LogLevel;
  private logDir: string;
  private errorLogStream: NodeJS.WritableStream;
  private combinedLogStream: NodeJS.WritableStream;
  private currentDate: string;

  constructor() {
    // 从环境变量读取日志级别，默认为 LOG
    const envLogLevel = process.env.LOG_LEVEL?.toUpperCase() || 'LOG';
    this.logLevel = LogLevel[envLogLevel] ?? LogLevel.LOG;

    // 设置日志目录
    this.logDir = process.env.LOG_DIR || join(process.cwd(), 'logs');
    if (!existsSync(this.logDir)) {
      mkdirSync(this.logDir, { recursive: true });
    }

    // 初始化日志流
    this.currentDate = formatDate(new Date(), 'yyyy-MM-dd');
    this.initializeLogStreams();

    // 每天午夜检查是否需要切换日志文件
    this.scheduleLogRotation();
  }

  private initializeLogStreams() {
    const dateStr = formatDate(new Date(), 'yyyy-MM-dd');
    const errorLogPath = join(this.logDir, `backend-${dateStr}.error.log`);
    const combinedLogPath = join(this.logDir, `backend-${dateStr}.log`);

    // 关闭旧的流
    if (this.errorLogStream) {
      this.errorLogStream.end();
    }
    if (this.combinedLogStream) {
      this.combinedLogStream.end();
    }

    try {
      // 创建新的流（异步模式，增加缓冲区）
      this.errorLogStream = createWriteStream(errorLogPath, {
        flags: 'a',
        highWaterMark: 64 * 1024, // 64KB 缓冲区
      });
      this.combinedLogStream = createWriteStream(combinedLogPath, {
        flags: 'a',
        highWaterMark: 64 * 1024,
      });

      // 监听错误
      this.errorLogStream.on('error', (err) => {
        console.error('Error log stream error:', err);
      });
      this.combinedLogStream.on('error', (err) => {
        console.error('Combined log stream error:', err);
      });

      this.currentDate = dateStr;
    } catch (error) {
      console.error('Failed to initialize log streams:', error);
    }
  }

  private scheduleLogRotation() {
    // 每小时检查一次是否需要切换日志文件
    setInterval(() => {
      const now = formatDate(new Date(), 'yyyy-MM-dd');
      if (now !== this.currentDate) {
        this.initializeLogStreams();
      }
    }, 3600000); // 1小时
  }

  private shouldLog(level: LogLevel): boolean {
    if (level > this.logLevel) return false;

    // 错误日志始终记录（不采样）
    if (level === LogLevel.ERROR) return true;

    // 其他日志按采样率记录
    const samplingRate = parseFloat(process.env.LOG_SAMPLING_RATE || '1');
    return Math.random() < samplingRate;
  }

  private formatMessage(
    level: string,
    context: string,
    message: any,
    ...optionalParams: any[]
  ): string {
    const timestamp = formatDate(new Date(), 'yyyy-MM-dd HH:mm:ss.SSS');
    const contextStr = context || 'Application';

    // 支持 JSON 格式输出
    const logFormat = process.env.LOG_FORMAT || 'text';
    if (logFormat === 'json') {
      const logEntry = {
        timestamp,
        level,
        context: contextStr,
        message:
          typeof message === 'string' ? message : JSON.stringify(message),
        data: optionalParams.length > 0 ? optionalParams : undefined,
      };
      return JSON.stringify(logEntry);
    }

    // 文本格式（默认）
    const messageStr =
      typeof message === 'string' ? message : JSON.stringify(message, null, 2);
    const paramsStr =
      optionalParams.length > 0
        ? ' ' +
          optionalParams
            .map((p) =>
              typeof p === 'string' ? p : JSON.stringify(p, null, 2),
            )
            .join(' ')
        : '';

    return `[${timestamp}] ${level} [${contextStr}] ${messageStr}${paramsStr}`;
  }

  private writeQueue: string[] = [];
  private writeTimer: NodeJS.Timeout | null = null;
  private isWriting = false;
  private readonly batchSize = parseInt(process.env.LOG_BATCH_SIZE || '50');
  private readonly batchInterval = parseInt(
    process.env.LOG_BATCH_INTERVAL || '100',
  );

  private async flushQueue(): Promise<void> {
    if (this.isWriting || this.writeQueue.length === 0) return;

    this.isWriting = true;
    const messagesToWrite = [...this.writeQueue];
    this.writeQueue = [];

    if (this.writeTimer) {
      clearTimeout(this.writeTimer);
      this.writeTimer = null;
    }

    try {
      // 分离错误日志和普通日志
      const errorMessages: string[] = [];
      const combinedMessages: string[] = [];

      for (const msg of messagesToWrite) {
        combinedMessages.push(msg);
        if (msg.includes(' ERROR ')) {
          errorMessages.push(msg);
        }
      }

      // 异步批量写入
      const writePromises: Promise<void>[] = [];

      if (combinedMessages.length > 0) {
        writePromises.push(
          new Promise<void>((resolve, reject) => {
            this.combinedLogStream.write(combinedMessages.join(''), (err) => {
              if (err) reject(err);
              else resolve();
            });
          }),
        );
      }

      if (errorMessages.length > 0) {
        writePromises.push(
          new Promise<void>((resolve, reject) => {
            this.errorLogStream.write(errorMessages.join(''), (err) => {
              if (err) reject(err);
              else resolve();
            });
          }),
        );
      }

      await Promise.all(writePromises);
    } catch (error) {
      // 写入失败时降级到控制台
      console.error('Log write failed, falling back to console:', error);
      messagesToWrite.forEach((msg) => console.log(msg.trim()));
    } finally {
      this.isWriting = false;
    }
  }

  private enqueueLog(message: string) {
    this.writeQueue.push(message);

    // 如果队列达到批量大小，立即刷新
    if (this.writeQueue.length >= this.batchSize) {
      this.flushQueue();
    } else if (!this.writeTimer) {
      // 设置定时器，定期刷新
      this.writeTimer = setTimeout(() => {
        this.flushQueue();
      }, this.batchInterval);
    }
  }

  private filterSensitiveData(data: any): any {
    if (!data || typeof data !== 'object') return data;

    // 扩展敏感字段列表，包含用户输入相关的字段
    const sensitiveFields = (
      process.env.LOG_SENSITIVE_FIELDS ||
      'password,token,secret,apiKey,authorization,content,message,text,description,query,playerIdOrName,paymentOrderNo,src,dst,trans_result'
    )
      .split(',')
      .map((s) => s.trim());
    const filtered = Array.isArray(data) ? [...data] : { ...data };
    const isProduction = process.env.NODE_ENV === 'production';

    for (const key in filtered) {
      const lowerKey = key.toLowerCase();
      if (
        sensitiveFields.some((field) => lowerKey.includes(field.toLowerCase()))
      ) {
        // 对于用户输入字段，根据环境决定脱敏程度
        if (isProduction && (lowerKey.includes('content') || lowerKey.includes('message') || 
            lowerKey.includes('text') || lowerKey.includes('description') || 
            lowerKey.includes('query') || lowerKey.includes('src') || lowerKey.includes('dst'))) {
          // 生产环境：只显示长度
          const value = filtered[key];
          if (typeof value === 'string') {
            filtered[key] = `[REDACTED] length=${value.length}`;
          } else {
            filtered[key] = '***REDACTED***';
          }
        } else {
          filtered[key] = '***REDACTED***';
        }
      } else if (typeof filtered[key] === 'object' && filtered[key] !== null) {
        filtered[key] = this.filterSensitiveData(filtered[key]);
      }
    }

    return filtered;
  }

  private writeLog(
    level: string,
    context: string,
    message: any,
    ...optionalParams: any[]
  ) {
    // 过滤敏感信息
    const filteredParams =
      optionalParams.length > 0
        ? optionalParams.map((p) => this.filterSensitiveData(p))
        : undefined;

    const formattedMessage = this.formatMessage(
      level,
      context,
      message,
      ...(filteredParams || []),
    );

    // 写入控制台
    if (level === 'ERROR') {
      console.error(formattedMessage);
    } else if (level === 'WARN') {
      console.warn(formattedMessage);
    } else {
      console.log(formattedMessage);
    }

    // 加入写入队列（异步批量写入）
    const fileMessage = formattedMessage + '\n';
    this.enqueueLog(fileMessage);
  }

  log(message: any, context?: string, ...optionalParams: any[]) {
    if (this.shouldLog(LogLevel.LOG)) {
      this.writeLog(
        'LOG',
        context || 'Application',
        message,
        ...optionalParams,
      );
    }
  }

  error(
    message: any,
    trace?: string,
    context?: string,
    ...optionalParams: any[]
  ) {
    if (this.shouldLog(LogLevel.ERROR)) {
      const errorMessage = trace ? `${message}\n${trace}` : message;
      this.writeLog(
        'ERROR',
        context || 'Application',
        errorMessage,
        ...optionalParams,
      );
    }
  }

  warn(message: any, context?: string, ...optionalParams: any[]) {
    if (this.shouldLog(LogLevel.WARN)) {
      this.writeLog(
        'WARN',
        context || 'Application',
        message,
        ...optionalParams,
      );
    }
  }

  debug(message: any, context?: string, ...optionalParams: any[]) {
    if (this.shouldLog(LogLevel.DEBUG)) {
      this.writeLog(
        'DEBUG',
        context || 'Application',
        message,
        ...optionalParams,
      );
    }
  }

  verbose(message: any, context?: string, ...optionalParams: any[]) {
    if (this.shouldLog(LogLevel.VERBOSE)) {
      this.writeLog(
        'VERBOSE',
        context || 'Application',
        message,
        ...optionalParams,
      );
    }
  }

  setLogLevel(level: LogLevel) {
    this.logLevel = level;
  }

  getLogLevel(): LogLevel {
    return this.logLevel;
  }

  // 应用关闭时刷新队列
  async onModuleDestroy() {
    await this.flushQueue();
    if (this.errorLogStream) {
      this.errorLogStream.end();
    }
    if (this.combinedLogStream) {
      this.combinedLogStream.end();
    }
  }
}
