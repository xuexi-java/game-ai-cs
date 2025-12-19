import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable, throwError } from 'rxjs';
import { tap, catchError } from 'rxjs/operators';
import { Request, Response } from 'express';
import { TraceService } from '../logger/trace.service';
import { AppLogger } from '../logger/app-logger.service';
import {
  CallerType,
  RequestStatus,
  SLOW_REQUEST_THRESHOLDS,
} from '../logger/logger.types';

/**
 * HTTP 请求日志拦截器
 * 优化版本 - 每个请求只记录 1 条日志
 * 
 * 职责：
 * 1. 在最外层调用 traceService.run() 生成 traceId
 * 2. 只在响应时记录日志（合并 request + response 信息）
 * 3. 计算 cost，判断慢请求
 * 4. 提取 userId 和 caller 类型
 * 5. 记录 handler（Controller.method）
 * 
 * 优化点：
 * - 日志量减半（1 条 vs 2 条）
 * - 删除 userAgent（节省 60% 空间）
 * - 删除冗余 message 字段
 * - 确保 traceId/userId 完整
 */
@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  constructor(
    private readonly traceService: TraceService,
    private readonly logger: AppLogger,
  ) {
    this.logger.setContext('HTTP');
  }

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();

    // 跳过 metrics 端点
    if (request.url === '/api/v1/metrics') {
      return next.handle();
    }

    // traceService.run() 包裹整个 Observable 执行链
    return this.traceService.run(() => {
      const startTime = Date.now();

      // 提取 userId 和 caller
      this.extractUserContext(request);

      // 返回 Observable，只在响应时记录日志
      return next.handle().pipe(
        tap(() => {
          // 成功响应
          const costMs = Date.now() - startTime;
          this.logResponse(
            context,
            request,
            response,
            costMs,
            RequestStatus.SUCCESS,
          );
        }),
        catchError((error) => {
          // 失败响应
          const costMs = Date.now() - startTime;
          this.logResponse(
            context,
            request,
            response,
            costMs,
            RequestStatus.FAIL,
            error,
          );
          return throwError(() => error);
        }),
      );
    });
  }

  /**
   * 提取用户上下文（userId 和 caller）
   */
  private extractUserContext(request: Request): void {
    const user = (request as any).user;

    if (user?.id) {
      this.traceService.setUserId(String(user.id));

      // 根据用户角色判断 caller 类型
      if (user.role === 'AGENT') {
        this.traceService.setCaller(CallerType.AI);
      } else if (user.role === 'PLAYER' || user.role === 'ADMIN') {
        this.traceService.setCaller(CallerType.USER);
      } else {
        this.traceService.setCaller(CallerType.SYSTEM);
      }
    } else {
      this.traceService.setCaller(CallerType.SYSTEM);
    }
  }

  /**
   * 记录响应日志（合并 request + response 信息）
   * 优化：删除 userAgent，删除冗余 message，确保 traceId/userId 完整
   */
  private logResponse(
    context: ExecutionContext,
    request: Request,
    response: Response,
    costMs: number,
    status: RequestStatus,
    error?: any,
  ): void {
    const { method, url, ip } = request;
    const handler = this.getHandlerName(context);
    const statusCode = response.statusCode;

    // 合并 request + response 信息，删除 userAgent 和 message
    const logContext = {
      method,
      path: url,
      handler,
      status,
      statusCode,
      cost: `${costMs}ms`,
      ip: ip || request.socket.remoteAddress,
      ...(error && {
        errorCode: error?.code,
        errorMessage: error?.message,
      }),
    };

    // 根据 costMs 和 status 决定日志级别
    if (costMs > SLOW_REQUEST_THRESHOLDS.ERROR) {
      // > 2000ms 使用 ERROR 级别
      this.logger.error('Slow request >2s', undefined, logContext);
    } else if (costMs > SLOW_REQUEST_THRESHOLDS.WARN) {
      // > 500ms 使用 WARN 级别
      this.logger.warn('Slow request >500ms', logContext);
    } else if (status === RequestStatus.FAIL) {
      // 失败使用 ERROR 级别
      this.logger.error('Request failed', undefined, logContext);
    } else {
      // 正常使用 INFO 级别（删除 message，通过字段判断类型）
      this.logger.log('Request completed', logContext);
    }
  }

  /**
   * 获取 handler 名称（Controller.method）
   */
  private getHandlerName(context: ExecutionContext): string {
    const handler = context.getHandler();
    const controller = context.getClass();
    return `${controller.name}.${handler.name}`;
  }
}
