# 需求文档

## 简介

当前 NestJS 项目使用了 Global Interceptor 统一封装响应，结构为 `{ code: number, message: string, data: T, timestamp: string }`。

**痛点**：
1. Swagger 文档中 "玩家端" 和 "管理端" 接口混杂，难以维护。
2. Swagger 生成的 Schema 是 "裸" DTO，缺少外层封装，导致 Apifox 自动化测试校验失败。

本次重构将把 Swagger 文档拆分为两个独立实例，并实现一个自定义装饰器来自动为响应 Schema 包裹统一的响应结构。

## 术语表

- **Swagger**: 通过 `@nestjs/swagger` 包集成到 NestJS 的 API 文档工具
- **DTO (数据传输对象)**: 定义 API 请求和响应数据结构的类
- **TransformInterceptor**: 全局 NestJS 拦截器，将所有 API 响应包装为统一结构
- **BaseResponse**: 表示统一 API 响应结构的泛型包装类 `{ code, message, data, timestamp }`
- **@ApiResult**: 自定义装饰器，用于将 BaseResponse 包装器应用到 Swagger 响应 Schema
- **玩家端 API**: 面向玩家应用的 API（公开端点）
- **管理端 API**: 面向管理后台的 API（需认证的端点）
- **DocumentBuilder**: NestJS Swagger 类，用于配置 Swagger 文档元数据

## 技术约束

- **Framework**: NestJS + `@nestjs/swagger`
- **Directory**: 新增文件必须放置在 `src/common` 目录下
- **Non-destructive**: 禁止修改 Service 层业务逻辑，仅修改 `main.ts` 和 Controller 层的装饰器

## 需求

### 需求 1: 文档拆分 (Split Documentation)

**用户故事:** 作为开发者，我希望能够访问独立的玩家端和管理端 Swagger 文档，以便能够轻松找到和测试相关端点而不会混淆。

#### 验收标准

1. WHEN 开发者访问 `/api/docs/admin` THEN Swagger_System SHALL 仅显示管理端相关的 API 端点
2. WHEN 生成管理端 Swagger 文档 THEN Swagger_System SHALL 包含路由路径以 `/admin` 开头或 `@ApiTags` 以 `Admin` 开头的接口
3. WHEN 生成管理端 Swagger 文档 THEN Swagger_System SHALL 启用 `.addBearerAuth()` 认证配置
4. WHEN 开发者访问 `/api/docs/player` THEN Swagger_System SHALL 仅显示玩家端相关的 API 端点
5. WHEN 生成玩家端 Swagger 文档 THEN Swagger_System SHALL 包含路由路径以 `/app` 或 `/client` 开头或 `@ApiTags` 以 `App` 开头的接口
6. WHEN 访问任一 Swagger 文档 THEN Swagger_System SHALL 保留所有现有的全局配置，包括 ValidationPipe、Cors 和 GlobalPrefix 设置

### 需求 2: 响应封装 (Generic Response Wrapper)

**用户故事:** 作为开发者，我希望 Swagger 响应 Schema 能够正确显示 `{ code, message, data, timestamp }` 的嵌套结构，以便自动化测试工具能够正确验证响应。

#### 验收标准

1. WHEN 定义 BaseResponse DTO THEN Swagger_System SHALL 在 `src/common/dto/base-response.dto.ts` 创建泛型类 `BaseResponse<T>`
2. WHEN 定义 BaseResponse DTO THEN Swagger_System SHALL 包含 `code` 属性（类型 number，示例值 200）
3. WHEN 定义 BaseResponse DTO THEN Swagger_System SHALL 包含 `message` 属性（类型 string，示例值 "success"）
4. WHEN 定义 BaseResponse DTO THEN Swagger_System SHALL 包含 `timestamp` 属性（类型 string）
5. WHEN 定义 BaseResponse DTO THEN Swagger_System SHALL 包含 `data` 属性作为泛型 T，且不直接应用 `@ApiProperty` 装饰器
6. WHEN 创建 `@ApiResult` 装饰器 THEN Swagger_System SHALL 在 `src/common/decorators/api-result.decorator.ts` 实现函数 `ApiResult<TModel extends Type<any>>(model: TModel, isArray?: boolean)`
7. WHEN 应用 `@ApiResult` 装饰器 THEN Swagger_System SHALL 使用 `ApiExtraModels(BaseResponse, model)` 注册 Schema
8. WHEN 应用 `@ApiResult` 装饰器 THEN Swagger_System SHALL 使用 `ApiOkResponse` 配合 `allOf` 组合 BaseResponse 和泛型 data
9. WHEN `@ApiResult` 装饰器接收 `isArray: true` THEN Swagger_System SHALL 将 `data` Schema 类型设为 `array`，items 引用传入的 model

### 需求 3: 应用示例 (Implementation Example)

**用户故事:** 作为开发者，我希望将新的响应包装装饰器应用到现有控制器，以便验证新装饰器是否有效且文档能够准确反映 API 行为。

#### 验收标准

1. WHEN `@ApiResult` 装饰器替换 AuthController 上的 `@ApiResponse` THEN Swagger_System SHALL 显示包装后的响应 Schema
2. WHEN 装饰器应用到 login 端点 THEN Swagger_System SHALL 显示 `@ApiResult(LoginResponseDto)` 包装的响应结构
3. WHEN 应用新装饰器 THEN TypeScript_Compiler SHALL 无类型错误
4. WHEN 服务层的现有业务逻辑保持不变 THEN API_System SHALL 继续以与重构前相同的方式运行
