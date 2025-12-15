/**
 * 表单操作封装
 * 提供高级表单操作函数
 */

import { browserHelper } from './browser-helper';
import { PlayerSelectors } from '../config/selectors';
import { TestIdentityData, TestIntakeFormData } from '../fixtures/test-data';

/**
 * 填写身份验证表单
 */
export async function fillIdentityForm(data: TestIdentityData): Promise<void> {
  console.log('[Form] 填写身份验证表单:', data);

  // 选择游戏
  await browserHelper.click({
    selector: PlayerSelectors.identityCheck.gameSelect,
    waitAfter: 500,
  });
  
  // 等待选项出现并选择
  await browserHelper.wait({ time: 500 });
  
  // 通过文本选择游戏（需要根据实际实现调整）
  // 这里假设可以通过文本选择
  const gameOptions = await browserHelper.evaluate<Array<{ text: string; value: string }>>(`
    Array.from(document.querySelectorAll('${PlayerSelectors.identityCheck.gameOption}')).map(el => ({
      text: el.textContent.trim(),
      value: el.getAttribute('data-value') || el.textContent.trim()
    }))
  `);
  
  const selectedGame = gameOptions.find(opt => opt.value === data.gameId || opt.text.includes(data.gameId));
  if (selectedGame) {
    await browserHelper.click({
      selector: `${PlayerSelectors.identityCheck.gameOption}[data-value="${selectedGame.value}"]`,
      waitAfter: 500,
    });
  }

  // 填写区服
  await browserHelper.fill({
    selector: PlayerSelectors.identityCheck.serverInput,
    value: data.serverName,
  });

  // 填写角色ID
  await browserHelper.fill({
    selector: PlayerSelectors.identityCheck.playerIdInput,
    value: data.playerIdOrName,
  });

  // 选择问题类型
  await browserHelper.click({
    selector: PlayerSelectors.identityCheck.issueTypeSelect,
    waitAfter: 500,
  });
  
  await browserHelper.wait({ time: 500 });
  
  // 选择问题类型选项
  const issueTypeOptions = await browserHelper.evaluate<Array<{ text: string; value: string }>>(`
    Array.from(document.querySelectorAll('${PlayerSelectors.identityCheck.issueTypeOption}')).map(el => ({
      text: el.textContent.trim(),
      value: el.getAttribute('data-value') || el.textContent.trim()
    }))
  `);
  
  const selectedIssueType = issueTypeOptions.find(opt => opt.value === data.issueTypeId);
  if (selectedIssueType) {
    await browserHelper.click({
      selector: `${PlayerSelectors.identityCheck.issueTypeOption}[data-value="${selectedIssueType.value}"]`,
      waitAfter: 500,
    });
  }
}

/**
 * 提交身份验证表单
 */
export async function submitIdentityForm(): Promise<void> {
  console.log('[Form] 提交身份验证表单');
  
  await browserHelper.click({
    selector: PlayerSelectors.identityCheck.nextButton,
    waitAfter: 2000,
  });
}

/**
 * 填写问题反馈表单
 */
export async function fillIntakeForm(data: TestIntakeFormData): Promise<void> {
  console.log('[Form] 填写问题反馈表单:', data);

  // 填写问题描述
  await browserHelper.fill({
    selector: PlayerSelectors.intakeForm.descriptionTextarea,
    value: data.description,
  });

  // 选择问题发生时间（如果提供）
  if (data.occurredAt) {
    await browserHelper.click({
      selector: PlayerSelectors.intakeForm.occurredAtPicker,
      waitAfter: 500,
    });
    // 日期选择器的具体实现需要根据Ant Design的日期选择器调整
  }

  // 填写充值订单号（如果提供）
  if (data.paymentOrderNo) {
    await browserHelper.fill({
      selector: PlayerSelectors.intakeForm.paymentOrderInput,
      value: data.paymentOrderNo,
    });
  }
}

/**
 * 提交问题反馈表单
 */
export async function submitIntakeForm(): Promise<void> {
  console.log('[Form] 提交问题反馈表单');
  
  await browserHelper.click({
    selector: PlayerSelectors.intakeForm.submitButton,
    waitAfter: 2000,
  });
}

/**
 * 填写登录表单（管理端）
 */
export async function fillLoginForm(username: string, password: string): Promise<void> {
  console.log('[Form] 填写登录表单:', { username });

  const { AdminSelectors } = await import('../config/selectors');
  
  await browserHelper.fill({
    selector: AdminSelectors.login.usernameInput,
    value: username,
  });

  await browserHelper.fill({
    selector: AdminSelectors.login.passwordInput,
    value: password,
  });
}

/**
 * 提交登录表单
 */
export async function submitLoginForm(): Promise<void> {
  console.log('[Form] 提交登录表单');
  
  const { AdminSelectors } = await import('../config/selectors');
  
  await browserHelper.click({
    selector: AdminSelectors.login.loginButton,
    waitAfter: 3000,
  });
}

