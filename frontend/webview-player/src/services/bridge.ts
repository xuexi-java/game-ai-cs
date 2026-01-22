import type { NativeBridge, PlayerInfo } from '@/types'
import { createAndroidBridge } from './bridges/android'
import { createIosBridge } from './bridges/ios'
import { createWebBridge } from './bridges/web'

// 检测运行环境
export type BridgeEnv = 'android' | 'ios' | 'url' | 'mock'

export function detectEnv(): BridgeEnv {
  if (typeof window !== 'undefined') {
    if (window.roadWebViewService) {
      return 'android'
    }
    if (window.webkit?.messageHandlers?.iosBridge) {
      return 'ios'
    }
    // 检查 URL 是否包含玩家信息参数（远程模式）
    const params = new URLSearchParams(window.location.search)
    if (params.has('gameid') && params.has('uid') && params.has('sign')) {
      return 'url'
    }
  }
  return 'mock'
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
      case 'url':
      case 'mock':
      default:
        bridgeInstance = createWebBridge()
    }
  }
  return bridgeInstance
}

// 导出便捷方法（远程模式 - 只保留核心方法）
export async function getPlayerInfo(): Promise<PlayerInfo> {
  return getBridge().getPlayerInfo()
}

export function closeBridge(): void {
  getBridge().close()
}
