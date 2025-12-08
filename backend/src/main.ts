import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { LoggerService } from './common/logger/logger.service';
import { QueueService } from './queue/queue.service';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: new LoggerService(),
  });

  const logger = app.get(LoggerService);

  // 全局验证管道
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  // 全局异常过滤器
  app.useGlobalFilters(new HttpExceptionFilter());

  // 全局响应拦截器
  app.useGlobalInterceptors(new TransformInterceptor());

  // CORS 配置 - 同时兼容 .env 中的 FRONTEND_URL 和默认本地域名
  const defaultOrigins = [
    'http://localhost:20101',
    'http://localhost:20102',
    'http://127.0.0.1:20101',
    'http://127.0.0.1:20102',
  ];
  const envOrigins =
    process.env.FRONTEND_URL?.split(',')
      .map((origin) => origin.trim())
      .filter(Boolean) ?? [];
  const allowedOrigins = Array.from(
    new Set([...defaultOrigins, ...envOrigins]),
  );

  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  // API前缀
  app.setGlobalPrefix('api/v1');

  // Swagger配置
  const config = new DocumentBuilder()
    .setTitle('AI客服系统 API')
    .setDescription('AI客服系统后端API文档')
    .setVersion('1.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        name: 'JWT',
        description: '输入JWT token',
        in: 'header',
      },
      'JWT-auth', // 这个名称将在@ApiBearerAuth()中使用
    )
    .addTag('auth', '认证相关接口')
    .addTag('users', '用户管理接口')
    .addTag('games', '游戏管理接口')
    .addTag('tickets', '工单管理接口')
    .addTag('sessions', '会话管理接口')
    .addTag('messages', '消息管理接口')
    .addTag('issue-types', '问题类型管理接口')
    .addTag('urgency-rules', '紧急规则管理接口')
    .addTag('dashboard', '仪表盘接口')
    .addTag('upload', '文件上传接口')
    .addTag('satisfaction', '满意度评价接口')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/v1/docs', app, document, {
    swaggerOptions: {
      persistAuthorization: true, // 保持授权状态
      tagsSorter: 'alpha', // 标签排序
      operationsSorter: 'alpha', // 操作排序
    },
  });

  const port = process.env.PORT || 21101;
  await app.listen(port);
  // 使用环境变量或默认值构建 baseUrl（用于日志输出）
  const host = process.env.HOST || 'localhost';
  const protocol = process.env.NODE_ENV === 'production' ? 'https' : 'http';
  const baseUrl = `${protocol}://${host}:${port}`;
  logger.log(`🚀 后端服务运行在 ${baseUrl}`, 'Bootstrap');
  logger.log(`📚 Swagger API在线文档: ${baseUrl}/api/v1/docs`, 'Bootstrap');

  // 恢复队列数据到 Redis（如果 Redis 可用）
  try {
    const queueService = app.get(QueueService);
    await queueService.recoverQueueFromDatabase();
  } catch (error) {
    logger.warn(`恢复队列数据失败: ${error.message}`, 'Bootstrap');
  }
}

bootstrap();
