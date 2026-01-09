import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import * as dotenv from 'dotenv';

// 加载环境变量
dotenv.config();

// 密码哈希函数
function hashPassword(password: string): string {
  // 使用 bcrypt 加密密码
  return bcrypt.hashSync(password, 10);
}

// 加密函数（与 EncryptionService 保持一致）
function encryptSecret(text: string): string {
  if (!text) return text;

  const secretKey = process.env.ENCRYPTION_SECRET_KEY;
  const salt = process.env.ENCRYPTION_SALT;

  if (!secretKey || secretKey.length < 32) {
    console.warn('⚠️  ENCRYPTION_SECRET_KEY 未配置或长度不足，playerApiSecret 将以明文存储');
    return text;
  }
  if (!salt) {
    console.warn('⚠️  ENCRYPTION_SALT 未配置，playerApiSecret 将以明文存储');
    return text;
  }

  const key = crypto.pbkdf2Sync(secretKey, salt, 100000, 32, 'sha256');
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const tag = cipher.getAuthTag();

  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted}`;
}

const prisma = new PrismaClient();

// 重试函数
async function retry<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  delay: number = 1000,
): Promise<T> {
  let lastError: Error;
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      if (i < maxRetries - 1) {
        console.warn(`⚠️  操作失败，${delay}ms 后重试 (${i + 1}/${maxRetries})...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }
  throw lastError!;
}

