/**
 * 测试执行入口
 * 在Agent模式下直接运行此文件来执行测试
 */

// 注意：这个文件需要在Agent模式下运行，因为需要访问MCP工具
// 在Agent模式下，MCP工具函数是直接可用的

import { runAllTests } from './runner';

// 执行所有测试
runAllTests()
  .then(() => {
    console.log('测试执行完成');
    process.exit(0);
  })
  .catch((error) => {
    console.error('测试执行失败:', error);
    process.exit(1);
  });

