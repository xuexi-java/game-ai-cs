/**
 * 浏览器操作封装
 * 封装Puppeteer MCP工具调用，提供统一的浏览器操作接口
 */

import { testConfig } from '../config/test-config';

export interface ScreenshotOptions {
  name: string;
  width?: number;
  height?: number;
  encoded?: boolean;
}

export interface ClickOptions {
  selector: string;
  retry?: boolean;
  waitAfter?: number;
}

export interface FillOptions {
  selector: string;
  value: string;
  clearFirst?: boolean;
}

export interface SelectOptions {
  selector: string;
  value: string;
}

export interface WaitOptions {
  selector?: string;
  time?: number;
  text?: string;
  textGone?: string;
}

/**
 * 浏览器操作类
 * 封装所有浏览器自动化操作
 */
export class BrowserHelper {
  private screenshotCounter = 0;
  private screenshotDir: string;

  constructor() {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    this.screenshotDir = `${testConfig.screenshots.basePath}/${timestamp}`;
  }

  /**
   * 导航到指定URL
   */
  async navigate(url: string): Promise<void> {
    try {
      console.log(`[Browser] 导航到: ${url}`);
      // 直接调用MCP工具（在Agent模式下可用）
      // 注意：这里使用动态调用，因为MCP工具函数名包含连字符
      // @ts-ignore
      await (globalThis as any)['mcp_my-chrome_puppeteer_navigate']({ url });
    } catch (error) {
      console.error(`[Browser] 导航失败: ${error}`);
      throw error;
    }
  }

  /**
   * 截图并保存
   */
  async screenshot(options: ScreenshotOptions): Promise<string> {
    try {
      this.screenshotCounter++;
      const name = `${this.screenshotCounter}-${options.name}`;
      
      console.log(`[Browser] 截图: ${name}`);
      
      // 直接调用MCP工具（在Agent模式下可用）
      // @ts-ignore
      await (globalThis as any)['mcp_my-chrome_puppeteer_screenshot']({
        name,
        width: options.width || 1920,
        height: options.height || 1080,
        encoded: options.encoded || false,
      });
      
      const screenshotPath = `${this.screenshotDir}/${name}.${testConfig.screenshots.format}`;
      return screenshotPath;
    } catch (error) {
      console.error(`[Browser] 截图失败: ${error}`);
      throw error;
    }
  }

