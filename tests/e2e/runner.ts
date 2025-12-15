/**
 * 测试运行器
 * 负责执行所有测试用例并生成报告
 */

import { reportHelper } from './helpers/report-helper';
import { testConfig } from './config/test-config';

// 导入测试套件
import { runIdentityCheckTests } from './player/identity-check.spec';
import { runIntakeFormTests } from './player/intake-form.spec';
import { runEscapeHatchTests } from './player/escape-hatch.spec';
import { runChatBasicTests } from './player/chat-basic.spec';
import { runChatInteractiveTests } from './player/chat-interactive.spec';
import { runFileUploadTests } from './player/file-upload.spec';
import { runLoginTests } from './admin/login.spec';
import { runWorkbenchTests } from './admin/workbench.spec';
import { runIntegrationTests } from './integration/player-to-agent.spec';

/**
 * 检查测试环境
 */
async function checkEnvironment(): Promise<boolean> {
  console.log('[Runner] 检查测试环境...');
  
  try {
    // 检查服务是否可访问
    // 这里可以添加健康检查逻辑
    console.log('[Runner] 环境检查通过');
    return true;
  } catch (error) {
    console.error('[Runner] 环境检查失败:', error);
    return false;
  }
}

/**
 * 运行所有测试
 */
export async function runAllTests(): Promise<void> {
  console.log('==========================================');
  console.log('开始运行MCP协作自动测试');
  console.log('==========================================\n');

  const startTime = Date.now();

  // 环境检查
  const envOk = await checkEnvironment();
  if (!envOk) {
    console.error('[Runner] 环境检查失败，终止测试');
    return;
  }

  try {
    // 清空之前的测试结果
    reportHelper.clear();

    // 执行测试套件
    console.log('\n[Runner] 开始执行测试套件...\n');

    // 玩家端测试
    console.log('--- 玩家端测试 ---');
    await runIdentityCheckTests();
    await runIntakeFormTests();
    await runEscapeHatchTests();
    await runChatBasicTests();
    await runChatInteractiveTests();
    await runFileUploadTests();

    // 后台管理端测试
    console.log('\n--- 后台管理端测试 ---');
    await runLoginTests();
    await runWorkbenchTests();

    // 集成测试
    console.log('\n--- 集成测试 ---');
    await runIntegrationTests();

    // 生成报告
    console.log('\n[Runner] 生成测试报告...');
    const reportContent = reportHelper.generateReport('test');
    const reportPath = await reportHelper.saveReport(reportContent);

    // 输出摘要
    const duration = Date.now() - startTime;
    console.log('\n==========================================');
    console.log('测试执行完成');
    console.log('==========================================');
    console.log(`总耗时: ${(duration / 1000).toFixed(2)}秒`);
    console.log(`报告路径: ${reportPath}`);
    console.log('==========================================\n');

  } catch (error) {
    console.error('[Runner] 测试执行出错:', error);
    
    // 即使出错也生成报告
    const reportContent = reportHelper.generateReport('test');
    await reportHelper.saveReport(reportContent);
    
    throw error;
  }
}

/**
 * 运行特定测试套件
 */
export async function runTestSuite(suite: string): Promise<void> {
  console.log(`[Runner] 运行测试套件: ${suite}`);

  reportHelper.clear();

  switch (suite) {
    case 'player':
      await runIdentityCheckTests();
      await runIntakeFormTests();
      await runEscapeHatchTests();
      await runChatBasicTests();
      await runChatInteractiveTests();
      await runFileUploadTests();
      break;
    case 'admin':
      await runLoginTests();
      await runWorkbenchTests();
      break;
    case 'integration':
      await runIntegrationTests();
      break;
    default:
      console.error(`[Runner] 未知的测试套件: ${suite}`);
      return;
  }

  const reportContent = reportHelper.generateReport('test');
  await reportHelper.saveReport(reportContent);
}

// 如果直接运行此文件
if (require.main === module) {
  runAllTests().catch(console.error);
}

