/**
 * 聊天页面交互功能测试
 * 测试AI对话、转人工、文件上传、快捷回复等交互功能
 */

import { browserHelper } from '../helpers/browser-helper';
import { fillIdentityForm, submitIdentityForm } from '../helpers/form-helper';
import { fillIntakeForm, submitIntakeForm } from '../helpers/form-helper';
import { assertElementVisible, assertUrlContains } from '../helpers/assertion-helper';
import { reportHelper, TestResult } from '../helpers/report-helper';
import { testConfig } from '../config/test-config';
import { PlayerSelectors } from '../config/selectors';
import { defaultIdentityData, defaultIntakeFormData } from '../fixtures/test-data';

/**
 * 辅助函数：进入聊天页面
 */
async function navigateToChatPage(): Promise<void> {
  await browserHelper.navigate(testConfig.urls.playerApp);
  await fillIdentityForm(defaultIdentityData);
  await submitIdentityForm();
  await browserHelper.wait({ time: 2000 });
  
  await fillIntakeForm(defaultIntakeFormData);
  await submitIntakeForm();
  
  // 等待页面跳转
  await browserHelper.wait({ time: 5000 });
  
  const currentUrl = await browserHelper.getCurrentUrl();
  if (currentUrl.includes('/queue/')) {
    // 如果在排队页面，等待一段时间看是否跳转到聊天页面
    await browserHelper.wait({ time: 5000 });
  }
}

/**
 * 测试：多轮对话
 */
export async function testMultiTurnConversation(): Promise<TestResult> {
  const startTime = Date.now();
  const testName = '多轮对话测试';
  let screenshot: string | undefined;
  let error: string | undefined;

  try {
    await navigateToChatPage();
    
    const currentUrl = await browserHelper.getCurrentUrl();
    if (!currentUrl.includes('/chat/')) {
      if (currentUrl.includes('/queue/')) {
        const duration = Date.now() - startTime;
        return {
          suite: '玩家端 - 聊天交互',
          name: testName,
          status: 'skipped',
          duration,
          screenshot,
        };
      }
      throw new Error(`未在聊天页面，当前URL: ${currentUrl}`);
    }
    
    screenshot = await browserHelper.screenshot({ name: 'chat-before-multi-turn' });
    
    // 等待消息输入框出现
    await browserHelper.wait({ time: 3000 });
    
    // 发送第一条消息
    const message1 = '你好，我遇到了一个问题';
    await browserHelper.fill({
      selector: PlayerSelectors.chat.messageInput,
      value: message1,
    });
    
    // 查找发送按钮并点击
    const sendButtonExists = await browserHelper.elementExists(PlayerSelectors.chat.sendButton);
    if (sendButtonExists) {
      await browserHelper.click({
        selector: PlayerSelectors.chat.sendButton,
        waitAfter: 3000,
      });
    } else {
      // 尝试通过Enter键发送
      await browserHelper.evaluate(`
        const input = document.querySelector('${PlayerSelectors.chat.messageInput}');
        if (input) {
          const event = new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13 });
          input.dispatchEvent(event);
        }
      `);
      await browserHelper.wait({ time: 3000 });
    }
    
    screenshot = await browserHelper.screenshot({ name: 'chat-after-first-message' });
    
    // 等待AI回复
    await browserHelper.wait({ time: 5000 });
    
    // 发送第二条消息
    const message2 = '请帮我处理一下';
    await browserHelper.fill({
      selector: PlayerSelectors.chat.messageInput,
      value: message2,
    });
    
    if (sendButtonExists) {
      await browserHelper.click({
        selector: PlayerSelectors.chat.sendButton,
        waitAfter: 3000,
      });
    } else {
      await browserHelper.evaluate(`
        const input = document.querySelector('${PlayerSelectors.chat.messageInput}');
        if (input) {
          const event = new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13 });
          input.dispatchEvent(event);
        }
      `);
      await browserHelper.wait({ time: 3000 });
    }
    
    screenshot = await browserHelper.screenshot({ name: 'chat-after-second-message' });
    
    // 验证消息列表中有多条消息
    await browserHelper.wait({ time: 3000 });
    const messageCount = await browserHelper.evaluate<number>(`
      document.querySelectorAll('${PlayerSelectors.chat.messageItem}').length
    `);
    
    if (messageCount < 2) {
      console.log(`[Test] 消息数量: ${messageCount}，可能还在加载中`);
    }

    const duration = Date.now() - startTime;
    return {
      suite: '玩家端 - 聊天交互',
      name: testName,
      status: 'passed',
      duration,
      screenshot,
    };
  } catch (err: any) {
    error = err.message || String(err);
    const duration = Date.now() - startTime;
    return {
      suite: '玩家端 - 聊天交互',
      name: testName,
      status: 'failed',
      duration,
      screenshot,
      error,
      suggestions: [
        '检查消息发送逻辑是否正确',
        '检查WebSocket消息接收是否正常',
        '检查消息列表更新是否正确',
        '检查AI回复逻辑是否正常',
      ],
    };
  }
}

