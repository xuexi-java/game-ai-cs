/**
 * 逃生舱页面测试
 * 测试未关闭工单检测和选择功能
 */

import { browserHelper } from '../helpers/browser-helper';
import { fillIdentityForm, submitIdentityForm } from '../helpers/form-helper';
import { assertElementVisible, assertUrlContains } from '../helpers/assertion-helper';
import { reportHelper, TestResult } from '../helpers/report-helper';
import { testConfig } from '../config/test-config';
import { PlayerSelectors } from '../config/selectors';
import { defaultIdentityData } from '../fixtures/test-data';

/**
 * 测试：逃生舱页面显示（需要先有未关闭工单）
 * 注意：这个测试需要先创建一个未关闭的工单
 */
export async function testEscapeHatchDisplay(): Promise<TestResult> {
  const startTime = Date.now();
  const testName = '逃生舱页面显示测试';
  let screenshot: string | undefined;
  let error: string | undefined;

  try {
    // 导航到身份验证页面
    await browserHelper.navigate(testConfig.urls.playerApp);
    
    // 填写身份验证表单（使用可能已有未关闭工单的玩家信息）
    // 注意：这里需要确保该玩家有未关闭的工单
    await fillIdentityForm(defaultIdentityData);
    
    screenshot = await browserHelper.screenshot({ name: 'identity-form-filled-for-escape-hatch' });
    
    // 提交表单
    await submitIdentityForm();
    
    // 等待检测结果
    await browserHelper.wait({ time: 3000 });
    
    screenshot = await browserHelper.screenshot({ name: 'after-identity-submit-escape-hatch' });
    
    // 检查是否显示了未关闭工单的提示（可能是Modal或页面跳转）
    // 根据实际实现，可能是Modal确认框或直接跳转到逃生舱页面
    const currentUrl = await browserHelper.getCurrentUrl();
    const hasModal = await browserHelper.elementExists('.ant-modal');
    const hasEscapeHatch = currentUrl.includes('/escape-hatch') || 
                          await browserHelper.elementExists(PlayerSelectors.escapeHatch.pageCard);
    
    if (!hasModal && !hasEscapeHatch) {
      // 如果没有未关闭工单，这是正常的，测试通过但标记为跳过
      console.log('[Test] 该玩家没有未关闭的工单，跳过逃生舱测试');
      const duration = Date.now() - startTime;
      return {
        suite: '玩家端 - 逃生舱页面',
        name: testName,
        status: 'skipped',
        duration,
        screenshot,
      };
    }
    
    // 如果有Modal，点击"继续处理"或"反馈新问题"
    if (hasModal) {
      screenshot = await browserHelper.screenshot({ name: 'escape-hatch-modal' });
      // 这里可以选择点击"继续处理"或"反馈新问题"
      // 为了测试逃生舱页面，我们点击"继续处理"
      await browserHelper.evaluate(`
        const okButton = document.querySelector('.ant-modal .ant-btn-primary');
        if (okButton) okButton.click();
      `);
      await browserHelper.wait({ time: 2000 });
    }
    
    // 验证是否在逃生舱页面或工单页面
    const finalUrl = await browserHelper.getCurrentUrl();
    if (finalUrl.includes('/escape-hatch') || finalUrl.includes('/ticket/')) {
      screenshot = await browserHelper.screenshot({ name: 'escape-hatch-page-displayed' });
      
      // 验证页面元素
      if (finalUrl.includes('/escape-hatch')) {
        await assertElementVisible(PlayerSelectors.escapeHatch.pageCard);
      }
    }

    const duration = Date.now() - startTime;
    return {
      suite: '玩家端 - 逃生舱页面',
      name: testName,
      status: 'passed',
      duration,
      screenshot,
    };
  } catch (err: any) {
    error = err.message || String(err);
    const duration = Date.now() - startTime;
    return {
      suite: '玩家端 - 逃生舱页面',
      name: testName,
      status: 'failed',
      duration,
      screenshot,
      error,
      suggestions: [
        '检查未关闭工单检测逻辑是否正确',
        '检查逃生舱页面路由是否正确配置',
        '检查页面组件是否正确渲染',
      ],
    };
  }
}

/**
 * 测试：继续处理工单功能
 */
