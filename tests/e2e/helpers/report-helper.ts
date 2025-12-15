/**
 * 报告生成辅助
 * 生成Markdown格式的测试报告
 */

import * as fs from 'fs';
import * as path from 'path';

export interface TestResult {
  suite: string;
  name: string;
  status: 'passed' | 'failed' | 'skipped';
  duration: number;
  screenshot?: string;
  error?: string;
  suggestions?: string[];
}

export interface TestReport {
  timestamp: string;
  environment: string;
  summary: {
    total: number;
    passed: number;
    failed: number;
    skipped: number;
  };
  results: TestResult[];
  issues: Array<{
    severity: 'high' | 'medium' | 'low';
    description: string;
    testCase: string;
  }>;
}

/**
 * 报告生成器
 */
export class ReportHelper {
  private results: TestResult[] = [];
  private issues: Array<{
    severity: 'high' | 'medium' | 'low';
    description: string;
    testCase: string;
  }> = [];

  /**
   * 添加测试结果
   */
  addResult(result: TestResult): void {
    this.results.push(result);
    
    // 如果测试失败，自动添加问题
    if (result.status === 'failed') {
      this.issues.push({
        severity: 'high',
        description: result.error || '测试失败',
        testCase: `${result.suite} - ${result.name}`,
      });
    }
  }

  /**
   * 添加问题
   */
  addIssue(severity: 'high' | 'medium' | 'low', description: string, testCase: string): void {
    this.issues.push({ severity, description, testCase });
  }

  /**
   * 生成报告
   */
  generateReport(environment: string = 'test'): string {
    const timestamp = new Date().toISOString();
    const summary = this.calculateSummary();

    const report: TestReport = {
      timestamp,
      environment,
      summary,
      results: this.results,
      issues: this.issues,
    };

    return this.formatMarkdown(report);
  }

