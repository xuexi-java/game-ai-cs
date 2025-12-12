import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Response } from 'express';
import { LoggerService } from '../logger/logger.service';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new LoggerService();

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const message =
      exception instanceof HttpException
        ? exception.getResponse()
        : 'Internal server error';

    // 记录详细的错误信息（脱敏处理，不记录整个 exception 对象）
    if (status === HttpStatus.INTERNAL_SERVER_ERROR) {
      const errorDetails: any = {
        path: request.url,
        method: request.method,
        // 不记录整个 exception 对象，只记录必要信息
      };

      if (exception instanceof Error) {
        errorDetails.message = exception.message;
        errorDetails.stack = exception.stack;
        if ((exception as any).code) {
          errorDetails.code = (exception as any).code;
        }
        // 不记录 exception 对象的其他属性，避免泄露用户输入
      } else {
        errorDetails.errorType = typeof exception;
        errorDetails.errorString = String(exception);
      }

      this.logger.error(
        `服务器内部错误: ${request.method} ${request.url}`,
        exception instanceof Error ? exception.stack : undefined,
        'HttpExceptionFilter',
        errorDetails,
      );
    } else {
      // 记录非500错误（警告级别）
      this.logger.warn(
        `HTTP ${status}: ${request.method} ${request.url}`,
        'HttpExceptionFilter',
        {
          message:
            typeof message === 'string' ? message : (message as any).message,
        },
      );
    }

    response.status(status).json({
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.url,
      message:
        typeof message === 'string'
          ? message
          : (message as any).message || message,
    });
  }
}
