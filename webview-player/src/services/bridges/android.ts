import type { NativeBridge, PlayerInfo, ApiResponse, BridgeCallParams } from '@/types'

// 回调管理
const callbacks = new Map<string, (result: unknown) => void>()

// 注册全局回调处理器
if (typeof window !== 'undefined') {
  (window as Window & { __androidCallback?: (callbackId: string, result: string) => void }).__androidCallback =
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

export function createAndroidBridge(): NativeBridge {
  return {
    async callPlayerApi<T>(params: BridgeCallParams): Promise<ApiResponse<T>> {
      return new Promise((resolve) => {
        const callbackId = generateCallbackId()
        callbacks.set(callbackId, (result) => resolve(result as ApiResponse<T>))

        try {
          window.AndroidBridge?.callPlayerApi(JSON.stringify(params), callbackId)
        } catch (error) {
          callbacks.delete(callbackId)
          resolve({ result: false, error: `Android Bridge 调用失败: ${error}` })
        }
      })
    },

    async getPlayerInfo(): Promise<PlayerInfo> {
      try {
        const result = window.AndroidBridge?.getPlayerInfo()
        if (result) {
          return JSON.parse(result)
        }
      } catch (error) {
        console.error('[Android] getPlayerInfo 失败:', error)
      }
      return { gameid: '', uid: '', areaid: '', playerName: '' }
    },

    async getSignedParams(endpoint: string, body: Record<string, unknown>): Promise<Record<string, unknown>> {
      return new Promise((resolve) => {
        const callbackId = generateCallbackId()
        callbacks.set(callbackId, (result) => resolve(result as Record<string, unknown>))

        try {
          window.AndroidBridge?.getSignedParams(endpoint, JSON.stringify(body), callbackId)
        } catch (error) {
          console.error('[Android] getSignedParams 失败:', error)
          callbacks.delete(callbackId)
          resolve(body)
        }

        // 超时处理
        setTimeout(() => {
          if (callbacks.has(callbackId)) {
            callbacks.delete(callbackId)
            console.warn('[Android] getSignedParams 超时')
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
            window.AndroidBridge?.uploadFile(base64, filename, uploadToken, callbackId)
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
      try {
        return window.AndroidBridge?.getApiUrl?.() || ''
      } catch (error) {
        console.error('[Android] getApiUrl 失败:', error)
        return ''
      }
    },

    close(): void {
      try {
        window.AndroidBridge?.close()
      } catch (error) {
        console.error('[Android] close 失败:', error)
      }
    }
  }
}