async function main() {
  console.log('🌱 开始初始化数据库...\n');

  // 检查必要的环境变量
  if (!process.env.DATABASE_URL) {
    console.error('❌ 错误: DATABASE_URL 环境变量未设置');
    process.exit(1);
  }

  try {
    // 如果设置了 SKIP_SEED 环境变量，直接跳过
    if (process.env.SKIP_SEED === 'true') {
      console.log('⏭️  跳过种子数据初始化 (SKIP_SEED=true)');
      return;
    }

    // 检查数据库是否已初始化（通过检查是否存在管理员账户）
    const existingAdmin = await prisma.user.findFirst({
      where: {
        role: 'ADMIN',
        username: 'admin',
      },
    });

    if (existingAdmin) {
      console.log('✅ 数据库已初始化，跳过种子数据创建');
      console.log('💡 提示: 如需重新初始化，请设置 SKIP_SEED=false 或删除管理员账户');
      return;
    }

    console.log('📝 检测到新数据库，开始初始化种子数据...\n');

  // 1. 创建初始管理员账户
  const adminUsers = [
    {
      username: 'admin',
      password: 'admin123',
      role: 'ADMIN' as const,
      realName: '系统管理员',
      email: 'admin@example.com',
      phone: '13800000001',
    },
    {
      username: 'admin2',
      password: 'admin123',
      role: 'ADMIN' as const,
      realName: '副管理员',
      email: 'admin2@example.com',
      phone: '13800000002',
    },
  ];

    // 1. 创建初始管理员账户（幂等性：使用 upsert）
    for (const userData of adminUsers) {
      await retry(async () => {
        const hashedPassword = hashPassword(userData.password);
        const user = await prisma.user.upsert({
          where: { username: userData.username },
          update: {
            // 如果用户已存在，更新密码（确保密码是最新的）
            password: hashedPassword,
            realName: userData.realName,
            email: userData.email,
            phone: userData.phone,
          },
          create: {
            username: userData.username,
            password: hashedPassword,
            role: userData.role,
            realName: userData.realName,
            email: userData.email,
            phone: userData.phone,
          },
        });
        console.log(`✓ 管理员账户: ${user.username} (${userData.realName})`);
      });
    }

    // 2. 创建示例客服账户（幂等性：使用 upsert）
    const agentUsers = [
    {
      username: 'agent1',
      password: 'agent123',
      role: 'AGENT' as const,
      realName: '客服001',
      email: 'agent1@example.com',
      phone: '13800001001',
    },
    {
      username: 'agent2',
      password: 'agent123',
      role: 'AGENT' as const,
      realName: '客服002',
      email: 'agent2@example.com',
      phone: '13800001002',
    },
    {
      username: 'agent3',
      password: 'agent123',
      role: 'AGENT' as const,
      realName: '客服003',
      email: 'agent3@example.com',
      phone: '13800001003',
    },
  ];

    for (const userData of agentUsers) {
      await retry(async () => {
        const hashedPassword = hashPassword(userData.password);
        const user = await prisma.user.upsert({
          where: { username: userData.username },
          update: {
            password: hashedPassword,
            realName: userData.realName,
            email: userData.email,
            phone: userData.phone,
          },
          create: {
            username: userData.username,
            password: hashedPassword,
            role: userData.role,
            realName: userData.realName,
            email: userData.email,
            phone: userData.phone,
          },
        });
        console.log(`✓ 客服账户: ${user.username} (${userData.realName})`);
      });
    }

    // 3. 创建示例游戏配置（幂等性：使用 upsert，更新时不覆盖已存在的 API Key）
    const games = [
      {
        name: '弹弹堂',
        difyApiKey: 'app-pmj98vFtoyeLIaVYUm85J0Ud', // 请替换为实际的API Key
        difyBaseUrl: 'http://ai.sh7road.com/v1',
      },
      {
        name: '神曲',
        difyApiKey: 'app-pmj98vFtoyeLIaVYUm85J0Ud', // 请替换为实际的API Key
        difyBaseUrl: 'http://ai.sh7road.com/v1',
      },
      {
        name: 'test_game',  // 测试游戏（用于 WebView 测试）
        difyApiKey: 'app-pmj98vFtoyeLIaVYUm85J0Ud',  // 使用与其他游戏相同的 API Key
        difyBaseUrl: 'http://ai.sh7road.com/v1',
        playerApiEnabled: true,
        playerApiSecret: 'test-secret-123',
        playerApiNonce: 'testnonce1234567',
      },
    ];

    for (const gameData of games) {
      await retry(async () => {
        // 检查游戏是否已存在
        const existing = await prisma.game.findUnique({
          where: { name: gameData.name },
        });

        // 准备加密的 playerApiSecret
        const encryptedSecret = (gameData as any).playerApiSecret
          ? encryptSecret((gameData as any).playerApiSecret)
          : undefined;

        const game = await prisma.game.upsert({
          where: { name: gameData.name },
          update: {
            // 如果游戏已存在，更新 API Key 和 BaseUrl（仅在 seed 中提供了有效值时）
            // 如果 API Key 是占位符，则不更新（保持现有配置）
            ...(gameData.difyApiKey && gameData.difyApiKey !== 'your-dify-api-key-here'
              ? { difyApiKey: gameData.difyApiKey }
              : {}),
            difyBaseUrl: gameData.difyBaseUrl,
            // 更新玩家API配置（如果提供了）
            ...((gameData as any).playerApiEnabled !== undefined
              ? { playerApiEnabled: (gameData as any).playerApiEnabled }
              : {}),
            ...((gameData as any).playerApiNonce
              ? { playerApiNonce: (gameData as any).playerApiNonce }
              : {}),
            ...(encryptedSecret
              ? { playerApiSecret: encryptedSecret }
              : {}),
          },
          create: {
            name: gameData.name,
            icon: null,
            enabled: true,
            difyApiKey: gameData.difyApiKey,
            difyBaseUrl: gameData.difyBaseUrl,
            playerApiEnabled: (gameData as any).playerApiEnabled ?? false,
            playerApiNonce: (gameData as any).playerApiNonce,
            playerApiSecret: encryptedSecret,
          },
        });
        console.log(`✓ 游戏配置: ${game.name}${(gameData as any).playerApiEnabled ? ' (玩家API已启用)' : ''}`);
      });
    }

    // 4. 创建示例紧急排序规则（幂等性：检查是否存在）
    const rules = [
      {
        name: '充值问题优先',
        enabled: true,
        priorityWeight: 80,
        description: '充值相关问题的优先级规则',
        conditions: {
          keywords: ['充值', '支付', '付款'],
          identityStatus: 'VERIFIED_PAYMENT',
        },
      },
      {
        name: '紧急工单优先',
        enabled: true,
        priorityWeight: 90,
        description: '标记为紧急的工单优先处理',
        conditions: {
          priority: 'URGENT',
        },
      },
    ];

    for (const ruleData of rules) {
      await retry(async () => {
        const existing = await prisma.urgencyRule.findFirst({
          where: { name: ruleData.name },
        });

        if (!existing) {
          const rule = await prisma.urgencyRule.create({
            data: ruleData,
          });
          console.log(`✓ 紧急排序规则: ${rule.name}`);
        } else {
          console.log(`✓ 紧急排序规则已存在: ${ruleData.name}`);
        }
      });
    }

    // 5. 清理并重建问题类型
    console.log('\n📝 清理旧的问题类型...');
    await prisma.issueType.deleteMany({});

    const issueTypes = [
      {
        name: '账号与充值问题',
        description: '账号相关问题及充值、支付问题',
        priorityWeight: 50,
        sortOrder: 1,
        requireDirectTransfer: false,
        routeMode: 'AI',
      },
      {
        name: '服务器与活动问题',
        description: '服务器问题及游戏活动相关咨询',
        priorityWeight: 50,
        sortOrder: 2,
        requireDirectTransfer: false,
        routeMode: 'AI',
      },
      {
        name: '道具问题',
        description: '游戏道具相关问题',
        priorityWeight: 50,
        sortOrder: 3,
        requireDirectTransfer: false,
        routeMode: 'AI',
      },
      {
        name: 'BUG与建议反馈',
        description: '游戏BUG反馈及功能建议',
        priorityWeight: 50,
        sortOrder: 4,
        requireDirectTransfer: false,
        routeMode: 'AI',
      },
      {
        name: '其他问题',
        description: '其他类型的咨询问题',
        priorityWeight: 50,
        sortOrder: 5,
        requireDirectTransfer: false,
        routeMode: 'AI',
      },
    ];

    for (const issueTypeData of issueTypes) {
      await retry(async () => {
        const issueType = await prisma.issueType.upsert({
          where: { name: issueTypeData.name },
          update: {
            description: issueTypeData.description,
            priorityWeight: issueTypeData.priorityWeight,
            sortOrder: issueTypeData.sortOrder,
            requireDirectTransfer: issueTypeData.requireDirectTransfer,
            routeMode: issueTypeData.routeMode,
          },
          create: issueTypeData,
        });
        console.log(`✓ 问题类型: ${issueType.name}`);
      });
    }

    console.log('\n✅ 数据库初始化完成！');
    console.log('\n📋 默认账户信息:');
    console.log('\n  管理员账户:');
    console.log('    - admin / admin123 (系统管理员)');
    console.log('    - admin2 / admin123 (副管理员)');
    console.log('\n  客服账户:');
    console.log('    - agent1 / agent123 (客服001)');
    console.log('    - agent2 / agent123 (客服002)');
    console.log('    - agent3 / agent123 (客服003)');
    console.log('\n📊 初始化数据:');
    console.log(`  游戏配置: ${games.length} 个`);
    console.log(`  紧急排序规则: ${rules.length} 个`);
    console.log(`  问题类型: ${issueTypes.length} 个`);
    console.log('\n⚠️  重要提示:');
    console.log('  1. 所有账户的默认密码都是 "admin123" 或 "agent123"');
    console.log('  2. 请在生产环境中立即修改所有账户的密码！');
    console.log('  3. 建议为每个账户设置强密码（至少8位，包含字母和数字）');
    console.log('  4. 可以通过管理端修改账户密码');
    console.log('  5. 游戏配置中的 Dify API Key 需要手动配置');
  } catch (error) {
    console.error('\n❌ 数据库初始化失败！');
    console.error('错误详情:', error);
    console.error('\n💡 排查建议:');
    console.error('  1. 检查数据库连接是否正常');
    console.error('  2. 检查数据库用户权限是否足够');
    console.error('  3. 检查 Prisma schema 是否与数据库结构一致');
    console.error('  4. 查看上方错误信息，定位具体失败的操作');
    throw error;
  }
}

main()
  .catch((e) => {
    console.error('❌ 数据库初始化失败:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

