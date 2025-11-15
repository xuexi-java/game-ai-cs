<p align="center">
  <a href="http://nestjs.com/" target="blank"><img src="https://nestjs.com/img/logo-small.svg" width="120" alt="Nest Logo" /></a>
</p>

[circleci-image]: https://img.shields.io/circleci/build/github/nestjs/nest/master?token=abc123def456
[circleci-url]: https://circleci.com/gh/nestjs/nest

  <p align="center">A progressive <a href="http://nodejs.org" target="_blank">Node.js</a> framework for building efficient and scalable server-side applications.</p>
    <p align="center">
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/v/@nestjs/core.svg" alt="NPM Version" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/l/@nestjs/core.svg" alt="Package License" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/dm/@nestjs/common.svg" alt="NPM Downloads" /></a>
<a href="https://circleci.com/gh/nestjs/nest" target="_blank"><img src="https://img.shields.io/circleci/build/github/nestjs/nest/master" alt="CircleCI" /></a>
<a href="https://discord.gg/G7Qnnhy" target="_blank"><img src="https://img.shields.io/badge/discord-online-brightgreen.svg" alt="Discord"/></a>
<a href="https://opencollective.com/nest#backer" target="_blank"><img src="https://opencollective.com/nest/backers/badge.svg" alt="Backers on Open Collective" /></a>
<a href="https://opencollective.com/nest#sponsor" target="_blank"><img src="https://opencollective.com/nest/sponsors/badge.svg" alt="Sponsors on Open Collective" /></a>
  <a href="https://paypal.me/kamilmysliwiec" target="_blank"><img src="https://img.shields.io/badge/Donate-PayPal-ff3f59.svg" alt="Donate us"/></a>
    <a href="https://opencollective.com/nest#sponsor"  target="_blank"><img src="https://img.shields.io/badge/Support%20us-Open%20Collective-41B883.svg" alt="Support us"></a>
  <a href="https://twitter.com/nestframework" target="_blank"><img src="https://img.shields.io/twitter/follow/nestframework.svg?style=social&label=Follow" alt="Follow us on Twitter"></a>
