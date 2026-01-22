import axios from 'axios';
import type { AxiosInstance, AxiosResponse } from 'axios';
import { getGlobalMessage } from '../utils/message';
import { API_BASE_URL } from '../config/api';

// 认证失效锁：防止多个 401 请求同时触发重复的清除和跳转操作
let isAuthInvalid = false;

// 重置认证状态（登录成功后调用）
export const resetAuthState = () => {
  isAuthInvalid = false;
};

// 创建axios实例
const apiClient: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// 请求拦截器
apiClient.interceptors.request.use(
  (config) => {
    // 添加认证token
    const token = localStorage.getItem('admin_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// 响应拦截器
apiClient.interceptors.response.use(
  (response: AxiosResponse) => {
    // 后端使用 TransformInterceptor 包装响应，格式为 { success, data, timestamp }
    // 提取 data 字段
    if (response.data && typeof response.data === 'object' && 'data' in response.data) {
      return response.data.data;
    }
    // 兼容直接返回数据的情况
    return response.data;
  },
  (error) => {
    const { response, config } = error;
    const message = getGlobalMessage();
    
    if (response) {
      const { status, data } = response;
      
      // ✅ 修复：登录接口的 401 错误不在这里处理，让登录页面自己处理
      if (status === 401 && config?.url?.includes('/auth/login')) {
        return Promise.reject(error);  // 直接抛出，不显示消息，不跳转
      }
      
      switch (status) {
        case 401:
          // 其他接口的 401（token 过期）
          // 如果已经在处理认证失效，直接拒绝，避免重复提示和跳转
          if (isAuthInvalid) {
            return Promise.reject(new Error('认证已失效，请重新登录'));
          }
          // 第一个 401，设置锁并处理
          isAuthInvalid = true;
          message.error('登录已过期，请重新登录');
          localStorage.removeItem('admin_token');
          localStorage.removeItem('admin_user');
          // 跳转到登录页
          if (window.location.pathname !== '/login') {
            window.location.href = '/login';
          }
          break;
        case 403:
          message.error('权限不足');
          break;
        case 404:
          message.error('请求的资源不存在');
          break;
        case 500:
          message.error('服务器内部错误');
          break;
        default:
          message.error(data?.message || '请求失败');
      }
    } else {
      message.error('网络连接失败');
    }
    
    return Promise.reject(error);
  }
);

export default apiClient;
