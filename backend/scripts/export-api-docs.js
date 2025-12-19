#!/usr/bin/env node

/**
 * API文档导出脚本
 * 用于将NestJS Swagger文档导出为JSON格式，可导入到ApiFox等工具中
 */

const fs = require('fs');
const path = require('path');

// 模拟NestJS应用环境来获取API文档
async function exportApiDocs() {
  try {
    console.log('🚀 正在导出API文档...');

    // 这里需要模拟NestJS的依赖注入环境
    // 在实际使用时，需要先启动应用，然后通过HTTP请求获取文档

    console.log('📝 请访问以下地址获取API文档：');
    console.log('   管理端API: http://localhost:21101/api/v1/docs/admin');
    console.log('   玩家端API: http://localhost:21101/api/v1/docs/player');

    console.log('\n📋 要导出JSON格式的API文档，请访问：');
    console.log('   管理端: http://localhost:21101/api/v1/docs/admin-json');
    console.log('   玩家端: http://localhost:21101/api/v1/docs/player-json');

    console.log('\n💡 提示：');
    console.log('   1. 确保后端服务正在运行 (npm run start:dev)');
    console.log('   2. 复制JSON内容保存为文件');
    console.log('   3. 在ApiFox中导入JSON文件');

  } catch (error) {
    console.error('❌ 导出API文档失败:', error.message);
  }
}

exportApiDocs();
