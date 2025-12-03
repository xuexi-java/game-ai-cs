/**
 * 断言辅助函数
 * 提供各种断言功能
 */

import { browserHelper } from './browser-helper';

export class AssertionError extends Error {
  constructor(message: string, public actual?: any, public expected?: any) {
    super(message);
    this.name = 'AssertionError';
  }
}

/**
 * 断言元素可见
 */
export async function assertElementVisible(selector: string, timeout?: number): Promise<void> {
  try {
    await browserHelper.waitForElement(selector, timeout);
    const exists = await browserHelper.elementExists(selector);
    if (!exists) {
      throw new AssertionError(`元素不可见: ${selector}`);
    }
  } catch (error) {
    if (error instanceof AssertionError) {
      throw error;
    }
    throw new AssertionError(`等待元素超时: ${selector}`, undefined, 'visible');
  }
}

/**
 * 断言元素不可见
 */
export async function assertElementNotVisible(selector: string): Promise<void> {
  const exists = await browserHelper.elementExists(selector);
  if (exists) {
    throw new AssertionError(`元素应该不可见但实际可见: ${selector}`);
  }
}

/**
 * 断言文本内容
 */
export async function assertTextContent(selector: string, expectedText: string | RegExp): Promise<void> {
  const actualText = await browserHelper.getElementText(selector);
  
  if (expectedText instanceof RegExp) {
    if (!expectedText.test(actualText)) {
      throw new AssertionError(
        `文本内容不匹配 (正则)`,
        actualText,
        expectedText.toString()
      );
    }
  } else {
    if (!actualText.includes(expectedText)) {
      throw new AssertionError(
        `文本内容不匹配`,
        actualText,
        expectedText
      );
    }
  }
}

/**
 * 断言URL包含路径
 */
export async function assertUrlContains(path: string): Promise<void> {
  const currentUrl = await browserHelper.getCurrentUrl();
  if (!currentUrl.includes(path)) {
    throw new AssertionError(
      `URL不包含预期路径`,
      currentUrl,
      path
    );
  }
}

/**
 * 断言URL等于
 */
export async function assertUrlEquals(url: string): Promise<void> {
  const currentUrl = await browserHelper.getCurrentUrl();
  if (currentUrl !== url) {
    throw new AssertionError(
      `URL不匹配`,
      currentUrl,
      url
    );
  }
}

/**
 * 断言错误消息
 */
export async function assertErrorMessage(expectedMessage: string | RegExp): Promise<void> {
  const { CommonSelectors } = await import('../config/selectors');
  
  try {
    await assertElementVisible(CommonSelectors.errorMessage, 5000);
    const errorText = await browserHelper.getElementText(CommonSelectors.errorMessage);
    
    if (expectedMessage instanceof RegExp) {
      if (!expectedMessage.test(errorText)) {
        throw new AssertionError(
          `错误消息不匹配 (正则)`,
          errorText,
          expectedMessage.toString()
        );
      }
    } else {
      if (!errorText.includes(expectedMessage)) {
        throw new AssertionError(
          `错误消息不匹配`,
          errorText,
          expectedMessage
        );
      }
    }
  } catch (error) {
    if (error instanceof AssertionError) {
      throw error;
    }
    throw new AssertionError(`未找到错误消息`, undefined, expectedMessage);
  }
}

/**
 * 断言成功消息
 */
export async function assertSuccessMessage(expectedMessage: string | RegExp): Promise<void> {
  const { CommonSelectors } = await import('../config/selectors');
  
  try {
    await assertElementVisible(CommonSelectors.successMessage, 5000);
    const successText = await browserHelper.getElementText(CommonSelectors.successMessage);
    
    if (expectedMessage instanceof RegExp) {
      if (!expectedMessage.test(successText)) {
        throw new AssertionError(
          `成功消息不匹配 (正则)`,
          successText,
          expectedMessage.toString()
        );
      }
    } else {
      if (!successText.includes(expectedMessage)) {
        throw new AssertionError(
          `成功消息不匹配`,
          successText,
          expectedMessage
        );
      }
    }
  } catch (error) {
    if (error instanceof AssertionError) {
      throw error;
    }
    throw new AssertionError(`未找到成功消息`, undefined, expectedMessage);
  }
}

/**
 * 断言元素数量
 */
export async function assertElementCount(selector: string, expectedCount: number): Promise<void> {
  const result = await browserHelper.evaluate<number>(`
    document.querySelectorAll('${selector}').length
  `);
  
  if (result !== expectedCount) {
    throw new AssertionError(
      `元素数量不匹配`,
      result,
      expectedCount
    );
  }
}

/**
 * 断言元素包含类名
 */
export async function assertElementHasClass(selector: string, className: string): Promise<void> {
  const result = await browserHelper.evaluate<boolean>(`
    document.querySelector('${selector}')?.classList.contains('${className}') || false
  `);
  
  if (!result) {
    throw new AssertionError(
      `元素不包含类名`,
      selector,
      className
    );
  }
}

/**
 * 断言表单字段值
 */
export async function assertFormFieldValue(selector: string, expectedValue: string): Promise<void> {
  const result = await browserHelper.evaluate<string>(`
    document.querySelector('${selector}')?.value || ''
  `);
  
  if (result !== expectedValue) {
    throw new AssertionError(
      `表单字段值不匹配`,
      result,
      expectedValue
    );
  }
}