  /**
   * 点击元素（带重试机制）
   */
  async click(options: ClickOptions): Promise<void> {
    const { selector, retry = true, waitAfter = 500 } = options;
    const maxAttempts = retry ? testConfig.retry.maxAttempts : 1;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        console.log(`[Browser] 点击: ${selector} (尝试 ${attempt}/${maxAttempts})`);
        
        // 等待元素可见
        await this.waitForElement(selector);
        
        // 直接调用MCP工具（在Agent模式下可用）
        // @ts-ignore
        await (globalThis as any)['mcp_my-chrome_puppeteer_click']({ selector });
        
        // 等待操作完成
        if (waitAfter > 0) {
          await this.wait({ time: waitAfter });
        }
        
        return;
      } catch (error) {
        if (attempt === maxAttempts) {
          console.error(`[Browser] 点击失败 (${maxAttempts}次尝试): ${error}`);
          throw error;
        }
        console.warn(`[Browser] 点击失败，重试中... (${attempt}/${maxAttempts})`);
        await this.wait({ time: testConfig.retry.delay });
      }
    }
  }

  /**
   * 填写表单字段
   */
  async fill(options: FillOptions): Promise<void> {
    const { selector, value, clearFirst = true } = options;

    try {
      console.log(`[Browser] 填写: ${selector} = "${value}"`);
      
      // 等待元素可见
      await this.waitForElement(selector);
      
      if (clearFirst) {
        // 先清空字段
        // await this.evaluate(`document.querySelector('${selector}').value = ''`);
      }
      
      // 直接调用MCP工具（在Agent模式下可用）
      // @ts-ignore
      await (globalThis as any)['mcp_my-chrome_puppeteer_fill']({ selector, value });
      
      // 等待输入完成
      await this.wait({ time: 300 });
    } catch (error) {
      console.error(`[Browser] 填写失败: ${error}`);
      throw error;
    }
  }

  /**
   * 选择下拉选项
   */
  async select(options: SelectOptions): Promise<void> {
    const { selector, value } = options;

    try {
      console.log(`[Browser] 选择: ${selector} = "${value}"`);
      
      // 先点击下拉框
      await this.click({ selector, waitAfter: 500 });
      
      // 等待选项出现
      await this.wait({ time: 500 });
      
      // 直接调用MCP工具（在Agent模式下可用）
      // @ts-ignore
      await (globalThis as any)['mcp_my-chrome_puppeteer_select']({ selector, value });
      
      // 等待选择完成
      await this.wait({ time: 500 });
    } catch (error) {
      console.error(`[Browser] 选择失败: ${error}`);
      throw error;
    }
  }

  /**
   * 等待元素出现
   */
  async waitForElement(selector: string, timeout?: number): Promise<void> {
    const maxWait = timeout || testConfig.timeouts.elementWait;
    const startTime = Date.now();

    while (Date.now() - startTime < maxWait) {
      try {
        // 使用MCP工具检查元素是否存在
        // const result = await this.evaluate(`
        //   document.querySelector('${selector}') !== null
        // `);
        // if (result) return;
        
        await this.wait({ time: 500 });
      } catch (error) {
        // 继续等待
      }
    }

    throw new Error(`元素未出现: ${selector} (超时: ${maxWait}ms)`);
  }

  /**
   * 等待
   */
  async wait(options: WaitOptions): Promise<void> {
    if (options.time) {
      await new Promise(resolve => setTimeout(resolve, options.time));
    } else if (options.selector) {
      await this.waitForElement(options.selector);
    } else if (options.text) {
      // 等待文本出现
      // 实现文本等待逻辑
      await new Promise(resolve => setTimeout(resolve, 1000));
    } else if (options.textGone) {
      // 等待文本消失
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  /**
   * 执行JavaScript
   */
  async evaluate<T = any>(script: string): Promise<T> {
    try {
      console.log(`[Browser] 执行脚本: ${script.substring(0, 50)}...`);
      
      // 直接调用MCP工具（在Agent模式下可用）
      // @ts-ignore
      const result = await (globalThis as any)['mcp_my-chrome_puppeteer_evaluate']({ script });
      return result as T;
    } catch (error) {
      console.error(`[Browser] 执行脚本失败: ${error}`);
      throw error;
    }
  }

  /**
   * 获取当前URL
   */
  async getCurrentUrl(): Promise<string> {
    const result = await this.evaluate<string>('window.location.href');
    return result;
  }

  /**
   * 获取页面标题
   */
  async getPageTitle(): Promise<string> {
    const result = await this.evaluate<string>('document.title');
    return result;
  }

  /**
   * 检查元素是否存在
   */
  async elementExists(selector: string): Promise<boolean> {
    try {
      const result = await this.evaluate<boolean>(`
        document.querySelector('${selector}') !== null
      `);
      return result;
    } catch {
      return false;
    }
  }

  /**
   * 获取元素文本
   */
  async getElementText(selector: string): Promise<string> {
    const result = await this.evaluate<string>(`
      document.querySelector('${selector}')?.textContent || ''
    `);
    return result;
  }

  /**
   * 悬停元素
   */
  async hover(selector: string): Promise<void> {
    try {
      console.log(`[Browser] 悬停: ${selector}`);
      
      await this.waitForElement(selector);
      // 直接调用MCP工具（在Agent模式下可用）
      // @ts-ignore
      await (globalThis as any)['mcp_my-chrome_puppeteer_hover']({ selector });
      await this.wait({ time: 300 });
    } catch (error) {
      console.error(`[Browser] 悬停失败: ${error}`);
      throw error;
    }
  }
}

// 导出单例
export const browserHelper = new BrowserHelper();

