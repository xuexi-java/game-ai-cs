/**
 * 表单校验工具函数
 */
import type { RuleObject } from 'antd/es/form';

type FieldValidator = (rule: RuleObject, value: string) => Promise<void>;

// 验证游戏ID
export const validateGameId: FieldValidator = (_, value) => {
  if (!value) {
    return Promise.reject(new Error('请选择游戏'));
  }
  return Promise.resolve();
};

// 验证区服名称（玩家自行输入）
export const validateServerName: FieldValidator = (_, value) => {
  if (!value || !value.trim()) {
    return Promise.reject(new Error('请输入区服名称'));
  }
  const trimmed = value.trim();
  if (trimmed.length < 1 || trimmed.length > 50) {
    return Promise.reject(new Error('区服名称长度应在1-50个字符之间'));
  }
  const invalidChars = /[<>'"&]/;
  if (invalidChars.test(trimmed)) {
    return Promise.reject(new Error('区服名称不能包含字符 < > \' " &'));
  }
  return Promise.resolve();
};

// 验证角色ID或昵称
export const validatePlayerIdOrName: FieldValidator = (_, value) => {
  if (!value) {
    return Promise.reject(new Error('请输入角色ID或昵称'));
  }
  if (value.length < 1 || value.length > 50) {
    return Promise.reject(new Error('角色ID或昵称长度应在1-50个字符之间'));
  }
  const invalidChars = /[<>'"&]/;
  if (invalidChars.test(value)) {
    return Promise.reject(new Error('角色ID或昵称不能包含字符 < > \' " &'));
  }
  return Promise.resolve();
};

// 验证问题描述
export const validateDescription: FieldValidator = (_, value) => {
  if (!value || !value.trim()) {
    return Promise.reject(new Error('请输入问题详情'));
  }
  if (value.length > 2000) {
    return Promise.reject(new Error('问题描述不能超过2000个字符'));
  }
  return Promise.resolve();
};

// 验证充值订单号
export const validatePaymentOrderNo: FieldValidator = (_, value) => {
  if (!value) {
    return Promise.resolve(); // 可选字段
  }
  const orderPattern = /^[A-Za-z0-9]{6,50}$/;
  if (!orderPattern.test(value)) {
    return Promise.reject(new Error('充值订单号格式不正确，应为6-50位数字或字母'));
  }
  return Promise.resolve();
};

// 验证文件大小
export const validateFileSize = (file: File, maxSizeMB: number = 10): void => {
  const fileSizeMB = file.size / 1024 / 1024;
  if (fileSizeMB > maxSizeMB) {
    throw new Error(`文件大小不能超过${maxSizeMB}MB`);
  }
};

// 验证文件类型
export const validateFileType = (
  file: File,
  allowedTypes: string[] = ['image/jpeg', 'image/png', 'image/gif']
): void => {
  if (!allowedTypes.includes(file.type)) {
    const typeNames = allowedTypes
      .map((type) => type.split('/')[1].toUpperCase())
      .join('、');
    throw new Error(`只支持${typeNames}格式的文件`);
  }
};

// 验证消息内容
export const validateMessageContent = (value: string) => {
  if (!value) {
    return Promise.reject(new Error('请输入消息内容'));
  }
  if (value.length > 1000) {
    return Promise.reject(new Error('消息内容不能超过1000个字符'));
  }
  return Promise.resolve();
};

// 通用字符串长度校验
export const validateStringLength = (
  value: string,
  fieldName: string,
  minLength: number = 1,
  maxLength: number = 100
) => {
  if (!value) {
    return Promise.reject(new Error(`请输入${fieldName}`));
  }
  if (value.length < minLength) {
    return Promise.reject(new Error(`${fieldName}长度至少${minLength}个字符`));
  }
  if (value.length > maxLength) {
    return Promise.reject(new Error(`${fieldName}长度不能超过${maxLength}个字符`));
  }
  return Promise.resolve();
};

// 基础 XSS 校验
export const validateXSS = (value: string) => {
  const xssPattern = /<script|javascript:|on\w+\s*=/i;
  if (xssPattern.test(value)) {
    return Promise.reject(new Error('内容包含潜在危险字符'));
  }
  return Promise.resolve();
};
