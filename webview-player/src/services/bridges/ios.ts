import type { NativeBridge, PlayerInfo } from '@/types'

// 回调管理（用于异步 iOS bridge）
const callbacks = new Map<string, (result: unknown) => void>()

// 注册全局回调处理器
if (typeof window !== 'undefined') {
  (window as any).__iosCallback = (callbackId: string, result: string) => {
    const callback = callbacks.get(callbackId)
    if (callback) {
      callbacks.delete(callbackId)
      try {
        callback(JSON.parse(result))
      } catch {
        callback({
          gameid: '',
          uid: '',
          areaid: '',
          playerName: '',
          ts: 0,
          nonce: '',
          sign: ''
        })
      }
    }
  }
}

function generateCallbackId(): string {
  return `cb_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
}

function postMessage(action: string, data: unknown): void {
  window.webkit?.messageHandlers?.iosBridge?.postMessage({ action, data })
}

/**
 * iOS Bridge（远程模式 - 简化版）
 * 只提供 2 个方法：getPlayerInfo、close
 */
export function createIosBridge(): NativeBridge {
  return {
    /**
     * 获取玩家信息（异步调用，包含 ts/nonce/sign）
     */
    async getPlayerInfo(): Promise<PlayerInfo> {
      return new Promise((resolve) => {
        const callbackId = generateCallbackId()
        callbacks.set(callbackId, (result) => {
          const info = result as PlayerInfo
          console.log('[iOS] 玩家信息:', {
            gameid: info.gameid,
            uid: info.uid,
            ts: info.ts,
            hasSign: !!info.sign
          })
          resolve(info)
        })

        try {
          postMessage('getPlayerInfo', { callbackId })
        } catch (error) {
          console.error('[iOS] getPlayerInfo 失败:', error)
          callbacks.delete(callbackId)
          resolve({
            gameid: '',
            uid: '',
            areaid: '',
            playerName: '',
            ts: 0,
            nonce: '',
            sign: ''
          })
        }

        // 超时保护（5秒）
        setTimeout(() => {
          if (callbacks.has(callbackId)) {
            callbacks.delete(callbackId)
            console.warn('[iOS] getPlayerInfo 超时')
            resolve({
              gameid: '',
              uid: '',
              areaid: '',
              playerName: '',
              ts: 0,
              nonce: '',
              sign: ''
            })
          }
        }, 5000)
      })
    },

    /**
     * 关闭 WebView
     */
    close(): void {
      try {
        postMessage('close', {})
      } catch (error) {
        console.error('[iOS] close 失败:', error)
      }
    }
  }
}