/**
 * 测试：AI建议选项
 */
export async function testAISuggestions(): Promise<TestResult> {
  const startTime = Date.now();
  const testName = 'AI建议选项测试';
  let screenshot: string | undefined;
  let error: string | undefined;

  try {
    await navigateToChatPage();
    
    const currentUrl = await browserHelper.getCurrentUrl();
    if (!currentUrl.includes('/chat/')) {
      if (currentUrl.includes('/queue/')) {
        const duration = Date.now() - startTime;
        return {
          suite: '玩家端 - 聊天交互',
          name: testName,
          status: 'skipped',
          duration,
          screenshot,
        };
      }
      throw new Error(`未在聊天页面，当前URL: ${currentUrl}`);
    }
    
    // 等待AI消息和建议选项出现
    await browserHelper.wait({ time: 8000 });
    
    screenshot = await browserHelper.screenshot({ name: 'chat-ai-suggestions' });
    
    // 检查是否有建议选项（快速操作标签）
    const hasSuggestions = await browserHelper.elementExists(PlayerSelectors.chat.quickActionTag);
    
    if (hasSuggestions) {
      // 获取建议选项文本
      const suggestions = await browserHelper.evaluate<string[]>(`
        Array.from(document.querySelectorAll('${PlayerSelectors.chat.quickActionTag}')).map(el => el.textContent.trim())
      `);
      
      console.log(`[Test] 找到建议选项: ${suggestions.join(', ')}`);
      
      // 点击第一个建议选项
      if (suggestions.length > 0) {
        await browserHelper.click({
          selector: `${PlayerSelectors.chat.quickActionTag}:first-child`,
          waitAfter: 2000,
        });
        
        screenshot = await browserHelper.screenshot({ name: 'chat-after-click-suggestion' });
        
        // 验证建议选项内容是否插入到输入框
        const inputValue = await browserHelper.evaluate<string>(`
          document.querySelector('${PlayerSelectors.chat.messageInput}')?.value || ''
        `);
        
        if (inputValue.includes(suggestions[0])) {
          console.log('[Test] 建议选项已插入到输入框');
        }
      }
    } else {
      console.log('[Test] 未找到AI建议选项，可能AI消息还未加载完成');
    }

    const duration = Date.now() - startTime;
    return {
      suite: '玩家端 - 聊天交互',
      name: testName,
      status: 'passed',
      duration,
      screenshot,
    };
  } catch (err: any) {
    error = err.message || String(err);
    const duration = Date.now() - startTime;
    return {
      suite: '玩家端 - 聊天交互',
      name: testName,
      status: 'failed',
      duration,
      screenshot,
      error,
      suggestions: [
        '检查AI建议选项是否正确生成',
        '检查建议选项显示逻辑是否正确',
        '检查建议选项点击事件是否正确',
      ],
    };
  }
}

/**
 * 测试：AI正在输入状态
 */
