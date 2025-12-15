# MCP协作自动测试

这是AI客服系统的端到端功能测试套件，使用MCP Puppeteer工具进行浏览器自动化测试。

## 目录结构

```
tests/e2e/
├── config/              # 测试配置
│   ├── test-config.ts  # 测试配置（URL、账号、超时等）
│   └── selectors.ts    # CSS选择器定义
├── fixtures/           # 测试数据
│   └── test-data.ts    # 测试数据定义
├── helpers/            # 辅助函数
│   ├── browser-helper.ts    # 浏览器操作封装
│   ├── form-helper.ts       # 表单操作封装
│   ├── assertion-helper.ts  # 断言辅助函数
│   └── report-helper.ts     # 报告生成辅助
├── player/             # 玩家端测试
│   ├── identity-check.spec.ts
│   └── intake-form.spec.ts
├── admin/              # 后台管理端测试
│   ├── login.spec.ts
│   └── workbench.spec.ts
├── integration/        # 集成测试
│   └── player-to-agent.spec.ts
└── runner.ts           # 测试运行器
```

## 使用方法

### 在Agent模式下执行测试

1. **切换到Agent模式**
2. **运行测试**:
   ```typescript
   import { runAllTests } from './tests/e2e/runner';
   await runAllTests();
   ```

3. **查看报告**:
   测试报告会保存在 `tests/reports/` 目录下，文件名格式为 `[timestamp]-test-report.md`

### 运行特定测试套件

```typescript
import { runTestSuite } from './tests/e2e/runner';

// 运行玩家端测试
await runTestSuite('player');

// 运行后台管理端测试
await runTestSuite('admin');

// 运行集成测试
await runTestSuite('integration');
```

## 配置

测试配置在 `config/test-config.ts` 中，可以通过环境变量覆盖：

- `PLAYER_APP_URL`: 玩家端URL
- `ADMIN_PORTAL_URL`: 后台管理端URL
- `BACKEND_URL`: 后端API URL
- `ADMIN_USERNAME`: 管理员用户名
- `ADMIN_PASSWORD`: 管理员密码
- `AGENT_USERNAME`: 客服用户名
- `AGENT_PASSWORD`: 客服密码

## 注意事项

1. **环境依赖**: 确保所有服务正常运行
2. **测试数据**: 使用独立的测试数据，避免影响生产环境
3. **稳定性**: 测试中包含重试机制和适当的等待时间
4. **截图管理**: 测试截图保存在 `tests/screenshots/` 目录下

## 测试报告

测试报告包含：
- 测试概览（总数、通过、失败、跳过）
- 详细的测试结果（每个测试用例的状态、执行时间、截图、错误信息）
- 问题总结（按优先级分类）
- 修改建议

## 扩展测试

要添加新的测试用例：

1. 在相应的测试文件中添加新的测试函数
2. 在测试套件的运行函数中调用新测试
3. 确保测试结果被添加到报告中

示例：

```typescript
export async function testNewFeature(): Promise<TestResult> {
  const startTime = Date.now();
  const testName = '新功能测试';
  let screenshot: string | undefined;
  let error: string | undefined;

  try {
    // 测试逻辑
    screenshot = await browserHelper.screenshot({ name: 'new-feature' });
    // ...
    
    return {
      suite: '测试套件名称',
      name: testName,
      status: 'passed',
      duration: Date.now() - startTime,
      screenshot,
    };
  } catch (err: any) {
    error = err.message || String(err);
    return {
      suite: '测试套件名称',
      name: testName,
      status: 'failed',
      duration: Date.now() - startTime,
      screenshot,
      error,
      suggestions: ['建议1', '建议2'],
    };
  }
}
```

