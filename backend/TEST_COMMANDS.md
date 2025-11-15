# 完整测试命令参考

## 📋 代码检查结果

✅ **Linter 检查**: 通过，无错误
⚠️ **依赖检查**: 需要先安装依赖（`npm install`）

## 🚀 完整测试命令列表

### 前置准备

```bash
# 1. 进入后端目录
cd backend

# 2. 安装依赖（如果还没有安装）
npm install
```

### 基础测试命令

#### 1. 运行所有单元测试
```bash
npm test
```
**说明**: 运行所有 `*.spec.ts` 测试文件

#### 2. 运行测试并查看覆盖率
```bash
npm run test:cov
```
**说明**: 
- 运行所有测试
- 生成覆盖率报告
- 报告位置: `coverage/lcov-report/index.html`

#### 3. 监听模式（开发推荐）
```bash
npm run test:watch
```
**说明**: 文件保存后自动重新运行相关测试

#### 4. 顺序运行测试（避免并发问题）
```bash
npm test -- --runInBand
```
**说明**: 顺序执行测试，避免文件锁定等问题

#### 5. 运行 E2E 测试
```bash
npm run test:e2e
```
**说明**: 
- 需要数据库服务运行
- 确保 Docker 容器已启动: `docker-compose up -d`

#### 6. 调试模式
```bash
npm run test:debug
```
**说明**: 使用 Node.js 调试器运行测试

### 运行特定测试

#### 运行单个测试文件
```bash
# 认证服务测试
npm test -- auth.service.spec.ts

# 游戏管理服务测试
npm test -- game.service.spec.ts

# 工单服务测试
npm test -- ticket.service.spec.ts

# 消息服务测试
npm test -- message.service.spec.ts

# 会话服务测试
npm test -- session.service.spec.ts

# 紧急规则服务测试
npm test -- urgency-rule.service.spec.ts

# Dify AI服务测试
npm test -- dify.service.spec.ts

# 满意度评价服务测试
npm test -- satisfaction.service.spec.ts

# 文件上传服务测试
npm test -- upload.service.spec.ts

# 应用控制器测试
npm test -- app.controller.spec.ts
```

#### 运行匹配模式的测试
```bash
# 运行所有包含 "auth" 的测试
npm test -- --testNamePattern="auth"

# 运行所有包含 "应该成功" 的测试
npm test -- --testNamePattern="应该成功"

# 运行特定模块的所有测试
npm test -- auth
npm test -- game
npm test -- ticket
```

#### 只运行失败的测试
```bash
npm test -- --onlyFailures
```

### 测试选项

#### 详细输出
```bash
npm test -- --verbose
```

#### 显示控制台输出
```bash
npm test -- --silent=false
```

#### 设置超时时间
```bash
npm test -- --testTimeout=10000
```

#### 限制并发数
```bash
npm test -- --maxWorkers=2
```

#### 更新快照
```bash
npm test -- -u
```

### 覆盖率相关命令

#### 生成覆盖率报告（HTML）
```bash
npm run test:cov
```
**查看报告**: 打开 `coverage/lcov-report/index.html`

#### 生成覆盖率报告（文本）
```bash
npm test -- --coverage --coverageReporters=text
```

#### 生成覆盖率报告（JSON）
```bash
npm test -- --coverage --coverageReporters=json
```

#### 只收集覆盖率，不运行测试
```bash
npm test -- --coverage --passWithNoTests
```

### 组合命令示例

#### 运行测试并生成详细覆盖率报告
```bash
npm test -- --coverage --verbose
```

#### 顺序运行测试并查看覆盖率
```bash
npm test -- --runInBand --coverage
```

#### 运行特定测试并查看覆盖率
```bash
npm test -- upload.service.spec.ts --coverage
```

#### 监听模式 + 覆盖率
```bash
npm run test:watch -- --coverage
```

## 📊 所有测试文件列表

当前项目包含以下测试文件（共 10 个）：

1. ✅ `src/app.controller.spec.ts` - 应用控制器测试
2. ✅ `src/auth/auth.service.spec.ts` - 认证服务测试（74个测试用例）
3. ✅ `src/game/game.service.spec.ts` - 游戏管理服务测试
4. ✅ `src/ticket/ticket.service.spec.ts` - 工单服务测试
5. ✅ `src/message/message.service.spec.ts` - 消息服务测试
6. ✅ `src/session/session.service.spec.ts` - 会话服务测试
7. ✅ `src/urgency-rule/urgency-rule.service.spec.ts` - 紧急规则服务测试
8. ✅ `src/dify/dify.service.spec.ts` - Dify AI服务测试
9. ✅ `src/satisfaction/satisfaction.service.spec.ts` - 满意度评价服务测试
10. ✅ `src/upload/upload.service.spec.ts` - 文件上传服务测试

## 🎯 推荐测试流程

### 开发时
```bash
# 1. 启动监听模式
npm run test:watch

# 2. 修改代码后，测试会自动运行
```

### 提交代码前
```bash
# 1. 运行所有测试
npm test

# 2. 检查覆盖率
npm run test:cov

# 3. 查看覆盖率报告
# 打开 coverage/lcov-report/index.html
```

### CI/CD 流程
```bash
# 1. 安装依赖
npm install

# 2. 运行测试并生成覆盖率
npm run test:cov

# 3. 检查覆盖率阈值（如果配置了）
```

## ⚠️ 常见问题解决

### 1. 依赖未安装
```bash
npm install
```

### 2. 测试超时
```bash
# 增加超时时间
npm test -- --testTimeout=30000
```

### 3. 文件锁定问题（Windows）
```bash
# 使用顺序模式
npm test -- --runInBand
```

### 4. 清除测试缓存
```bash
npm test -- --clearCache
```

## 📈 测试覆盖率目标

- **语句覆盖率**: > 80%
- **分支覆盖率**: > 75%
- **函数覆盖率**: > 80%
- **行覆盖率**: > 80%

## 🔍 查看测试结果

### 控制台输出
测试结果会直接显示在控制台，包括：
- ✅ 通过的测试
- ❌ 失败的测试
- ⏱️ 执行时间
- 📊 覆盖率统计

### HTML 报告
```bash
# 生成报告后
# Windows
start coverage/lcov-report/index.html

# Mac
open coverage/lcov-report/index.html

# Linux
xdg-open coverage/lcov-report/index.html
```

## 📝 测试文件命名规范

- 测试文件: `*.spec.ts`
- 位置: 与源文件同目录
- 示例: `auth.service.ts` → `auth.service.spec.ts`

## 🛠️ 调试测试

### 使用 VS Code 调试
1. 在测试文件中设置断点
2. 按 `F5` 启动调试
3. 选择 "Jest: Debug" 配置

### 使用命令行调试
```bash
npm run test:debug
```

然后在 Chrome 中打开 `chrome://inspect` 进行调试。