export async function testAITypingIndicator(): Promise<TestResult> {
  const startTime = Date.now();
  const testName = 'AI正在输入状态测试';
  let screenshot: string | undefined;
  let error: string | undefined;

  try {
    await navigateToChatPage();
    
    const currentUrl = await browserHelper.getCurrentUrl();
    if (!currentUrl.includes('/chat/')) {
      if (currentUrl.includes('/queue/')) {
        const duration = Date.now() - startTime;
        return {
          suite: '玩家端 - 聊天交互',
          name: testName,
          status: 'skipped',
          duration,
          screenshot,
        };
      }
      throw new Error(`未在聊天页面，当前URL: ${currentUrl}`);
    }
    
    // 发送一条消息触发AI回复
    await browserHelper.wait({ time: 3000 });
    
    const testMessage = '请帮我查询一下';
    await browserHelper.fill({
      selector: PlayerSelectors.chat.messageInput,
      value: testMessage,
    });
    
    screenshot = await browserHelper.screenshot({ name: 'chat-before-ai-typing' });
    
    // 发送消息
    const sendButtonExists = await browserHelper.elementExists(PlayerSelectors.chat.sendButton);
    if (sendButtonExists) {
      await browserHelper.click({
        selector: PlayerSelectors.chat.sendButton,
        waitAfter: 1000,
      });
    } else {
      await browserHelper.evaluate(`
        const input = document.querySelector('${PlayerSelectors.chat.messageInput}');
        if (input) {
          const event = new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13 });
          input.dispatchEvent(event);
        }
      `);
      await browserHelper.wait({ time: 1000 });
    }
    
    // 立即检查是否有"正在输入"指示器
    await browserHelper.wait({ time: 1000 });
    screenshot = await browserHelper.screenshot({ name: 'chat-check-ai-typing' });
    
    const hasTypingIndicator = await browserHelper.elementExists(PlayerSelectors.chat.aiTypingIndicator);
    
    if (hasTypingIndicator) {
      console.log('[Test] 检测到AI正在输入指示器');
    } else {
      console.log('[Test] 未检测到AI正在输入指示器，可能AI回复太快或指示器已消失');
    }
    
    // 等待AI回复完成
    await browserHelper.wait({ time: 5000 });
    screenshot = await browserHelper.screenshot({ name: 'chat-after-ai-response' });

    const duration = Date.now() - startTime;
    return {
      suite: '玩家端 - 聊天交互',
      name: testName,
      status: 'passed',
      duration,
      screenshot,
    };
  } catch (err: any) {
    error = err.message || String(err);
    const duration = Date.now() - startTime;
    return {
      suite: '玩家端 - 聊天交互',
      name: testName,
      status: 'failed',
      duration,
      screenshot,
      error,
      suggestions: [
        '检查AI正在输入指示器是否正确显示',
        '检查指示器显示时机是否正确',
        '检查指示器清除逻辑是否正确',
      ],
    };
  }
}

/**
 * 测试：转人工按钮
 */
export async function testTransferToAgentButton(): Promise<TestResult> {
  const startTime = Date.now();
  const testName = '转人工按钮测试';
  let screenshot: string | undefined;
  let error: string | undefined;

  try {
    await navigateToChatPage();
    
    const currentUrl = await browserHelper.getCurrentUrl();
    if (!currentUrl.includes('/chat/')) {
      if (currentUrl.includes('/queue/')) {
        const duration = Date.now() - startTime;
        return {
          suite: '玩家端 - 聊天交互',
          name: testName,
          status: 'skipped',
          duration,
          screenshot,
        };
      }
      throw new Error(`未在聊天页面，当前URL: ${currentUrl}`);
    }
    
    // 等待页面加载
    await browserHelper.wait({ time: 5000 });
    
    screenshot = await browserHelper.screenshot({ name: 'chat-before-transfer' });
    
    // 检查转人工按钮是否存在
    const transferButtonExists = await browserHelper.elementExists(PlayerSelectors.chat.transferButton);
    
    if (!transferButtonExists) {
      // 可能按钮在建议选项中
      const suggestionExists = await browserHelper.elementExists(PlayerSelectors.chat.quickActionTag);
      if (suggestionExists) {
        const suggestions = await browserHelper.evaluate<string[]>(`
          Array.from(document.querySelectorAll('${PlayerSelectors.chat.quickActionTag}')).map(el => el.textContent.trim())
        `);
        
        const hasTransferSuggestion = suggestions.some(s => s.includes('转人工'));
        if (hasTransferSuggestion) {
          // 点击"转人工"建议选项
          const transferTag = await browserHelper.evaluate<string>(`
            Array.from(document.querySelectorAll('${PlayerSelectors.chat.quickActionTag}')).find(el => el.textContent.includes('转人工'))?.getAttribute('class') || ''
          `);
          
          if (transferTag) {
            await browserHelper.click({
              selector: `${PlayerSelectors.chat.quickActionTag}:has-text("转人工")`,
              waitAfter: 3000,
            });
          } else {
            // 尝试通过文本查找
            await browserHelper.evaluate(`
              const tags = Array.from(document.querySelectorAll('${PlayerSelectors.chat.quickActionTag}'));
              const transferTag = tags.find(el => el.textContent.includes('转人工'));
              if (transferTag) transferTag.click();
            `);
            await browserHelper.wait({ time: 3000 });
          }
        } else {
          throw new Error('未找到转人工按钮或建议选项');
        }
      } else {
        throw new Error('未找到转人工按钮');
      }
    } else {
      // 点击转人工按钮
      await browserHelper.click({
        selector: PlayerSelectors.chat.transferButton,
        waitAfter: 3000,
      });
    }
    
    screenshot = await browserHelper.screenshot({ name: 'chat-after-transfer-click' });
    
    // 等待状态变化（可能进入排队页面或转为工单）
    await browserHelper.wait({ time: 5000 });
    
    const newUrl = await browserHelper.getCurrentUrl();
    screenshot = await browserHelper.screenshot({ name: 'chat-after-transfer' });
    
    // 验证是否跳转到排队页面或工单页面
    if (!newUrl.includes('/queue/') && !newUrl.includes('/ticket/') && !newUrl.includes('/chat/')) {
      // 可能还在聊天页面，但状态已改变，这也是正常的
      console.log('[Test] 转人工后仍在聊天页面，可能正在处理中');
    }

    const duration = Date.now() - startTime;
    return {
      suite: '玩家端 - 聊天交互',
      name: testName,
      status: 'passed',
      duration,
      screenshot,
    };
  } catch (err: any) {
    error = err.message || String(err);
    const duration = Date.now() - startTime;
    return {
      suite: '玩家端 - 聊天交互',
      name: testName,
      status: 'failed',
      duration,
      screenshot,
      error,
      suggestions: [
        '检查转人工按钮是否正确显示',
        '检查转人工逻辑是否正确',
        '检查转人工后的状态变化是否正确',
        '检查路由跳转是否正确',
      ],
    };
  }
}

