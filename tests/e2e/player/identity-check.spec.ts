/**
 * 身份验证页面测试
 */

import { browserHelper } from '../helpers/browser-helper';
import { fillIdentityForm, submitIdentityForm } from '../helpers/form-helper';
import { assertElementVisible, assertUrlContains, assertErrorMessage } from '../helpers/assertion-helper';
import { reportHelper, TestResult } from '../helpers/report-helper';
import { testConfig } from '../config/test-config';
import { PlayerSelectors } from '../config/selectors';
import { defaultIdentityData } from '../fixtures/test-data';

/**
 * 测试：页面加载
 */
export async function testPageLoad(): Promise<TestResult> {
  const startTime = Date.now();
  const testName = '页面加载测试';
  let screenshot: string | undefined;
  let error: string | undefined;

  try {
    // 导航到身份验证页面
    await browserHelper.navigate(testConfig.urls.playerApp);
    
    // 截图
    screenshot = await browserHelper.screenshot({ name: 'identity-check-page-load' });
    
    // 验证页面元素
    await assertElementVisible(PlayerSelectors.identityCheck.formCard);
    
    // 验证游戏选择框
    await assertElementVisible(PlayerSelectors.identityCheck.gameSelect);
    
    // 验证区服输入框
    await assertElementVisible(PlayerSelectors.identityCheck.serverInput);
    
    // 验证角色ID输入框
    await assertElementVisible(PlayerSelectors.identityCheck.playerIdInput);
    
    // 验证问题类型选择框
    await assertElementVisible(PlayerSelectors.identityCheck.issueTypeSelect);
    
    // 验证下一步按钮
    await assertElementVisible(PlayerSelectors.identityCheck.nextButton);

    const duration = Date.now() - startTime;
    return {
      suite: '玩家端 - 身份验证',
      name: testName,
      status: 'passed',
      duration,
      screenshot,
    };
  } catch (err: any) {
    error = err.message || String(err);
    const duration = Date.now() - startTime;
    return {
      suite: '玩家端 - 身份验证',
      name: testName,
      status: 'failed',
      duration,
      screenshot,
      error,
      suggestions: [
        '检查页面是否正确加载',
        '检查CSS选择器是否正确',
        '检查网络连接是否正常',
      ],
    };
  }
}

/**
 * 测试：游戏列表加载
 */
export async function testGameListLoad(): Promise<TestResult> {
  const startTime = Date.now();
  const testName = '游戏列表加载测试';
  let screenshot: string | undefined;
  let error: string | undefined;

  try {
    await browserHelper.navigate(testConfig.urls.playerApp);
    
    // 点击游戏选择框
    await browserHelper.click({
      selector: PlayerSelectors.identityCheck.gameSelect,
      waitAfter: 1000,
    });
    
    screenshot = await browserHelper.screenshot({ name: 'game-list-loaded' });
    
    // 验证游戏选项出现
    const gameOptionsExist = await browserHelper.elementExists(PlayerSelectors.identityCheck.gameOption);
    if (!gameOptionsExist) {
      throw new Error('游戏选项未出现');
    }

    const duration = Date.now() - startTime;
    return {
      suite: '玩家端 - 身份验证',
      name: testName,
      status: 'passed',
      duration,
      screenshot,
    };
  } catch (err: any) {
    error = err.message || String(err);
    const duration = Date.now() - startTime;
    return {
      suite: '玩家端 - 身份验证',
      name: testName,
      status: 'failed',
      duration,
      screenshot,
      error,
      suggestions: [
        '检查游戏数据是否正确加载',
        '检查API接口是否正常',
        '检查下拉框组件是否正常工作',
      ],
    };
  }
}

/**
 * 测试：表单验证
 */
export async function testFormValidation(): Promise<TestResult> {
  const startTime = Date.now();
  const testName = '表单验证测试';
  let screenshot: string | undefined;
  let error: string | undefined;

  try {
    await browserHelper.navigate(testConfig.urls.playerApp);
    
    // 直接点击提交按钮，不填写任何字段
    await browserHelper.click({
      selector: PlayerSelectors.identityCheck.nextButton,
      waitAfter: 1000,
    });
    
    screenshot = await browserHelper.screenshot({ name: 'form-validation' });
    
    // 验证错误提示出现（如果表单验证正常工作）
    // 注意：这里可能需要根据实际实现调整
    const hasError = await browserHelper.elementExists('.ant-form-item-has-error');
    
    if (!hasError) {
      // 如果没有错误提示，这可能是一个问题
      throw new Error('表单验证未触发或错误提示未显示');
    }

    const duration = Date.now() - startTime;
    return {
      suite: '玩家端 - 身份验证',
      name: testName,
      status: 'passed',
      duration,
      screenshot,
    };
  } catch (err: any) {
    error = err.message || String(err);
    const duration = Date.now() - startTime;
    return {
      suite: '玩家端 - 身份验证',
      name: testName,
      status: 'failed',
      duration,
      screenshot,
      error,
      suggestions: [
        '检查表单验证规则是否正确配置',
        '检查错误提示是否正确显示',
        '检查必填字段标记是否正确',
      ],
    };
  }
}

/**
 * 测试：正常表单提交
 */
export async function testFormSubmit(): Promise<TestResult> {
  const startTime = Date.now();
  const testName = '正常表单提交测试';
  let screenshot: string | undefined;
  let error: string | undefined;

  try {
    await browserHelper.navigate(testConfig.urls.playerApp);
    
    // 填写表单
    await fillIdentityForm(defaultIdentityData);
    
    screenshot = await browserHelper.screenshot({ name: 'form-filled' });
    
    // 提交表单
    await submitIdentityForm();
    
    // 等待页面跳转或加载
    await browserHelper.wait({ time: 2000 });
    
    screenshot = await browserHelper.screenshot({ name: 'after-submit' });
    
    // 验证URL变化（应该跳转到问题反馈表单页面）
    const currentUrl = await browserHelper.getCurrentUrl();
    if (!currentUrl.includes('/intake-form') && !currentUrl.includes('/queue')) {
      throw new Error(`页面未正确跳转，当前URL: ${currentUrl}`);
    }

    const duration = Date.now() - startTime;
    return {
      suite: '玩家端 - 身份验证',
      name: testName,
      status: 'passed',
      duration,
      screenshot,
    };
  } catch (err: any) {
    error = err.message || String(err);
    const duration = Date.now() - startTime;
    return {
      suite: '玩家端 - 身份验证',
      name: testName,
      status: 'failed',
      duration,
      screenshot,
      error,
      suggestions: [
        '检查表单提交逻辑是否正确',
        '检查路由跳转是否正确',
        '检查后端API是否正常响应',
        '检查问题类型配置是否正确',
      ],
    };
  }
}

/**
 * 运行所有身份验证测试
 */
export async function runIdentityCheckTests(): Promise<TestResult[]> {
  console.log('[Test] 开始运行身份验证页面测试...');
  
  const results: TestResult[] = [];
  
  // 运行各个测试
  results.push(await testPageLoad());
  results.push(await testGameListLoad());
  results.push(await testFormValidation());
  results.push(await testFormSubmit());
  
  // 添加到报告
  for (const result of results) {
    reportHelper.addResult(result);
  }
  
  console.log(`[Test] 身份验证页面测试完成: ${results.filter(r => r.status === 'passed').length}/${results.length} 通过`);
  
  return results;
}

