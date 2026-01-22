import type { NativeBridge, PlayerInfo } from '@/types'

/**
 * 从 URL 参数解析玩家信息
 * 远程模式: 所有参数（包括 ts/nonce/sign）都来自 URL
 */
function getPlayerInfoFromUrl(): PlayerInfo {
  const params = new URLSearchParams(window.location.search)

  const info: PlayerInfo = {
    gameid: params.get('gameid') || '',
    uid: params.get('uid') || '',
    areaid: params.get('areaid') || '',
    playerName: params.get('playerName') || '',
    ts: parseInt(params.get('ts') || '0', 10),
    nonce: params.get('nonce') || '',
    sign: params.get('sign') || ''
  }

  console.log('[Web Bridge] URL 参数:', {
    gameid: info.gameid,
    uid: info.uid,
    ts: info.ts,
    hasSign: !!info.sign,
    签名过期时间: info.ts ? new Date(info.ts + 2 * 60 * 60 * 1000).toLocaleString() : 'N/A'
  })

  return info
}

export function createWebBridge(): NativeBridge {
  return {
    /**
     * 获取玩家信息（从 URL 参数）
     */
    getPlayerInfo(): PlayerInfo {
      return getPlayerInfoFromUrl()
    },

    /**
     * 关闭 WebView（根据平台参数）
     */
    close(): void {
      const params = new URLSearchParams(window.location.search)
      const platform = params.get('platform') || 'web'

      console.log('[Web Bridge] 关闭，平台:', platform)

      // 微信小程序
      if (platform === 'wxapp' && (window as any).wx?.miniProgram) {
        try {
          (window as any).wx.miniProgram.navigateBack()
          return
        } catch (error) {
          console.error('[Web Bridge] 微信小程序返回失败:', error)
        }
      }

      // iframe 嵌入
      if (platform === 'iframe') {
        try {
          window.parent.postMessage({ type: 'cs-close' }, '*')
          return
        } catch (error) {
          console.error('[Web Bridge] postMessage 失败:', error)
        }
      }

      // 标准浏览器
      window.close()

      // 如果关闭失败（浏览器安全限制），显示提示
      setTimeout(() => {
        if (!window.closed) {
          document.body.innerHTML = `
            <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;font-family:system-ui;color:#666;background:#f5f5f5;">
              <div style="font-size:48px;margin-bottom:20px;">👋</div>
              <div style="font-size:18px;margin-bottom:10px;">会话已结束</div>
              <div style="font-size:14px;color:#999;">请手动关闭此页面</div>
            </div>
          `
        }
      }, 500)
    }
  }
}
