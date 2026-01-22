import type { PlayerInfo, ApiResponse } from '@/types'
import { getPlayerInfo as getBridgePlayerInfo } from './bridge'

// 玩家信息缓存
let playerInfo: PlayerInfo | null = null
let apiBaseUrl: string = ''

/**
 * 初始化 API 服务
 * 必须在任何 API 调用之前执行
 */
export async function init(): Promise<void> {
  playerInfo = await getBridgePlayerInfo()
  apiBaseUrl = getApiBaseUrl()
  console.log('[API] 初始化完成', {
    gameid: playerInfo.gameid,
    uid: playerInfo.uid,
    ts: playerInfo.ts,
    apiBaseUrl
  })
}

/**
 * 获取 API 基础地址
 * 优先级: URL 参数 > 环境变量 > 自动检测
 */
function getApiBaseUrl(): string {
  const params = new URLSearchParams(window.location.search)
  const urlParam = params.get('apiUrl')

  if (urlParam) return urlParam
  if (import.meta.env.VITE_API_URL) return import.meta.env.VITE_API_URL

  // Android 模拟器中 localhost 指向模拟器自身，需要用 10.0.2.2 访问宿主机
  const isAndroidEmulator = window.roadWebViewService !== undefined &&
    window.location.hostname !== 'localhost' &&
    window.location.hostname !== '127.0.0.1'

  if (isAndroidEmulator) {
    return 'http://10.0.2.2:21101'
  }

  return 'http://localhost:21101'
}

/**
 * 调用玩家 API
 * 自动附加签名参数 (gameid, uid, areaid, ts, nonce, sign)
 */
export async function callPlayerApi<T>(
  endpoint: string,
  body?: Record<string, unknown>
): Promise<ApiResponse<T>> {
  if (!playerInfo) {
    throw new Error('API 未初始化 - 请先调用 init()')
  }

  // 附加签名参数
  const requestBody = {
    gameid: playerInfo.gameid,
    uid: playerInfo.uid,
    areaid: playerInfo.areaid,
    playerName: playerInfo.playerName,
    ts: playerInfo.ts,
    nonce: playerInfo.nonce,
    sign: playerInfo.sign,
    ...body,
  }

  console.log('[API] 请求:', { endpoint, ts: requestBody.ts })

  try {
    const response = await fetch(`${apiBaseUrl}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    })

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }

    const json = await response.json()

    // 处理 TransformInterceptor 包装的响应
    // 格式: { success: true, data: { result: true, data: {...} } }
    if ('success' in json && json.data && 'result' in json.data) {
      return json.data as ApiResponse<T>
    }

    // 处理异常响应
    // 格式: { success: false, message, code }
    if ('success' in json && !json.success) {
      return {
        result: false,
        error: json.message,
        errorCode: json.code,
      } as ApiResponse<T>
    }

    // 直接响应格式
    // 格式: { result: true, data: {...} }
    if ('result' in json) {
      return json as ApiResponse<T>
    }

    // 未知格式，尝试直接返回
    return json as ApiResponse<T>
  } catch (error) {
    console.error('[API] 请求失败:', error)
    return {
      result: false,
      error: error instanceof Error ? error.message : '请求失败',
    }
  }
}

/**
 * 上传文件结果
 */
export interface UploadResult {
  url: string
  errorCode?: string
  error?: string
}

/**
 * 上传文件（图片）
 */
export async function uploadFile(
  file: Blob,
  filename: string,
  uploadToken: string
): Promise<UploadResult> {
  const formData = new FormData()
  formData.append('file', file, filename)

  try {
    const response = await fetch(`${apiBaseUrl}/api/v1/player/upload`, {
      method: 'POST',
      headers: { 'X-Upload-Token': uploadToken },
      body: formData,
    })

    const json = await response.json()

    // 处理包装响应
    // 格式: { success: true, data: { result: true, url: "..." } }
    if (json.success && json.data?.result && json.data.url) {
      return { url: json.data.url }
    }

    // 直接响应格式 - 成功
    // 格式: { result: true, url: "..." }
    if (json.result && json.url) {
      return { url: json.url }
    }

    // 直接响应格式 - 失败
    // 格式: { result: false, error: "...", errorCode: "..." }
    if (json.result === false) {
      console.error('[API] 上传失败:', json.error, json.errorCode)
      return { url: '', error: json.error, errorCode: json.errorCode }
    }

    // 包装响应格式 - 失败
    // 格式: { success: true, data: { result: false, error: "...", errorCode: "..." } }
    if (json.success && json.data?.result === false) {
      console.error('[API] 上传失败:', json.data.error, json.data.errorCode)
      return { url: '', error: json.data.error, errorCode: json.data.errorCode }
    }

    console.error('[API] 上传失败 (未知格式):', json)
    return { url: '', error: '上传失败' }
  } catch (error) {
    console.error('[API] 上传失败:', error)
    return { url: '', error: error instanceof Error ? error.message : '上传失败' }
  }
}

/**
 * 获取 WebSocket URL
 * 将相对路径转换为绝对 URL
 */
export function getWsUrl(wsUrl: string): string {
  if (!wsUrl) return ''

  // 已经是绝对 URL
  if (wsUrl.startsWith('http://') || wsUrl.startsWith('https://') ||
      wsUrl.startsWith('ws://') || wsUrl.startsWith('wss://')) {
    return wsUrl
  }

  // 相对路径 - 转换为绝对路径
  // http://localhost:21101 -> ws://localhost:21101
  const wsBaseUrl = apiBaseUrl.replace(/^http/, 'ws')
  return `${wsBaseUrl}${wsUrl.startsWith('/') ? wsUrl : '/' + wsUrl}`
}

/**
 * 获取图片绝对 URL
 * 将相对路径转换为绝对 URL
 */
export function getImageUrl(url: string): string {
  if (!url) return ''
  if (url.startsWith('http://') || url.startsWith('https://')) return url
  if (url.startsWith('/')) return `${apiBaseUrl}${url}`
  return url
}

/**
 * 获取缓存的玩家信息
 */
export function getPlayerInfo(): PlayerInfo | null {
  return playerInfo
}
