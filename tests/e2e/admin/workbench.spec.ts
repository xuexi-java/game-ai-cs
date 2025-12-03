/**
 * 客服工作台测试
 */

import { browserHelper } from '../helpers/browser-helper';
import { fillLoginForm, submitLoginForm } from '../helpers/form-helper';
import { assertElementVisible } from '../helpers/assertion-helper';
import { reportHelper, TestResult } from '../helpers/report-helper';
import { testConfig } from '../config/test-config';
import { AdminSelectors } from '../config/selectors';

/**
 * 登录为客服
 */
async function loginAsAgent(): Promise<void> {
  await browserHelper.navigate(testConfig.urls.adminPortal);
  await fillLoginForm(
    testConfig.accounts.agent.username,
    testConfig.accounts.agent.password
  );
  await submitLoginForm();
  await browserHelper.wait({ time: 3000 });
}

/**
 * 测试：工作台页面加载
 */
export async function testWorkbenchPageLoad(): Promise<TestResult> {
  const startTime = Date.now();
  const testName = '工作台页面加载测试';
  let screenshot: string | undefined;
  let error: string | undefined;

  try {
    await loginAsAgent();
    
    screenshot = await browserHelper.screenshot({ name: 'workbench-page-load' });
    
    // 验证工作台元素
    // 注意：这里的选择器可能需要根据实际实现调整
    const hasSessionList = await browserHelper.elementExists(AdminSelectors.workbench.sessionList);
    
    if (!hasSessionList) {
      throw new Error('工作台页面元素未正确加载');
    }

    const duration = Date.now() - startTime;
    return {
      suite: '后台管理 - 工作台',
      name: testName,
      status: 'passed',
      duration,
      screenshot,
    };
  } catch (err: any) {
    error = err.message || String(err);
    const duration = Date.now() - startTime;
    return {
      suite: '后台管理 - 工作台',
      name: testName,
      status: 'failed',
      duration,
      screenshot,
      error,
      suggestions: [
        '检查工作台页面是否正确加载',
        '检查会话列表是否正确显示',
        '检查WebSocket连接是否正常',
      ],
    };
  }
}

/**
 * 运行所有工作台测试
 */
export async function runWorkbenchTests(): Promise<TestResult[]> {
  console.log('[Test] 开始运行工作台测试...');
  
  const results: TestResult[] = [];
  
  // 运行各个测试
  results.push(await testWorkbenchPageLoad());
  
  // 添加到报告
  for (const result of results) {
    reportHelper.addResult(result);
  }
  
  console.log(`[Test] 工作台测试完成: ${results.filter(r => r.status === 'passed').length}/${results.length} 通过`);
  
  return results;
}

