import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Response } from 'express';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
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

    // 记录详细的错误信息
    if (status === HttpStatus.INTERNAL_SERVER_ERROR) {
      console.error('=== 服务器内部错误 ===');
      console.error('路径:', request.url);
      console.error('方法:', request.method);
      console.error('错误:', exception);
      if (exception instanceof Error) {
        console.error('错误消息:', exception.message);
        console.error('错误堆栈:', exception.stack);
        if ((exception as any).code) {
          console.error('错误代码:', (exception as any).code);
        }
      }
      console.error('==================');
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
