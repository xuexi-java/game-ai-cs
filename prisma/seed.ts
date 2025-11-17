import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

// 密码哈希函数
function hashPassword(password: string): string {
  // 使用 bcrypt 加密密码
  return bcrypt.hashSync(password, 10);
}

const prisma = new PrismaClient();

async function main() {
  console.log('开始初始化数据库...');

  // 1. 创建初始管理员账户
  const adminPassword = hashPassword('admin123');
  const admin = await prisma.user.upsert({
    where: { username: 'admin' },
    update: {},
    create: {
      username: 'admin',
      password: adminPassword,
      role: 'ADMIN',
      realName: '系统管理员',
      email: 'admin@example.com',
    },
  });
  console.log('✓ 创建管理员账户:', admin.username);

  // 2. 创建示例客服账户
  const agentPassword = hashPassword('agent123');
  const agent = await prisma.user.upsert({
    where: { username: 'agent1' },
    update: {},
    create: {
      username: 'agent1',
      password: agentPassword,
      role: 'AGENT',
      realName: '客服001',
      email: 'agent1@example.com',
    },
  });
  console.log('✓ 创建客服账户:', agent.username);

  // 3. 创建示例游戏配置
  const game1 = await prisma.game.upsert({
    where: { name: '弹弹堂' },
    update: {},
    create: {
      name: '弹弹堂',
      icon: null,
      enabled: true,
      difyApiKey: 'your-dify-api-key-here', // 请替换为实际的API Key
      difyBaseUrl: 'https://api.dify.ai/v1',
    },
  });
  console.log('✓ 创建游戏配置:', game1.name);

  // 4. 为游戏创建示例区服
  const server1 = await prisma.server.upsert({
    where: { id: 'server-1' },
    update: {},
    create: {
      id: 'server-1',
      gameId: game1.id,
      name: '一区',
      enabled: true,
    },
  });
  console.log('✓ 创建区服:', server1.name);

  const server2 = await prisma.server.upsert({
    where: { id: 'server-2' },
    update: {},
    create: {
      id: 'server-2',
      gameId: game1.id,
      name: '二区',
      enabled: true,
    },
  });
  console.log('✓ 创建区服:', server2.name);

  // 5. 创建示例紧急排序规则
  const rule1 = await prisma.urgencyRule.create({
    data: {
      name: '充值问题优先',
      enabled: true,
      priorityWeight: 80,
      description: '充值相关问题的优先级规则',
      conditions: {
        keywords: ['充值', '支付', '付款'],
        identityStatus: 'VERIFIED_PAYMENT',
      },
    },
  });
  console.log('✓ 创建紧急排序规则:', rule1.name);

  const rule2 = await prisma.urgencyRule.create({
    data: {
      name: '紧急工单优先',
      enabled: true,
      priorityWeight: 90,
      description: '标记为紧急的工单优先处理',
      conditions: {
        priority: 'URGENT',
      },
    },
  });
  console.log('✓ 创建紧急排序规则:', rule2.name);

  console.log('\n✅ 数据库初始化完成！');
  console.log('\n默认账户信息:');
  console.log('  管理员: admin / admin123');
  console.log('  客服: agent1 / agent123');
  console.log('\n⚠️  请在生产环境中修改默认密码！');
}

main()
  .catch((e) => {
    console.error('❌ 数据库初始化失败:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

