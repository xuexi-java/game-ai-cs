module.exports = {
  // 模块文件扩展名
  moduleFileExtensions: ['js', 'json', 'ts'],
  
  // 测试文件根目录
  rootDir: 'src',
  
  // 测试文件匹配模式（所有 .spec.ts 文件）
  testRegex: '.*\\.spec\\.ts$',
  
  // TypeScript 转换配置
  transform: {
    '^.+\\.(t|j)s$': [
      'ts-jest',
      {
        // TypeScript 编译选项
        experimentalDecorators: true,
        emitDecoratorMetadata: true,
        module: 'commonjs',
      },
    ],
  },
  
  // 覆盖率收集范围
  collectCoverageFrom: [
    '**/*.(t|j)s',
    // 排除测试文件
    '!**/*.spec.ts',
    // 排除接口和类型定义文件
    '!**/*.interface.ts',
    '!**/*.dto.ts',
    // 排除主入口文件
    '!**/main.ts',
  ],
  
  // 覆盖率报告输出目录
  coverageDirectory: '../coverage',
  
  // 测试环境（Node.js）
  testEnvironment: 'node',
  
  // 模块名称映射（用于路径别名）
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
  },
  
  // 覆盖率报告格式
  coverageReporters: ['text', 'lcov', 'html'],
  
  // 覆盖率阈值（可选，用于 CI/CD）
  // coverageThreshold: {
  //   global: {
  //     branches: 75,
  //     functions: 80,
  //     lines: 80,
  //     statements: 80,
  //   },
  // },
};

