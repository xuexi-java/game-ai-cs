# 测试文档

## 目录

- [快速开始](#快速开始)
- [测试类型](#测试类型)
- [测试文件结构](#测试文件结构)
- [运行测试](#运行测试)
- [编写测试](#编写测试)
- [测试覆盖率](#测试覆盖率)
- [常见问题](#常见问题)

## 快速开始

### 1. 安装依赖

```bash
cd backend
npm install
```

### 2. 运行所有测试

```bash
npm test
```

### 3. 查看测试覆盖率

```bash
npm run test:cov
```

## 测试类型

### 单元测试（Unit Tests）

单元测试针对单个服务或模块进行测试，使用 Mock 隔离外部依赖。

**位置**: `src/**/*.spec.ts`

**运行命令**:
```bash
npm test
```

**示例测试文件**:
- `src/auth/auth.service.spec.ts` - 认证服务单元测试
- `src/game/game.service.spec.ts` - 游戏管理服务单元测试
- `src/ticket/ticket.service.spec.ts` - 工单服务单元测试

### E2E 测试（End-to-End Tests）

E2E 测试测试完整的应用流程，需要运行数据库和所有服务。

**位置**: `test/**/*.e2e-spec.ts`

**运行命令**:
```bash
npm run test:e2e
```

**注意**: E2E 测试需要数据库服务运行，确保 Docker 容器已启动：
```bash
docker-compose up -d
```

## 测试文件结构

```
backend/
├── src/
│   ├── auth/
│   │   ├── auth.service.ts
│   │   └── auth.service.spec.ts      # 单元测试
│   ├── game/
│   │   ├── game.service.ts
│   │   └── game.service.spec.ts      # 单元测试
│   └── ...
└── test/
    └── app.e2e-spec.ts                # E2E 测试
```

## 运行测试

### 基本命令

```bash
# 运行所有单元测试
npm test

# 运行测试并查看覆盖率
npm run test:cov

# 监听模式（文件变化时自动运行）
npm run test:watch

# 运行 E2E 测试
npm run test:e2e

# 调试模式
npm run test:debug
```

### 运行特定测试

```bash
# 运行单个测试文件
npm test -- auth.service.spec.ts

# 运行匹配名称的测试
npm test -- --testNamePattern="should login"

# 运行特定模块的所有测试
npm test -- auth

# 只运行失败的测试
npm test -- --onlyFailures
```

### 测试选项

```bash
# 详细输出
npm test -- --verbose

# 显示控制台输出
npm test -- --silent=false

# 设置超时时间（毫秒）
npm test -- --testTimeout=10000

# 最大并发数
npm test -- --maxWorkers=2
```

## 编写测试

### 测试文件模板

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { YourService } from './your.service';
import { PrismaService } from '../prisma/prisma.service';

describe('YourService', () => {
  let service: YourService;
  let prismaService: PrismaService;

  // Mock 依赖服务
  const mockPrismaService = {
    model: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        YourService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    service = module.get<YourService>(YourService);
    prismaService = module.get<PrismaService>(PrismaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('methodName', () => {
    it('应该成功执行操作', async () => {
      // Arrange: 准备测试数据
      const mockData = { id: '1', name: 'test' };
      mockPrismaService.model.findUnique.mockResolvedValue(mockData);

      // Act: 执行被测试的方法
      const result = await service.methodName('1');

      // Assert: 验证结果
      expect(result).toEqual(mockData);
      expect(mockPrismaService.model.findUnique).toHaveBeenCalledWith({
        where: { id: '1' },
      });
    });

    it('应该抛出异常当数据不存在', async () => {
      mockPrismaService.model.findUnique.mockResolvedValue(null);

      await expect(service.methodName('nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
```

### 测试命名规范

- 使用中文描述测试场景（符合项目规范）
- 格式：`应该[预期行为]当[条件]`
- 示例：
  - `应该成功创建用户当提供有效数据`
  - `应该抛出异常当用户不存在`
  - `应该返回空数组当没有数据`

### Mock 使用

#### Mock Prisma Service

```typescript
const mockPrismaService = {
  user: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
};
```

#### Mock 外部服务

```typescript
// Mock HTTP 请求
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

// Mock 配置服务
const mockConfigService = {
  get: jest.fn((key: string) => {
    const config = {
      JWT_SECRET: 'test-secret',
      JWT_EXPIRES_IN: '8h',
    };
    return config[key];
  }),
};
```

### 测试异步操作

```typescript
it('应该处理异步操作', async () => {
  const promise = service.asyncMethod();
  
  // 等待异步操作完成
  await expect(promise).resolves.toBeDefined();
  
  // 或者使用 try-catch
  try {
    const result = await service.asyncMethod();
    expect(result).toBeDefined();
  } catch (error) {
    fail('不应该抛出异常');
  }
});
```

### 测试异常情况

```typescript
it('应该抛出异常当条件不满足', async () => {
  mockPrismaService.user.findUnique.mockResolvedValue(null);

  await expect(service.getUser('nonexistent')).rejects.toThrow(
    NotFoundException,
  );
  
  // 或者验证异常消息
  await expect(service.getUser('nonexistent')).rejects.toThrow(
    '用户不存在',
  );
});
```

## 测试覆盖率

### 查看覆盖率报告

```bash
npm run test:cov
```

覆盖率报告会生成在 `coverage/` 目录：
- `coverage/lcov-report/index.html` - HTML 报告（在浏览器中打开）
- `coverage/lcov.info` - LCOV 格式报告

### 覆盖率目标

| 指标 | 目标 | 当前 |
|------|------|------|
| 语句覆盖率 | > 80% | - |
| 分支覆盖率 | > 75% | - |
| 函数覆盖率 | > 80% | - |
| 行覆盖率 | > 80% | - |

### 排除文件

在 `package.json` 的 `jest` 配置中可以排除不需要测试的文件：

```json
{
  "jest": {
    "collectCoverageFrom": [
      "**/*.(t|j)s",
      "!**/*.spec.ts",
      "!**/*.interface.ts",
      "!**/node_modules/**"
    ]
  }
}
```

## 常见问题

### 1. 测试失败：找不到模块

**问题**: `Cannot find module 'xxx'`

**解决方案**:
```bash
# 重新安装依赖
npm install

# 清理 node_modules 并重新安装
rm -rf node_modules package-lock.json
npm install
```

### 2. 测试超时

**问题**: `Timeout - Async callback was not invoked`

**解决方案**:
- 检查所有异步操作是否使用了 `await`
- 增加超时时间：`jest.setTimeout(10000)`
- 确保所有 Promise 都被正确处理

### 3. Mock 不生效

**问题**: Mock 函数没有被调用或返回错误值

**解决方案**:
- 确保在 `beforeEach` 中正确设置 mock
- 在 `afterEach` 中使用 `jest.clearAllMocks()` 清理
- 检查 mock 的返回值类型是否正确

### 4. 数据库连接错误（E2E测试）

**问题**: `Can't reach database server`

**解决方案**:
```bash
# 检查 Docker 容器状态
docker-compose ps

# 启动数据库服务
docker-compose up -d

# 检查数据库连接
docker-compose exec postgres psql -U postgres -d game_ai_cs
```

### 5. TypeScript 类型错误

**问题**: 测试文件中的类型错误

**解决方案**:
- 确保安装了所有 `@types/*` 包
- 检查 `tsconfig.json` 配置
- 使用 `as any` 临时绕过类型检查（不推荐，仅用于测试）

### 6. 测试运行缓慢

**问题**: 测试执行时间过长

**解决方案**:
- 使用 `--maxWorkers` 限制并发数
- 优化测试，减少不必要的数据库操作
- 使用更快的 Mock 替代真实数据库操作

## 测试最佳实践

1. **保持测试独立**: 每个测试应该可以独立运行，不依赖其他测试
2. **使用描述性名称**: 测试名称应该清楚说明测试的内容和预期结果
3. **测试边界情况**: 包括正常情况、异常情况和边界值
4. **保持测试简洁**: 每个测试只验证一个功能点
5. **使用 Mock**: 隔离外部依赖，提高测试速度和可靠性
6. **定期运行测试**: 在提交代码前运行测试，确保没有破坏现有功能
7. **维护测试代码**: 测试代码应该和生产代码一样保持整洁和可维护

## 参考资源

- [Jest 文档](https://jestjs.io/docs/getting-started)
- [NestJS 测试文档](https://docs.nestjs.com/fundamentals/testing)
- [Prisma 测试指南](https://www.prisma.io/docs/guides/testing)