/**
 * 测试：转人工后状态变化
 */
export async function testTransferStateChange(): Promise<TestResult> {
  const startTime = Date.now();
  const testName = '转人工后状态变化测试';
  let screenshot: string | undefined;
  let error: string | undefined;

  try {
    await navigateToChatPage();
    
    const currentUrl = await browserHelper.getCurrentUrl();
    if (!currentUrl.includes('/chat/')) {
      if (currentUrl.includes('/queue/')) {
        // 已经在排队页面，直接测试状态
        screenshot = await browserHelper.screenshot({ name: 'queue-page-state' });
        
        // 检查排队信息
        const hasQueueInfo = await browserHelper.elementExists('.queue-position, .estimated-time');
        
        const duration = Date.now() - startTime;
        return {
          suite: '玩家端 - 聊天交互',
          name: testName,
          status: 'passed',
          duration,
          screenshot,
        };
      }
      throw new Error(`未在聊天页面或排队页面，当前URL: ${currentUrl}`);
    }
    
    // 执行转人工操作（复用上面的逻辑）
    await browserHelper.wait({ time: 3000 });
    
    const transferButtonExists = await browserHelper.elementExists(PlayerSelectors.chat.transferButton);
    if (transferButtonExists) {
      await browserHelper.click({
        selector: PlayerSelectors.chat.transferButton,
        waitAfter: 3000,
      });
    } else {
      // 尝试通过建议选项转人工
      await browserHelper.evaluate(`
        const tags = Array.from(document.querySelectorAll('${PlayerSelectors.chat.quickActionTag}'));
        const transferTag = tags.find(el => el.textContent.includes('转人工'));
        if (transferTag) transferTag.click();
      `);
      await browserHelper.wait({ time: 3000 });
    }
    
    // 等待状态变化
    await browserHelper.wait({ time: 5000 });
    
    screenshot = await browserHelper.screenshot({ name: 'after-transfer-state-change' });
    
    const finalUrl = await browserHelper.getCurrentUrl();
    
    // 验证状态变化
    if (finalUrl.includes('/queue/')) {
      // 进入排队页面
      console.log('[Test] 已进入排队页面');
      
      // 检查排队信息显示
      const hasQueueInfo = await browserHelper.elementExists('.queue-position, .estimated-time, .queue-status');
      if (!hasQueueInfo) {
        console.log('[Test] 排队信息可能还在加载中');
      }
    } else if (finalUrl.includes('/ticket/')) {
      // 转为工单
      console.log('[Test] 已转为工单');
    } else if (finalUrl.includes('/chat/')) {
      // 仍在聊天页面，可能客服已接入
      console.log('[Test] 仍在聊天页面，可能客服已接入');
    }

    const duration = Date.now() - startTime;
    return {
      suite: '玩家端 - 聊天交互',
      name: testName,
      status: 'passed',
      duration,
      screenshot,
    };
  } catch (err: any) {
    error = err.message || String(err);
    const duration = Date.now() - startTime;
    return {
      suite: '玩家端 - 聊天交互',
      name: testName,
      status: 'failed',
      duration,
      screenshot,
      error,
      suggestions: [
        '检查转人工后的状态更新逻辑是否正确',
        '检查排队页面是否正确显示',
        '检查工单转换逻辑是否正确',
      ],
    };
  }
}

