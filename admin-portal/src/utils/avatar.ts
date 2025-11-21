/**
 * 头像URL解析工具
 * 统一处理头像URL的解析，支持外部URL和本地存储
 */
import { API_BASE_URL } from '../config/api';

const API_ORIGIN = API_BASE_URL.replace(/\/api\/v1\/?$/, '');

/**
 * 解析头像URL
 * @param url 头像URL（可能是完整URL或相对路径）
 * @returns 解析后的完整URL，如果url为空则返回undefined
 */
export const resolveAvatarUrl = (url?: string | null): string | undefined => {
  if (!url) return undefined;
  
  // 如果是完整的HTTP/HTTPS URL（外部URL），直接返回
  if (/^https?:\/\//i.test(url)) {
    return url;
  }
  
  // 如果是相对路径（本地存储），加上API基础URL
  const normalized = url.startsWith('/') ? url : `/${url}`;
  return `${API_ORIGIN}${normalized}`;
};

