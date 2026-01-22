import type { NativeBridge, PlayerInfo } from '@/types'

/**
 * Android Bridge（远程模式 - 简化版）
 * 只提供 2 个方法：getPlayerInfo、close
 */
export function createAndroidBridge(): NativeBridge {
  return {
    /**
     * 获取玩家信息（同步调用，包含 ts/nonce/sign）
     */
    getPlayerInfo(): PlayerInfo {
      try {
        const result = window.roadWebViewService?.getPlayerInfo()
        if (result) {
          const info = JSON.parse(result)
          console.log('[Android] 玩家信息:', {
            gameid: info.gameid,
            uid: info.uid,
            ts: info.ts,
            hasSign: !!info.sign
          })
          return info
        }
      } catch (error) {
        console.error('[Android] getPlayerInfo 失败:', error)
      }

      // 降级返回空信息
      return {
        gameid: '',
        uid: '',
        areaid: '',
        playerName: '',
        ts: 0,
        nonce: '',
        sign: ''
      }
    },

    /**
     * 关闭 WebView
     */
    close(): void {
      try {
        window.roadWebViewService?.close()
      } catch (error) {
        console.error('[Android] close 失败:', error)
      }
    }
  }
}