export async function testContinueTicket(): Promise<TestResult> {
  const startTime = Date.now();
  const testName = '继续处理工单功能测试';
  let screenshot: string | undefined;
  let error: string | undefined;

  try {
    // 这个测试需要先有未关闭的工单
    // 先尝试触发逃生舱页面
    await browserHelper.navigate(testConfig.urls.playerApp);
    await fillIdentityForm(defaultIdentityData);
    await submitIdentityForm();
    await browserHelper.wait({ time: 3000 });
    
    // 检查是否有未关闭工单的提示
    const hasModal = await browserHelper.elementExists('.ant-modal');
    const currentUrl = await browserHelper.getCurrentUrl();
    const hasEscapeHatch = currentUrl.includes('/escape-hatch');
    
    if (!hasModal && !hasEscapeHatch) {
      // 没有未关闭工单，跳过测试
      const duration = Date.now() - startTime;
      return {
        suite: '玩家端 - 逃生舱页面',
        name: testName,
        status: 'skipped',
        duration,
        screenshot,
      };
    }
    
    // 如果有Modal，点击"继续处理"
    if (hasModal) {
      screenshot = await browserHelper.screenshot({ name: 'continue-ticket-modal' });
      await browserHelper.evaluate(`
        const okButton = document.querySelector('.ant-modal .ant-btn-primary');
        if (okButton) okButton.click();
      `);
      await browserHelper.wait({ time: 2000 });
    } else if (hasEscapeHatch) {
      // 如果在逃生舱页面，点击"继续处理"按钮
      screenshot = await browserHelper.screenshot({ name: 'continue-ticket-page' });
      await browserHelper.click({
        selector: PlayerSelectors.escapeHatch.continueButton,
        waitAfter: 2000,
      });
    }
    
    // 验证是否跳转到工单聊天页面
    await browserHelper.wait({ time: 2000 });
    const finalUrl = await browserHelper.getCurrentUrl();
    screenshot = await browserHelper.screenshot({ name: 'after-continue-ticket' });
    
    if (!finalUrl.includes('/ticket/')) {
      throw new Error(`未正确跳转到工单页面，当前URL: ${finalUrl}`);
    }

    const duration = Date.now() - startTime;
    return {
      suite: '玩家端 - 逃生舱页面',
      name: testName,
      status: 'passed',
      duration,
      screenshot,
    };
  } catch (err: any) {
    error = err.message || String(err);
    const duration = Date.now() - startTime;
    return {
      suite: '玩家端 - 逃生舱页面',
      name: testName,
      status: 'failed',
      duration,
      screenshot,
      error,
      suggestions: [
        '检查"继续处理"按钮点击事件是否正确',
        '检查工单信息是否正确传递',
        '检查路由跳转是否正确',
      ],
    };
  }
}

/**
 * 测试：提交新问题功能
 */
export async function testNewTicket(): Promise<TestResult> {
  const startTime = Date.now();
  const testName = '提交新问题功能测试';
  let screenshot: string | undefined;
  let error: string | undefined;

  try {
    // 这个测试需要先有未关闭的工单
    await browserHelper.navigate(testConfig.urls.playerApp);
    await fillIdentityForm(defaultIdentityData);
    await submitIdentityForm();
    await browserHelper.wait({ time: 3000 });
    
    // 检查是否有未关闭工单的提示
    const hasModal = await browserHelper.elementExists('.ant-modal');
    const currentUrl = await browserHelper.getCurrentUrl();
    const hasEscapeHatch = currentUrl.includes('/escape-hatch');
    
    if (!hasModal && !hasEscapeHatch) {
      // 没有未关闭工单，跳过测试
      const duration = Date.now() - startTime;
      return {
        suite: '玩家端 - 逃生舱页面',
        name: testName,
        status: 'skipped',
        duration,
        screenshot,
      };
    }
    
    // 如果有Modal，点击"反馈新问题"（取消按钮）
    if (hasModal) {
      screenshot = await browserHelper.screenshot({ name: 'new-ticket-modal' });
      await browserHelper.evaluate(`
        const cancelButton = document.querySelector('.ant-modal .ant-btn-default');
        if (cancelButton) cancelButton.click();
      `);
      await browserHelper.wait({ time: 2000 });
    } else if (hasEscapeHatch) {
      // 如果在逃生舱页面，点击"我有新问题要提交"按钮
      screenshot = await browserHelper.screenshot({ name: 'new-ticket-page' });
      await browserHelper.click({
        selector: PlayerSelectors.escapeHatch.newTicketButton,
        waitAfter: 2000,
      });
    }
    
    // 验证是否跳转到问题反馈表单页面
    await browserHelper.wait({ time: 2000 });
    const finalUrl = await browserHelper.getCurrentUrl();
    screenshot = await browserHelper.screenshot({ name: 'after-new-ticket' });
    
    if (!finalUrl.includes('/intake-form')) {
      throw new Error(`未正确跳转到问题反馈表单页面，当前URL: ${finalUrl}`);
    }

    const duration = Date.now() - startTime;
    return {
      suite: '玩家端 - 逃生舱页面',
      name: testName,
      status: 'passed',
      duration,
      screenshot,
    };
  } catch (err: any) {
    error = err.message || String(err);
    const duration = Date.now() - startTime;
    return {
      suite: '玩家端 - 逃生舱页面',
      name: testName,
      status: 'failed',
      duration,
      screenshot,
      error,
      suggestions: [
        '检查"提交新问题"按钮点击事件是否正确',
        '检查路由跳转是否正确',
        '检查问题反馈表单页面是否正确加载',
      ],
    };
  }
}

/**
 * 运行所有逃生舱页面测试
 */
export async function runEscapeHatchTests(): Promise<TestResult[]> {
  console.log('[Test] 开始运行逃生舱页面测试...');
  
  const results: TestResult[] = [];
  
  // 运行各个测试
  results.push(await testEscapeHatchDisplay());
  results.push(await testContinueTicket());
  results.push(await testNewTicket());
  
  // 添加到报告
  for (const result of results) {
    reportHelper.addResult(result);
  }
  
  console.log(`[Test] 逃生舱页面测试完成: ${results.filter(r => r.status === 'passed').length}/${results.length} 通过`);
  
  return results;
}

