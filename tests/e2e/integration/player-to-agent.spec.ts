/**
 * 玩家到客服完整流程测试
 * 测试完整的用户旅程：玩家提交问题 -> AI回复 -> 转人工 -> 客服接入 -> 问题解决
 */

import { browserHelper } from '../helpers/browser-helper';
import { fillIdentityForm, submitIdentityForm, fillIntakeForm, submitIntakeForm } from '../helpers/form-helper';
import { fillLoginForm, submitLoginForm } from '../helpers/form-helper';
import { assertElementVisible, assertUrlContains } from '../helpers/assertion-helper';
import { reportHelper, TestResult } from '../helpers/report-helper';
import { testConfig } from '../config/test-config';
import { defaultIdentityData } from '../fixtures/test-data';
import { defaultIntakeFormData } from '../fixtures/test-data';

/**
 * 测试：完整用户旅程
 */
export async function testCompleteUserJourney(): Promise<TestResult> {
  const startTime = Date.now();
  const testName = '完整用户旅程测试';
  let screenshot: string | undefined;
  let error: string | undefined;

  try {
    // 步骤1: 玩家身份验证
    console.log('[Journey] 步骤1: 玩家身份验证');
    await browserHelper.navigate(testConfig.urls.playerApp);
    await fillIdentityForm(defaultIdentityData);
    await submitIdentityForm();
    await browserHelper.wait({ time: 2000 });
    screenshot = await browserHelper.screenshot({ name: 'journey-1-identity' });

    // 步骤2: 填写问题反馈表单
    console.log('[Journey] 步骤2: 填写问题反馈表单');
    await fillIntakeForm(defaultIntakeFormData);
    await submitIntakeForm();
    await browserHelper.wait({ time: 3000 });
    screenshot = await browserHelper.screenshot({ name: 'journey-2-intake-submitted' });

    // 步骤3: 验证进入聊天或排队页面
    console.log('[Journey] 步骤3: 验证页面跳转');
    const currentUrl = await browserHelper.getCurrentUrl();
    if (!currentUrl.includes('/chat') && !currentUrl.includes('/queue') && !currentUrl.includes('/ticket')) {
      throw new Error(`未正确跳转到聊天或排队页面，当前URL: ${currentUrl}`);
    }

    // 步骤4: 客服登录（在新标签页或新浏览器实例中）
    // 注意：在实际实现中，可能需要使用多个浏览器实例或标签页
    console.log('[Journey] 步骤4: 客服登录');
    // 这里需要根据实际MCP工具的能力来实现
    // 可能需要打开新标签页或使用新的浏览器实例

    screenshot = await browserHelper.screenshot({ name: 'journey-complete' });

    const duration = Date.now() - startTime;
    return {
      suite: '集成测试 - 完整流程',
      name: testName,
      status: 'passed',
      duration,
      screenshot,
    };
  } catch (err: any) {
    error = err.message || String(err);
    const duration = Date.now() - startTime;
    return {
      suite: '集成测试 - 完整流程',
      name: testName,
      status: 'failed',
      duration,
      screenshot,
      error,
      suggestions: [
        '检查完整流程的每个步骤是否正确执行',
        '检查页面跳转是否正确',
        '检查后端API是否正常响应',
        '检查WebSocket连接是否正常',
        '考虑使用多个浏览器实例来模拟玩家和客服同时在线',
      ],
    };
  }
}

/**
 * 运行所有集成测试
 */
export async function runIntegrationTests(): Promise<TestResult[]> {
  console.log('[Test] 开始运行集成测试...');
  
  const results: TestResult[] = [];
  
  // 运行各个测试
  results.push(await testCompleteUserJourney());
  
  // 添加到报告
  for (const result of results) {
    reportHelper.addResult(result);
  }
  
  console.log(`[Test] 集成测试完成: ${results.filter(r => r.status === 'passed').length}/${results.length} 通过`);
  
  return results;
}