</p>
  <!--[![Backers on Open Collective](https://opencollective.com/nest/backers/badge.svg)](https://opencollective.com/nest#backer)
  [![Sponsors on Open Collective](https://opencollective.com/nest/sponsors/badge.svg)](https://opencollective.com/nest#sponsor)-->

## Description

[Nest](https://github.com/nestjs/nest) framework TypeScript starter repository.

## Project setup

```bash
$ npm install
```

## Compile and run the project

```bash
# development
$ npm run start

# watch mode
$ npm run start:dev

# production mode
$ npm run start:prod
```

## 测试指南

### 测试前准备

1. **确保依赖已安装**
```bash
cd backend
npm install
```

2. **确保数据库服务运行**（E2E测试需要）
```bash
# 在项目根目录运行
docker-compose up -d
```

### 运行测试

#### 1. 运行所有单元测试
```bash
cd backend
npm test
```

#### 2. 运行测试并查看覆盖率报告
```bash
npm run test:cov
```
覆盖率报告会生成在 `coverage/` 目录下，可以用浏览器打开 `coverage/lcov-report/index.html` 查看详细报告。

#### 3. 监听模式运行测试（推荐开发时使用）
```bash
npm run test:watch
```
文件保存后会自动重新运行相关测试。

#### 4. 运行E2E测试
```bash
npm run test:e2e
```

#### 5. 调试模式运行测试
```bash
npm run test:debug
```

### 运行特定测试文件

```bash
# 运行单个测试文件
npm test -- auth.service.spec.ts

# 运行匹配模式的测试文件
npm test -- --testNamePattern="AuthService"

# 运行特定模块的测试
npm test -- auth
```

### 测试文件说明

已创建的测试文件：

- ✅ `auth.service.spec.ts` - 认证服务测试（登录、Token验证）
- ✅ `game.service.spec.ts` - 游戏管理服务测试（CRUD操作）
- ✅ `ticket.service.spec.ts` - 工单服务测试（创建、查询、更新）
- ✅ `message.service.spec.ts` - 消息服务测试（创建消息、查询消息）
- ✅ `session.service.spec.ts` - 会话服务测试（创建会话、AI分流、转人工）
- ✅ `urgency-rule.service.spec.ts` - 紧急规则服务测试（规则管理、队列排序）
- ✅ `dify.service.spec.ts` - Dify AI服务测试（AI分流、回复优化）
- ✅ `satisfaction.service.spec.ts` - 满意度评价服务测试（评价创建、统计）

### 测试覆盖率目标

- **语句覆盖率（Statements）**: > 80%
- **分支覆盖率（Branches）**: > 75%
- **函数覆盖率（Functions）**: > 80%
- **行覆盖率（Lines）**: > 80%

### 常见问题

#### 1. 测试失败：找不到模块
```bash
# 重新安装依赖
npm install
```

#### 2. 测试超时
检查测试中的异步操作是否正确处理，确保所有 Promise 都被 await。

#### 3. Mock 不生效
确保在 `beforeEach` 中正确设置 mock，并在 `afterEach` 中清理。

#### 4. 数据库连接错误（E2E测试）
确保 Docker 容器正在运行：
```bash
docker-compose ps
docker-compose up -d
```

### 测试最佳实践

1. **每个测试应该独立**：不依赖其他测试的执行顺序
2. **使用描述性的测试名称**：清楚说明测试的内容
3. **测试边界情况**：包括正常情况、异常情况和边界值
4. **保持测试简洁**：每个测试只验证一个功能点
5. **使用 Mock**：隔离外部依赖，提高测试速度
6. **定期运行测试**：在提交代码前运行测试确保没有破坏现有功能

## Deployment

When you're ready to deploy your NestJS application to production, there are some key steps you can take to ensure it runs as efficiently as possible. Check out the [deployment documentation](https://docs.nestjs.com/deployment) for more information.

If you are looking for a cloud-based platform to deploy your NestJS application, check out [Mau](https://mau.nestjs.com), our official platform for deploying NestJS applications on AWS. Mau makes deployment straightforward and fast, requiring just a few simple steps:

```bash
$ npm install -g @nestjs/mau
$ mau deploy
```

With Mau, you can deploy your application in just a few clicks, allowing you to focus on building features rather than managing infrastructure.

## Resources

Check out a few resources that may come in handy when working with NestJS:

- Visit the [NestJS Documentation](https://docs.nestjs.com) to learn more about the framework.
- For questions and support, please visit our [Discord channel](https://discord.gg/G7Qnnhy).
- To dive deeper and get more hands-on experience, check out our official video [courses](https://courses.nestjs.com/).
- Deploy your application to AWS with the help of [NestJS Mau](https://mau.nestjs.com) in just a few clicks.
- Visualize your application graph and interact with the NestJS application in real-time using [NestJS Devtools](https://devtools.nestjs.com).
- Need help with your project (part-time to full-time)? Check out our official [enterprise support](https://enterprise.nestjs.com).
- To stay in the loop and get updates, follow us on [X](https://x.com/nestframework) and [LinkedIn](https://linkedin.com/company/nestjs).
- Looking for a job, or have a job to offer? Check out our official [Jobs board](https://jobs.nestjs.com).

## Support

Nest is an MIT-licensed open source project. It can grow thanks to the sponsors and support by the amazing backers. If you'd like to join them, please [read more here](https://docs.nestjs.com/support).

## Stay in touch

- Author - [Kamil Myśliwiec](https://twitter.com/kammysliwiec)
- Website - [https://nestjs.com](https://nestjs.com/)
- Twitter - [@nestframework](https://twitter.com/nestframework)

## License

Nest is [MIT licensed](https://github.com/nestjs/nest/blob/master/LICENSE).
