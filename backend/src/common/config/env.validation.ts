import { plainToInstance } from 'class-transformer';
// 检查环境变量是否符合要求
import {
  IsNotEmpty,
  IsString,
  IsOptional,
  IsNumber,
  validateSync,
} from 'class-validator';

// 定义环境变量类
class EnvironmentVariables {
  @IsNotEmpty()
  @IsString()
  DATABASE_URL: string;

  @IsNotEmpty()
  @IsString()
  JWT_SECRET: string;

  @IsOptional()
  @IsString()
  JWT_EXPIRES_IN?: string;

  @IsOptional()
  @IsNumber()
  PORT?: number;

  @IsOptional()
  @IsString()
  NODE_ENV?: string;

  @IsOptional()
  @IsString()
  FRONTEND_URL?: string;

  @IsOptional()
  @IsString()
  REDIS_URL?: string;

  @IsOptional()
  @IsString()
  UPLOAD_DIR?: string;

  @IsOptional()
  @IsNumber()
  MAX_FILE_SIZE?: number;
}

// 验证环境变量
// 参数：config - 环境变量对象
// 返回：验证后的环境变量对象
export function validate(config: Record<string, unknown>) {
  // 将环境变量对象转换为 EnvironmentVariables 类实例
  const validatedConfig = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });

  const errors = validateSync(validatedConfig, {
    skipMissingProperties: false,
  });

  if (errors.length > 0) {
    throw new Error(
      `环境变量验证失败:\n${errors
        .map(
          (e) =>
            `- ${e.property}: ${Object.values(e.constraints || {}).join(', ')}`,
        )
        .join('\n')}`,
    );
  }

  return validatedConfig;
}
