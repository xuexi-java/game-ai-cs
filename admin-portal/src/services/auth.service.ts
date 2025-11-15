import apiClient from './api';
import type { LoginRequest, LoginResponse, User } from '../types';

/**
 * 管理员登录
 */
export const login = async (data: LoginRequest): Promise<LoginResponse> => {
  return apiClient.post('/auth/login', data);
};

/**
 * 获取当前用户信息
 */
export const getCurrentUser = (): User | null => {
  const userStr = localStorage.getItem('admin_user');
  return userStr ? JSON.parse(userStr) : null;
};

/**
 * 保存用户信息到本地存储
 */
export const saveUserInfo = (token: string, user: User) => {
  localStorage.setItem('admin_token', token);
  localStorage.setItem('admin_user', JSON.stringify(user));
};

/**
 * 清除用户信息
 */
export const clearUserInfo = () => {
  localStorage.removeItem('admin_token');
  localStorage.removeItem('admin_user');
};

/**
 * 检查是否已登录
 */
export const isAuthenticated = (): boolean => {
  return !!localStorage.getItem('admin_token');
};
