import type { NativeBridge, PlayerInfo, ApiResponse, BridgeCallParams } from '@/types'

// 回调管理
const callbacks = new Map<string, (result: unknown) => void>()

// 注册全局回调处理器
if (typeof window !== 'undefined') {
  (window as Window & { __iosCallback?: (callbackId: string, result: string) => void }).__iosCallback =
    (callbackId: string, result: string) => {
      const callback = callbacks.get(callbackId)
      if (callback) {
        callbacks.delete(callbackId)
        try {
          callback(JSON.parse(result))
        } catch {
          callback({ result: false, error: 'JSON 解析失败' })
        }
      }
    }
}

function generateCallbackId(): string {
  return `cb_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
}

function postMessage(action: string, data: unknown): void {
  window.webkit?.messageHandlers?.iosBridge?.postMessage({
    action,
    data
  })
}

export function createIosBridge(): NativeBridge {
  return {
    async callPlayerApi<T>(params: BridgeCallParams): Promise<ApiResponse<T>> {
      return new Promise((resolve) => {
        const callbackId = generateCallbackId()
        callbacks.set(callbackId, (result) => resolve(result as ApiResponse<T>))

        try {
          postMessage('callPlayerApi', { ...params, callbackId })
        } catch (error) {
          callbacks.delete(callbackId)
          resolve({ result: false, error: `iOS Bridge 调用失败: ${error}` })
        }
      })
    },

    async getPlayerInfo(): Promise<PlayerInfo> {
      return new Promise((resolve) => {
        const callbackId = generateCallbackId()
        callbacks.set(callbackId, (result) => resolve(result as PlayerInfo))

        try {
          postMessage('getPlayerInfo', { callbackId })
        } catch (error) {
          console.error('[iOS] getPlayerInfo 失败:', error)
          resolve({ gameid: '', uid: '', areaid: '', playerName: '' })
        }

        // 超时处理
        setTimeout(() => {
          if (callbacks.has(callbackId)) {
            callbacks.delete(callbackId)
            resolve({ gameid: '', uid: '', areaid: '', playerName: '' })
          }
        }, 5000)
      })
    },

    async getSignedParams(endpoint: string, body: Record<string, unknown>): Promise<Record<string, unknown>> {
      return new Promise((resolve) => {
        const callbackId = generateCallbackId()
        callbacks.set(callbackId, (result) => resolve(result as Record<string, unknown>))

        try {
          postMessage('getSignedParams', { endpoint, body, callbackId })
        } catch (error) {
          console.error('[iOS] getSignedParams 失败:', error)
          callbacks.delete(callbackId)
          resolve(body)
        }

        // 超时处理
        setTimeout(() => {
          if (callbacks.has(callbackId)) {
            callbacks.delete(callbackId)
            console.warn('[iOS] getSignedParams 超时')
            resolve(body)
          }
        }, 5000)
      })
    },

    async uploadFile(file: Blob, filename: string, uploadToken: string): Promise<{ url: string }> {
      return new Promise((resolve) => {
        const callbackId = generateCallbackId()
        callbacks.set(callbackId, (result) => resolve(result as { url: string }))

        const reader = new FileReader()
        reader.onload = () => {
          const base64 = (reader.result as string).split(',')[1]
          try {
            postMessage('uploadFile', { base64, filename, uploadToken, callbackId })
          } catch (error) {
            callbacks.delete(callbackId)
            resolve({ url: '' })
          }
        }
        reader.onerror = () => {
          callbacks.delete(callbackId)
          resolve({ url: '' })
        }
        reader.readAsDataURL(file)
      })
    },

    getApiUrl(): string {
      // iOS 原生层需要提供此方法，暂时返回空字符串
      // 真实环境下，图片URL的处理可能由原生层负责
      return ''
    },

    close(): void {
      try {
        postMessage('close', {})
      } catch (error) {
        console.error('[iOS] close 失败:', error)
      }
    }
  }
}
