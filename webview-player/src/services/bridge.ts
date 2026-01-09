import type { NativeBridge, PlayerInfo, ApiResponse, BridgeCallParams } from '@/types'
import { createAndroidBridge } from './bridges/android'
import { createIosBridge } from './bridges/ios'
import { createWebBridge } from './bridges/web'

// 检测运行环境
export type BridgeEnv = 'android' | 'ios' | 'web'

export function detectEnv(): BridgeEnv {
  if (typeof window !== 'undefined') {
    if (window.AndroidBridge) {
      return 'android'
    }
    if (window.webkit?.messageHandlers?.iosBridge) {
      return 'ios'
    }
  }
  return 'web'
}

// 创建 Bridge 实例
let bridgeInstance: NativeBridge | null = null

export function getBridge(): NativeBridge {
  if (!bridgeInstance) {
    const env = detectEnv()
    console.log(`[Bridge] 检测到环境: ${env}`)

    switch (env) {
      case 'android':
        bridgeInstance = createAndroidBridge()
        break
      case 'ios':
        bridgeInstance = createIosBridge()
        break
      default:
        bridgeInstance = createWebBridge()
    }
  }
  return bridgeInstance
}

// 便捷方法
export async function callPlayerApi<T>(params: BridgeCallParams): Promise<ApiResponse<T>> {
  return getBridge().callPlayerApi<T>(params)
}

export async function getPlayerInfo(): Promise<PlayerInfo> {
  return getBridge().getPlayerInfo()
}

export async function uploadFile(file: Blob, filename: string, uploadToken: string): Promise<{ url: string }> {
  return getBridge().uploadFile(file, filename, uploadToken)
}

export async function getSignedParams(endpoint: string, body: Record<string, unknown>): Promise<Record<string, unknown>> {
  return getBridge().getSignedParams(endpoint, body)
}

export function getApiUrl(): string {
  return getBridge().getApiUrl()
}

export function closeBridge(): void {
  getBridge().close()
}
