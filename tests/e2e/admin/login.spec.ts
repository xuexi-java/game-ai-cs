/**
 * 后台管理登录测试
 */

import { browserHelper } from '../helpers/browser-helper';
import { fillLoginForm, submitLoginForm } from '../helpers/form-helper';
import { assertElementVisible, assertUrlContains, assertErrorMessage } from '../helpers/assertion-helper';
import { reportHelper, TestResult } from '../helpers/report-helper';
import { testConfig } from '../config/test-config';
import { AdminSelectors } from '../config/selectors';

/**
 * 测试：登录页面加载
 */
export async function testLoginPageLoad(): Promise<TestResult> {
  const startTime = Date.now();
  const testName = '登录页面加载测试';
  let screenshot: string | undefined;
  let error: string | undefined;

  try {
    await browserHelper.navigate(testConfig.urls.adminPortal);
    
    screenshot = await browserHelper.screenshot({ name: 'login-page-load' });
    
    // 验证页面元素
    await assertElementVisible(AdminSelectors.login.usernameInput);
    await assertElementVisible(AdminSelectors.login.passwordInput);
    await assertElementVisible(AdminSelectors.login.loginButton);

    const duration = Date.now() - startTime;
    return {
      suite: '后台管理 - 登录',
      name: testName,
      status: 'passed',
      duration,
      screenshot,
    };
  } catch (err: any) {
    error = err.message || String(err);
    const duration = Date.now() - startTime;
    return {
      suite: '后台管理 - 登录',
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
 * 测试：管理员登录
 */
export async function testAdminLogin(): Promise<TestResult> {
  const startTime = Date.now();
  const testName = '管理员登录测试';
  let screenshot: string | undefined;
  let error: string | undefined;

  try {
    await browserHelper.navigate(testConfig.urls.adminPortal);
    
    // 填写登录表单
    await fillLoginForm(
      testConfig.accounts.admin.username,
      testConfig.accounts.admin.password
    );
    
    screenshot = await browserHelper.screenshot({ name: 'login-form-filled' });
    
    // 提交登录
    await submitLoginForm();
    
    // 等待登录完成
    await browserHelper.wait({ time: 3000 });
    
    screenshot = await browserHelper.screenshot({ name: 'after-login' });
    
    // 验证URL变化（应该跳转到仪表盘）
    const currentUrl = await browserHelper.getCurrentUrl();
    if (currentUrl.includes('/login')) {
      throw new Error('登录失败，仍然在登录页面');
    }
    
    // 验证是否跳转到仪表盘或工作台
    if (!currentUrl.includes('/dashboard') && !currentUrl.includes('/workbench')) {
      throw new Error(`登录后未正确跳转，当前URL: ${currentUrl}`);
    }

    const duration = Date.now() - startTime;
    return {
      suite: '后台管理 - 登录',
      name: testName,
      status: 'passed',
      duration,
      screenshot,
    };
  } catch (err: any) {
    error = err.message || String(err);
    const duration = Date.now() - startTime;
    return {
      suite: '后台管理 - 登录',
      name: testName,
      status: 'failed',
      duration,
      screenshot,
      error,
      suggestions: [
        '检查后端API是否正常运行',
        '检查登录接口是否正常响应',
        '检查用户名密码是否正确',
        '检查CORS配置是否正确',
        '检查WebSocket连接是否正常',
        '检查路由跳转逻辑是否正确',
      ],
    };
  }
}

/**
 * 测试：客服登录
 */
export async function testAgentLogin(): Promise<TestResult> {
  const startTime = Date.now();
  const testName = '客服登录测试';
  let screenshot: string | undefined;
  let error: string | undefined;

  try {
    await browserHelper.navigate(testConfig.urls.adminPortal);
    
    // 填写登录表单
    await fillLoginForm(
      testConfig.accounts.agent.username,
      testConfig.accounts.agent.password
    );
    
    screenshot = await browserHelper.screenshot({ name: 'agent-login-form-filled' });
    
    // 提交登录
    await submitLoginForm();
    
    // 等待登录完成
    await browserHelper.wait({ time: 3000 });
    
    screenshot = await browserHelper.screenshot({ name: 'after-agent-login' });
    
    // 验证URL变化（应该跳转到工作台）
    const currentUrl = await browserHelper.getCurrentUrl();
    if (currentUrl.includes('/login')) {
      throw new Error('登录失败，仍然在登录页面');
    }
    
    // 验证是否跳转到工作台
    if (!currentUrl.includes('/workbench')) {
      throw new Error(`登录后未正确跳转到工作台，当前URL: ${currentUrl}`);
    }

    const duration = Date.now() - startTime;
    return {
      suite: '后台管理 - 登录',
      name: testName,
      status: 'passed',
      duration,
      screenshot,
    };
  } catch (err: any) {
    error = err.message || String(err);
    const duration = Date.now() - startTime;
    return {
      suite: '后台管理 - 登录',
      name: testName,
      status: 'failed',
      duration,
      screenshot,
      error,
      suggestions: [
        '检查后端API是否正常运行',
        '检查登录接口是否正常响应',
        '检查用户名密码是否正确',
        '检查角色权限配置是否正确',
        '检查路由跳转逻辑是否正确',
      ],
    };
  }
}

/**
 * 测试：错误登录处理
 */
export async function testLoginError(): Promise<TestResult> {
  const startTime = Date.now();
  const testName = '错误登录处理测试';
  let screenshot: string | undefined;
  let error: string | undefined;

  try {
    await browserHelper.navigate(testConfig.urls.adminPortal);
    
    // 使用错误的用户名密码
    await fillLoginForm('wronguser', 'wrongpass');
    
    screenshot = await browserHelper.screenshot({ name: 'wrong-credentials-filled' });
    
    // 提交登录
    await submitLoginForm();
    
    // 等待错误提示
    await browserHelper.wait({ time: 2000 });
    
    screenshot = await browserHelper.screenshot({ name: 'login-error' });
    
    // 验证错误提示出现
    // 注意：这里可能需要根据实际实现调整选择器
    const hasError = await browserHelper.elementExists('.ant-message-error');
    
    if (!hasError) {
      // 如果没有错误提示，这可能是一个问题
      throw new Error('错误登录时未显示错误提示');
    }

    const duration = Date.now() - startTime;
    return {
      suite: '后台管理 - 登录',
      name: testName,
      status: 'passed',
      duration,
      screenshot,
    };
  } catch (err: any) {
    error = err.message || String(err);
    const duration = Date.now() - startTime;
    return {
      suite: '后台管理 - 登录',
      name: testName,
      status: 'failed',
      duration,
      screenshot,
      error,
      suggestions: [
        '检查错误处理逻辑是否正确',
        '检查错误提示是否正确显示',
        '检查API错误响应是否正确处理',
      ],
    };
  }
}

/**
 * 运行所有登录测试
 */
export async function runLoginTests(): Promise<TestResult[]> {
  console.log('[Test] 开始运行登录测试...');
  
  const results: TestResult[] = [];
  
  // 运行各个测试
  results.push(await testLoginPageLoad());
  results.push(await testAdminLogin());
  results.push(await testAgentLogin());
  results.push(await testLoginError());
  
  // 添加到报告
  for (const result of results) {
    reportHelper.addResult(result);
  }
  
  console.log(`[Test] 登录测试完成: ${results.filter(r => r.status === 'passed').length}/${results.length} 通过`);
  
  return results;
}

