import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Inject,
  Optional,
} from '@nestjs/common';
import { Response, Request } from 'express';
import { AppLogger } from '../logger/app-logger.service';
import { TraceService } from '../logger/trace.service';
import { RequestStatus } from '../logger/logger.types';
import { RateLimitCircuitBreakerService } from '../logger/rate-limit-circuit-breaker.service';

/**
 * 全局异常过滤器
 * 符合 LOGGING_SPEC.md 第 6 节规范
 * 
 * 职责：
 * 1. 捕获所有异常
 * 2. 记录异常详细信息（errorCode、errorMessage、stack）
 * 3. 返回标准错误响应（包含 traceId）
 * 
 * 注意：
 * - 与 LoggingInterceptor 的日志不重复
 * - LoggingInterceptor：记录接口层面的 FAIL（无 stack）
 * - ExceptionFilter：记录异常本身的详细信息（有 stack）
 * - 一次失败请求会产生 2 条日志，这是允许的
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger: AppLogger;

  constructor(
    logger: AppLogger,
    private readonly traceService: TraceService,
    @Optional() @Inject(RateLimitCircuitBreakerService) private readonly circuitBreaker?: RateLimitCircuitBreakerService,
  ) {
    this.logger = logger;
    this.logger.setContext('ExceptionFilter');
  }

  async catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const status = this.getHttpStatus(exception);
    const errorCode = this.getErrorCode(exception, status);
    const errorMessage = this.getErrorMessage(exception);
    const stack = exception instanceof Error ? exception.stack : undefined;

    // 429 错误熔断逻辑
    if (status === 429) {
      // 记录 429 错误到熔断器
      if (this.circuitBreaker) {
        await this.circuitBreaker.record429Error();
        
        // 检查熔断器状态
        const isCircuitOpen = await this.circuitBreaker.isCircuitOpen();
        if (isCircuitOpen) {
          // 熔断期间，只记录轻量级计数，不打印完整堆栈
          await this.circuitBreaker.incrementSilencedCount();
          
          // 只记录一条简化日志（不含 stack）
          this.logger.warn('RateLimit', {
            st: RequestStatus.FAIL,
            ec: errorCode,
            em: 'Rate limit (silenced)',
            stc: status,
          });
          
          // 返回响应
          response.status(status).json({
            success: false,
            statusCode: status,
            errorCode,
            message: errorMessage,
            timestamp: new Date().toISOString(),
            path: request.url,
            traceId: this.traceService.getTraceId(),
          });
          return;
        }
      }
    }

    // 正常错误日志（符合 LOGGING_SPEC.md 第 6 节）
    // 使用精简字段，显式传递 context 避免单例污染
    this.logger.error('Exception', stack, {
      ctx: 'ExceptionFilter',
      st: RequestStatus.FAIL,
      ec: errorCode,
      em: errorMessage,
      stc: status,
      p: request.url,
      m: request.method,
    });

    // 返回标准错误响应
    response.status(status).json({
      success: false,
      statusCode: status,
      errorCode,
      message: errorMessage,
      timestamp: new Date().toISOString(),
      path: request.url,
      traceId: this.traceService.getTraceId(), // 方便前端排查
    });
  }

  /**
   * 获取 HTTP 状态码
   */
  private getHttpStatus(exception: unknown): number {
    if (exception instanceof HttpException) {
      return exception.getStatus();
    }
    return HttpStatus.INTERNAL_SERVER_ERROR;
  }

  /**
   * 获取 errorCode
   * 
   * 映射规则（MVP）：
   * 1. HttpException + 业务 code → 使用业务 code
   * 2. HttpException（无业务 code）→ HTTP_{status}
   * 3. 其他 Error → SYSTEM_ERROR
   */
  private getErrorCode(exception: unknown, status: number): string {
    if (exception instanceof HttpException) {
      const response = exception.getResponse();
      
      // 优先使用业务 code
      if (typeof response === 'object' && (response as any).code) {
        return (response as any).code;
      }
      
      // 否则使用 HTTP_status
      return `HTTP_${status}`;
    }
    
    // 其他异常统一为 SYSTEM_ERROR
    return 'SYSTEM_ERROR';
  }

  /**
   * 获取 errorMessage（给人看的错误描述）
   */
  private getErrorMessage(exception: unknown): string {
    if (exception instanceof HttpException) {
      const response = exception.getResponse();
      
      if (typeof response === 'string') {
        return response;
      }
      
      if (typeof response === 'object') {
        // 优先使用 message 字段
        if ((response as any).message) {
          const message = (response as any).message;
          // 如果 message 是数组（class-validator 验证错误），取第一个
          return Array.isArray(message) ? message[0] : message;
        }
        
        // 否则使用 error 字段
        if ((response as any).error) {
          return (response as any).error;
        }
      }
      
      return 'Unknown error';
    }
    
    if (exception instanceof Error) {
      return exception.message;
    }
    
    return 'Internal server error';
  }
}
