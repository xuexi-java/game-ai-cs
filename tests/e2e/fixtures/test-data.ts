/**
 * 测试数据定义
 * 包含游戏、问题类型等测试数据
 */

export interface TestGame {
  id: string;
  name: string;
}

export interface TestIssueType {
  id: string;
  name: string;
  requireDirectTransfer?: boolean;
}

export interface TestIdentityData {
  gameId: string;
  serverName: string;
  playerIdOrName: string;
  issueTypeId: string;
}

export interface TestIntakeFormData {
  description: string;
  occurredAt?: string;
  paymentOrderNo?: string;
}

// 测试游戏数据
export const testGames: TestGame[] = [
  { id: '1', name: '弹弹堂' },
  { id: '2', name: '神曲' },
];

// 测试问题类型数据
export const testIssueTypes: TestIssueType[] = [
  { id: '1', name: '充值问题', requireDirectTransfer: true },
  { id: '2', name: '游戏bug', requireDirectTransfer: false },
  { id: '3', name: '账号问题', requireDirectTransfer: false },
  { id: '4', name: '其他问题', requireDirectTransfer: false },
];

// 默认测试身份数据
export const defaultIdentityData: TestIdentityData = {
  gameId: testGames[0].id,
  serverName: '测试区服',
  playerIdOrName: '测试角色123',
  issueTypeId: testIssueTypes[1].id, // 使用非直接转人工的问题类型
};

// 默认问题反馈表单数据
export const defaultIntakeFormData: TestIntakeFormData = {
  description: '这是一个测试问题描述，用于验证系统功能是否正常工作。',
  occurredAt: new Date().toISOString(),
  paymentOrderNo: 'TEST_ORDER_123456',
};

// 测试消息数据
export const testMessages = {
  player: [
    '你好，我遇到了一个问题',
    '我的账号无法登录',
    '请帮我处理一下',
  ],
  agent: [
    '您好，我是客服，很高兴为您服务',
    '请稍等，我帮您查询一下',
    '问题已解决，感谢您的反馈',
  ],
};

// 生成随机测试数据
export function generateRandomIdentityData(): TestIdentityData {
  const randomGame = testGames[Math.floor(Math.random() * testGames.length)];
  const randomIssueType = testIssueTypes[Math.floor(Math.random() * testIssueTypes.length)];
  
  return {
    gameId: randomGame.id,
    serverName: `测试区服${Math.floor(Math.random() * 100)}`,
    playerIdOrName: `测试角色${Math.floor(Math.random() * 10000)}`,
    issueTypeId: randomIssueType.id,
  };
}

// 生成随机问题描述
export function generateRandomDescription(): string {
  const descriptions = [
    '游戏登录后无法进入，一直卡在加载界面',
    '充值后未到账，订单号：TEST123456',
    '角色数据异常，等级和装备丢失',
    '游戏内无法正常聊天，消息发送失败',
    '活动奖励未发放，请帮忙查询',
  ];
  
  return descriptions[Math.floor(Math.random() * descriptions.length)];
}