  /**
   * 保存报告到文件
   */
  async saveReport(reportContent: string, basePath: string = './tests/reports'): Promise<string> {
    // 确保目录存在
    if (!fs.existsSync(basePath)) {
      fs.mkdirSync(basePath, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `${timestamp}-test-report.md`;
    const filepath = path.join(basePath, filename);

    fs.writeFileSync(filepath, reportContent, 'utf-8');
    
    console.log(`[Report] 报告已保存: ${filepath}`);
    return filepath;
  }

  /**
   * 计算摘要
   */
  private calculateSummary() {
    return {
      total: this.results.length,
      passed: this.results.filter(r => r.status === 'passed').length,
      failed: this.results.filter(r => r.status === 'failed').length,
      skipped: this.results.filter(r => r.status === 'skipped').length,
    };
  }

  /**
   * 格式化Markdown报告
   */
  private formatMarkdown(report: TestReport): string {
    const { summary, results, issues } = report;
    const passRate = summary.total > 0 ? ((summary.passed / summary.total) * 100).toFixed(2) : '0.00';

    let markdown = `# AI客服系统功能测试报告\n\n`;
    
    // 测试概览
    markdown += `## 测试概览\n\n`;
    markdown += `- **测试时间**: ${report.timestamp}\n`;
    markdown += `- **测试环境**: ${report.environment}\n`;
    markdown += `- **总测试用例**: ${summary.total}\n`;
    markdown += `- **通过**: ${summary.passed} ✅\n`;
    markdown += `- **失败**: ${summary.failed} ❌\n`;
    markdown += `- **跳过**: ${summary.skipped} ⏭️\n`;
    markdown += `- **通过率**: ${passRate}%\n\n`;

    // 测试结果详情
    markdown += `## 测试结果详情\n\n`;

    // 按测试套件分组
    const suites = this.groupBySuite(results);
    for (const [suite, suiteResults] of Object.entries(suites)) {
      markdown += `### ${suite}\n\n`;
      
      for (const result of suiteResults) {
        const statusIcon = result.status === 'passed' ? '✅' : result.status === 'failed' ? '❌' : '⏭️';
        markdown += `#### ${result.name}\n\n`;
        markdown += `- **状态**: ${statusIcon} ${result.status}\n`;
        markdown += `- **执行时间**: ${result.duration}ms\n`;
        
        if (result.screenshot) {
          markdown += `- **截图**: [查看截图](${result.screenshot})\n`;
        }
        
        if (result.error) {
          markdown += `- **错误信息**: \`\`\`\n${result.error}\n\`\`\`\n`;
        }
        
        if (result.suggestions && result.suggestions.length > 0) {
          markdown += `- **建议**:\n`;
          for (const suggestion of result.suggestions) {
            markdown += `  - ${suggestion}\n`;
          }
        }
        
        markdown += `\n`;
      }
    }

    // 问题总结
    if (issues.length > 0) {
      markdown += `## 问题总结\n\n`;
      
      const highIssues = issues.filter(i => i.severity === 'high');
      const mediumIssues = issues.filter(i => i.severity === 'medium');
      const lowIssues = issues.filter(i => i.severity === 'low');

      if (highIssues.length > 0) {
        markdown += `### 🔴 高优先级问题\n\n`;
        for (const issue of highIssues) {
          markdown += `- **${issue.testCase}**: ${issue.description}\n`;
        }
        markdown += `\n`;
      }

      if (mediumIssues.length > 0) {
        markdown += `### ⚠️ 中优先级问题\n\n`;
        for (const issue of mediumIssues) {
          markdown += `- **${issue.testCase}**: ${issue.description}\n`;
        }
        markdown += `\n`;
      }

      if (lowIssues.length > 0) {
        markdown += `### 💡 低优先级问题\n\n`;
        for (const issue of lowIssues) {
          markdown += `- **${issue.testCase}**: ${issue.description}\n`;
        }
        markdown += `\n`;
      }
    }

    // 修改建议
    const failedTests = results.filter(r => r.status === 'failed');
    if (failedTests.length > 0) {
      markdown += `## 修改建议\n\n`;
      
      for (const test of failedTests) {
        if (test.suggestions && test.suggestions.length > 0) {
          markdown += `### ${test.suite} - ${test.name}\n\n`;
          for (const suggestion of test.suggestions) {
            markdown += `- ${suggestion}\n`;
          }
          markdown += `\n`;
        }
      }
    }

    // 测试统计图表（使用Markdown表格）
    markdown += `## 测试统计\n\n`;
    markdown += `| 测试套件 | 总数 | 通过 | 失败 | 跳过 | 通过率 |\n`;
    markdown += `|---------|------|------|------|------|--------|\n`;
    
    const suiteStats = this.calculateSuiteStats(results);
    for (const [suite, stats] of Object.entries(suiteStats)) {
      const suitePassRate = stats.total > 0 ? ((stats.passed / stats.total) * 100).toFixed(2) : '0.00';
      markdown += `| ${suite} | ${stats.total} | ${stats.passed} | ${stats.failed} | ${stats.skipped} | ${suitePassRate}% |\n`;
    }

    markdown += `\n`;
    markdown += `---\n\n`;
    markdown += `**报告生成时间**: ${new Date().toLocaleString('zh-CN')}\n`;

    return markdown;
  }

  /**
   * 按测试套件分组
   */
  private groupBySuite(results: TestResult[]): Record<string, TestResult[]> {
    const grouped: Record<string, TestResult[]> = {};
    
    for (const result of results) {
      if (!grouped[result.suite]) {
        grouped[result.suite] = [];
      }
      grouped[result.suite].push(result);
    }
    
    return grouped;
  }

  /**
   * 计算测试套件统计
   */
  private calculateSuiteStats(results: TestResult[]): Record<string, { total: number; passed: number; failed: number; skipped: number }> {
    const stats: Record<string, { total: number; passed: number; failed: number; skipped: number }> = {};
    
    for (const result of results) {
      if (!stats[result.suite]) {
        stats[result.suite] = { total: 0, passed: 0, failed: 0, skipped: 0 };
      }
      
      stats[result.suite].total++;
      if (result.status === 'passed') stats[result.suite].passed++;
      else if (result.status === 'failed') stats[result.suite].failed++;
      else if (result.status === 'skipped') stats[result.suite].skipped++;
    }
    
    return stats;
  }

  /**
   * 清空结果
   */
  clear(): void {
    this.results = [];
    this.issues = [];
  }
}

// 导出单例
export const reportHelper = new ReportHelper();

