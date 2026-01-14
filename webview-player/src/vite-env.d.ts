/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<object, object, unknown>
  export default component
}

interface Window {
  AndroidBridge?: {
    callPlayerApi(paramsJson: string, callbackId: string): void
    getPlayerInfo(): string
    getApiUrl(): string
    getSignedParams(endpoint: string, bodyJson: string, callbackId: string): void
    uploadFile(base64: string, filename: string, uploadToken: string, callbackId: string): void
    close(): void
  }
  webkit?: {
    messageHandlers: {
      iosBridge: {
        postMessage(message: unknown): void
      }
    }
  }
  // Web 测试回调
  __bridgeCallbacks?: Map<string, (result: unknown) => void>
}
