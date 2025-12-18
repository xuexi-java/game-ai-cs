import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { MetricsInterceptor } from './common/interceptors/metrics.interceptor';
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

  // 全局 Metrics 拦截器
  app.useGlobalInterceptors(new MetricsInterceptor());

  // CORS 配置 - 同时兼容 .env 中的 FRONTEND_URL 和默认本地域名
  const defaultOrigins =
    process.env.NODE_ENV === 'production'
      ? []
      : [
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

  // Swagger 配置：管理端 / 玩家端 两份文档，按是否需要鉴权过滤
  const buildDoc = (title: string, description: string) =>
    new DocumentBuilder()
      .setTitle(title)
      .setDescription(description)
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
        'JWT-auth',
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

  const filterPaths = (
    paths: Record<string, any>,
    predicate: (operation: any) => boolean,
  ) => {
    const result: Record<string, any> = {};
    Object.entries(paths || {}).forEach(([path, pathItem]) => {
      const filteredPathItem: Record<string, any> = {};
      Object.entries(pathItem as Record<string, any>).forEach(
        ([method, operation]) => {
          if (predicate(operation)) {
            filteredPathItem[method] = operation;
          }
        },
      );
      if (Object.keys(filteredPathItem).length > 0) {
        result[path] = filteredPathItem;
      }
    });
    return result;
  };

  // 管理端：仅保留需要鉴权的接口（operation.security 存在且非空）
  const adminConfig = buildDoc('AI客服系统 - 管理端API', 'AI客服系统管理端后端API文档（需要认证）');
  const adminDocument = SwaggerModule.createDocument(app, adminConfig, {
    operationIdFactory: (controllerKey: string, methodKey: string) =>
      `${controllerKey}_${methodKey}`,
  });
  const adminFilteredDocument = {
    ...adminDocument,
    paths: filterPaths(
      adminDocument.paths,
      (operation) => operation.security && operation.security.length > 0,
    ),
  };
  SwaggerModule.setup('api/v1/docs/admin', app, adminFilteredDocument, {
    swaggerOptions: {
      persistAuthorization: true,
      tagsSorter: 'alpha',
      operationsSorter: 'alpha',
    },
  });

  // 玩家端：仅保留无需鉴权的接口（无 security 或空数组）
  const playerConfig = buildDoc('AI客服系统 - 玩家端API', 'AI客服系统玩家端后端API文档（无需认证）');
  const playerDocument = SwaggerModule.createDocument(app, playerConfig, {
    operationIdFactory: (controllerKey: string, methodKey: string) =>
      `${controllerKey}_${methodKey}`,
  });
  const playerFilteredDocument = {
    ...playerDocument,
    paths: filterPaths(
      playerDocument.paths,
      (operation) => !operation.security || operation.security.length === 0,
    ),
  };
  SwaggerModule.setup('api/v1/docs/player', app, playerFilteredDocument, {
    swaggerOptions: {
      tagsSorter: 'alpha',
      operationsSorter: 'alpha',
    },
  });

  const port = process.env.PORT || 21101;
  await app.listen(port);
  // 使用环境变量或默认值构建 baseUrl（用于日志输出）
  const host = process.env.HOST || 'localhost';
  const protocol = process.env.NODE_ENV === 'production' ? 'https' : 'http';
  const baseUrl = `${protocol}://${host}:${port}`;
// 将这三行替换为正确的中文
logger.log(`🚀 后端服务运行在 ${baseUrl}`, 'Bootstrap');

logger.log(
  `📚 Swagger 管理端文档: ${baseUrl}/api/v1/docs/admin`,
  'Bootstrap',
);

logger.log(
  `📚 Swagger 玩家端文档: ${baseUrl}/api/v1/docs/player`,
  'Bootstrap',
);

  // 恢复队列数据到 Redis（如果 Redis 可用）
  try {
    const queueService = app.get(QueueService);
    await queueService.recoverQueueFromDatabase();
  } catch (error) {
    logger.warn(`恢复队列数据失败: ${error.message}`, 'Bootstrap');
  }
}

bootstrap();