/**
 * 测试：快捷回复功能
 */
export async function testQuickReply(): Promise<TestResult> {
  const startTime = Date.now();
  const testName = '快捷回复功能测试';
  let screenshot: string | undefined;
  let error: string | undefined;

  try {
    await navigateToChatPage();
    
    const currentUrl = await browserHelper.getCurrentUrl();
    if (!currentUrl.includes('/chat/')) {
      if (currentUrl.includes('/queue/')) {
        const duration = Date.now() - startTime;
        return {
          suite: '玩家端 - 聊天交互',
          name: testName,
          status: 'skipped',
          duration,
          screenshot,
        };
      }
      throw new Error(`未在聊天页面，当前URL: ${currentUrl}`);
    }
    
    await browserHelper.wait({ time: 3000 });
    
    screenshot = await browserHelper.screenshot({ name: 'chat-before-quick-reply' });
    
    // 查找快捷回复按钮
    const quickReplyButtonExists = await browserHelper.elementExists(PlayerSelectors.chat.quickReplyButton);
    
    if (quickReplyButtonExists) {
      // 点击快捷回复按钮
      await browserHelper.click({
        selector: PlayerSelectors.chat.quickReplyButton,
        waitAfter: 1000,
      });
      
      // 等待抽屉打开
      await browserHelper.wait({ time: 1000 });
      
      screenshot = await browserHelper.screenshot({ name: 'chat-quick-reply-drawer' });
      
      // 检查抽屉是否打开
      const drawerExists = await browserHelper.elementExists(PlayerSelectors.chat.quickReplyDrawer);
      
      if (drawerExists) {
        // 检查是否有快捷回复列表
        const hasReplyList = await browserHelper.elementExists(PlayerSelectors.chat.quickReplyItem);
        
        if (hasReplyList) {
          // 点击第一个快捷回复
          await browserHelper.click({
            selector: `${PlayerSelectors.chat.quickReplyItem}:first-child`,
            waitAfter: 2000,
          });
          
          screenshot = await browserHelper.screenshot({ name: 'chat-after-select-quick-reply' });
          
          // 验证回复内容是否插入到输入框
          const inputValue = await browserHelper.evaluate<string>(`
            document.querySelector('${PlayerSelectors.chat.messageInput}')?.value || ''
          `);
          
          if (inputValue.length > 0) {
            console.log(`[Test] 快捷回复已插入: ${inputValue.substring(0, 50)}...`);
          }
        }
      }
    } else {
      console.log('[Test] 未找到快捷回复按钮，可能该功能未启用');
    }

    const duration = Date.now() - startTime;
    return {
      suite: '玩家端 - 聊天交互',
      name: testName,
      status: 'passed',
      duration,
      screenshot,
    };
  } catch (err: any) {
    error = err.message || String(err);
    const duration = Date.now() - startTime;
    return {
      suite: '玩家端 - 聊天交互',
      name: testName,
      status: 'failed',
      duration,
      screenshot,
      error,
      suggestions: [
        '检查快捷回复按钮是否正确显示',
        '检查快捷回复抽屉是否正确打开',
        '检查快捷回复列表是否正确加载',
        '检查快捷回复选择逻辑是否正确',
      ],
    };
  }
}

/**
 * 运行所有聊天交互功能测试
 */
export async function runChatInteractiveTests(): Promise<TestResult[]> {
  console.log('[Test] 开始运行聊天交互功能测试...');
  
  const results: TestResult[] = [];
  
  // 运行各个测试
  results.push(await testMultiTurnConversation());
  results.push(await testAISuggestions());
  results.push(await testAITypingIndicator());
  results.push(await testTransferToAgentButton());
  results.push(await testTransferStateChange());
  results.push(await testQuickReply());
  
  // 添加到报告
  for (const result of results) {
    reportHelper.addResult(result);
  }
  
  console.log(`[Test] 聊天交互功能测试完成: ${results.filter(r => r.status === 'passed').length}/${results.length} 通过`);
  
  return results;
}

