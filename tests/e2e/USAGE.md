# MCP协作测试使用指南

## 重要说明

这个测试框架设计用于在**Agent模式**下运行，因为需要访问MCP Puppeteer工具。

## 在Agent模式下使用

### 1. 更新 browser-helper.ts

在Agent模式下，`browser-helper.ts`中的MCP工具调用需要取消注释并实际调用。例如：

```typescript
// 在 browser-helper.ts 的 navigate 方法中
async navigate(url: string): Promise<void> {
  try {
    // 在Agent模式下，直接调用MCP工具
    await mcp_my-chrome_puppeteer_navigate({ url });
    console.log(`[Browser] 导航到: ${url}`);
  } catch (error) {
    console.error(`[Browser] 导航失败: ${error}`);
    throw error;
  }
}
```

### 2. 实际MCP工具调用

所有MCP工具调用应该使用以下格式：

- `mcp_my-chrome_puppeteer_navigate({ url })`
- `mcp_my-chrome_puppeteer_screenshot({ name, width, height, encoded })`
- `mcp_my-chrome_puppeteer_click({ selector })`
- `mcp_my-chrome_puppeteer_fill({ selector, value })`
- `mcp_my-chrome_puppeteer_select({ selector, value })`
- `mcp_my-chrome_puppeteer_hover({ selector })`
- `mcp_my-chrome_puppeteer_evaluate({ script })`

### 3. 运行测试

在Agent模式下，可以直接调用测试运行器：

```typescript
import { runAllTests } from './tests/e2e/runner';
await runAllTests();
```

或者运行特定测试套件：

```typescript
import { runTestSuite } from './tests/e2e/runner';
await runTestSuite('player');  // 或 'admin', 'integration'
```

## 测试流程

1. **切换到Agent模式**
2. **确保服务运行**: 确保玩家端、管理端和后端服务都在运行
3. **运行测试**: 调用测试运行器
4. **查看报告**: 在 `tests/reports/` 目录查看生成的Markdown报告

## 配置

测试配置可以通过环境变量或直接修改 `config/test-config.ts` 来调整。

## 注意事项

1. MCP工具只在Agent模式下可用
2. 确保MCP服务器（my-chrome）已正确配置并运行
3. 测试截图会保存在 `tests/screenshots/` 目录
4. 测试报告会保存在 `tests/reports/` 目录

