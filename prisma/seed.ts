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

  const game2 = await prisma.game.upsert({
    where: { name: '神曲' },
    update: {},
    create: {
      name: '神曲',
      icon: null,
      enabled: true,
      difyApiKey: 'your-dify-api-key-here', // 请替换为实际的API Key
      difyBaseUrl: 'https://api.dify.ai/v1',
    },
  });
  console.log('✓ 创建游戏配置:', game2.name);

  // 4. 创建示例紧急排序规则
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

  // 5. 创建快捷回复分类
  const categories = [
    { name: '问候语', isGlobal: true, sortOrder: 1 },
    { name: '问题确认', isGlobal: true, sortOrder: 2 },
    { name: '问题处理中', isGlobal: true, sortOrder: 3 },
    { name: '问题已解决', isGlobal: true, sortOrder: 4 },
    { name: '充值相关', isGlobal: true, sortOrder: 5 },
    { name: '账号相关', isGlobal: true, sortOrder: 6 },
    { name: '游戏问题', isGlobal: true, sortOrder: 7 },
    { name: '致歉用语', isGlobal: true, sortOrder: 8 },
    { name: '结束语', isGlobal: true, sortOrder: 9 },
  ];

  const createdCategories: { id: string; name: string }[] = [];
  for (const cat of categories) {
    // 先查找是否已存在
    let category = await prisma.quickReplyCategory.findFirst({
      where: {
        name: cat.name,
        deletedAt: null,
      },
    });

    // 如果不存在，则创建
    if (!category) {
      category = await prisma.quickReplyCategory.create({
        data: {
          name: cat.name,
          isGlobal: cat.isGlobal,
          sortOrder: cat.sortOrder,
          isActive: true,
        },
      });
      console.log('✓ 创建快捷回复分类:', category.name);
    } else {
      console.log('✓ 快捷回复分类已存在:', category.name);
    }
    createdCategories.push(category);
  }

  // 6. 创建快捷回复内容
  const replies = [
    // 问候语
    {
      categoryName: '问候语',
      content: '您好，很高兴为您服务！',
      sortOrder: 1,
    },
    {
      categoryName: '问候语',
      content: '您好，请问有什么可以帮到您的吗？',
      sortOrder: 2,
    },
    {
      categoryName: '问候语',
      content: '您好，欢迎咨询，我会尽力为您解决问题。',
      sortOrder: 3,
    },
    {
      categoryName: '问候语',
      content: '您好，感谢您的耐心等待，现在为您服务。',
      sortOrder: 4,
    },
    // 问题确认
    {
      categoryName: '问题确认',
      content: '好的，我已经了解您的问题，让我为您核实一下。',
      sortOrder: 1,
    },
    {
      categoryName: '问题确认',
      content: '收到，我会尽快为您处理这个问题。',
      sortOrder: 2,
    },
    {
      categoryName: '问题确认',
      content: '明白了，您的问题我已经记录，请稍等片刻。',
      sortOrder: 3,
    },
    {
      categoryName: '问题确认',
      content: '好的，我理解您的情况，正在为您查询相关信息。',
      sortOrder: 4,
    },
    // 问题处理中
    {
      categoryName: '问题处理中',
      content: '正在为您处理中，请稍等片刻。',
      sortOrder: 1,
    },
    {
      categoryName: '问题处理中',
      content: '我已经在为您核实相关信息，请您耐心等待。',
      sortOrder: 2,
    },
    {
      categoryName: '问题处理中',
      content: '正在为您查询，可能需要几分钟时间，请您稍候。',
      sortOrder: 3,
    },
    {
      categoryName: '问题处理中',
      content: '我已经提交了您的申请，正在等待系统处理，请稍等。',
      sortOrder: 4,
    },
    // 问题已解决
    {
      categoryName: '问题已解决',
      content: '您的问题已经处理完成，请刷新游戏查看。',
      sortOrder: 1,
    },
    {
      categoryName: '问题已解决',
      content: '问题已解决，如有其他问题随时联系我们。',
      sortOrder: 2,
    },
    {
      categoryName: '问题已解决',
      content: '您的申请已通过，相关奖励已发放到您的账号，请注意查收。',
      sortOrder: 3,
    },
    {
      categoryName: '问题已解决',
      content: '问题已处理完成，感谢您的配合。',
      sortOrder: 4,
    },
    // 充值相关
    {
      categoryName: '充值相关',
      content: '关于充值问题，我需要核实一下您的订单信息，请提供订单号。',
      sortOrder: 1,
    },
    {
      categoryName: '充值相关',
      content: '充值未到账的问题，我已经为您提交了补单申请，预计1-2小时内到账。',
      sortOrder: 2,
    },
    {
      categoryName: '充值相关',
      content: '您的充值订单已核实，金额已成功到账，请刷新游戏查看。',
      sortOrder: 3,
    },
    {
      categoryName: '充值相关',
      content: '充值问题需要核实订单信息，请提供：游戏区服、角色名、订单号、充值金额。',
      sortOrder: 4,
    },
    {
      categoryName: '充值相关',
      content: '充值未到账的问题，我已经为您提交了补单申请，请耐心等待处理结果。',
      sortOrder: 5,
    },
    // 账号相关
    {
      categoryName: '账号相关',
      content: '关于账号问题，为了您的账号安全，需要核实一些信息。',
      sortOrder: 1,
    },
    {
      categoryName: '账号相关',
      content: '账号找回需要提供：注册邮箱、注册手机号、最近登录时间等信息。',
      sortOrder: 2,
    },
    {
      categoryName: '账号相关',
      content: '账号安全问题，建议您及时修改密码，并绑定手机号和邮箱。',
      sortOrder: 3,
    },
    {
      categoryName: '账号相关',
      content: '您的账号申诉已提交，我们会在24小时内处理，请耐心等待。',
      sortOrder: 4,
    },
    // 游戏问题
    {
      categoryName: '游戏问题',
      content: '关于游戏内的问题，我已经记录并提交给技术部门处理。',
      sortOrder: 1,
    },
    {
      categoryName: '游戏问题',
      content: '游戏BUG问题，我已经反馈给技术团队，会在后续版本中修复。',
      sortOrder: 2,
    },
    {
      categoryName: '游戏问题',
      content: '关于游戏功能的问题，建议您查看游戏公告或联系游戏内客服。',
      sortOrder: 3,
    },
    {
      categoryName: '游戏问题',
      content: '游戏卡顿问题，建议您清理缓存、重启游戏或检查网络连接。',
      sortOrder: 4,
    },
    {
      categoryName: '游戏问题',
      content: '关于游戏活动的问题，请查看游戏内活动公告，或关注官方公告。',
      sortOrder: 5,
    },
    // 致歉用语
    {
      categoryName: '致歉用语',
      content: '非常抱歉给您带来不便，我们会尽快为您处理。',
      sortOrder: 1,
    },
    {
      categoryName: '致歉用语',
      content: '抱歉让您久等了，我会尽快为您解决问题。',
      sortOrder: 2,
    },
    {
      categoryName: '致歉用语',
      content: '非常抱歉，由于系统原因导致的问题，我们正在紧急处理中。',
      sortOrder: 3,
    },
    {
      categoryName: '致歉用语',
      content: '抱歉给您带来困扰，我们会认真对待您的问题并尽快解决。',
      sortOrder: 4,
    },
    {
      categoryName: '致歉用语',
      content: '非常抱歉，由于我们的疏忽给您造成了不便，我们会立即处理。',
      sortOrder: 5,
    },
    // 结束语
    {
      categoryName: '结束语',
      content: '感谢您的咨询，如有其他问题随时联系我们，祝您游戏愉快！',
      sortOrder: 1,
    },
    {
      categoryName: '结束语',
      content: '问题已解决，感谢您的配合，祝您游戏愉快！',
      sortOrder: 2,
    },
    {
      categoryName: '结束语',
      content: '感谢您的耐心等待，如有其他问题随时联系我们。',
      sortOrder: 3,
    },
    {
      categoryName: '结束语',
      content: '问题已处理完成，感谢您的支持，祝您游戏愉快！',
      sortOrder: 4,
    },
    {
      categoryName: '结束语',
      content: '感谢您的反馈，我们会持续改进服务质量，祝您游戏愉快！',
      sortOrder: 5,
    },
  ];

  for (const reply of replies) {
    const category = createdCategories.find((c) => c.name === reply.categoryName);
    if (category) {
      // 检查是否已存在相同分类和内容的回复
      const existing = await prisma.quickReply.findFirst({
        where: {
          categoryId: category.id,
          content: reply.content,
          deletedAt: null,
        },
      });

      if (!existing) {
        await prisma.quickReply.create({
          data: {
            categoryId: category.id,
            content: reply.content,
            isGlobal: true,
            isActive: true,
            sortOrder: reply.sortOrder,
          },
        });
      }
    }
  }
  console.log(`✓ 创建快捷回复内容: ${replies.length} 条`);

  console.log('\n✅ 数据库初始化完成！');
  console.log('\n默认账户信息:');
  console.log('  管理员: admin / admin123');
  console.log('  客服: agent1 / agent123');
  console.log('\n快捷回复数据:');
  console.log(`  分类: ${categories.length} 个`);
  console.log(`  回复: ${replies.length} 条`);
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

