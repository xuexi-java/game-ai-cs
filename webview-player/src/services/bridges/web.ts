import type { NativeBridge, PlayerInfo, ApiResponse, BridgeCallParams } from '@/types'
import CryptoJS from 'crypto-js'

// 从 URL 参数获取配置
function getTestConfig(): {
  gameid: string
  uid: string
  areaid: string
  playerName: string
  nonce: string
  secret: string
  apiUrl: string
} {
  const params = new URLSearchParams(window.location.search)

  return {
    gameid: params.get('gameid') || 'test_game',
    uid: params.get('uid') || 'test_user_001',
    areaid: params.get('areaid') || '1',
    playerName: params.get('playerName') || '测试玩家',
    nonce: params.get('nonce') || '',       // 固定 nonce（与游戏配置一致）
    secret: params.get('secret') || '',     // 签名密钥
    apiUrl: params.get('apiUrl') || 'http://localhost:21101'  // API 服务地址
  }
}

// 生成签名
// 签名公式: sign = md5(gameid|uid|areaid|nonce|secret).toLowerCase()
// nonce 为游戏配置的固定值，由 URL 参数传入
function generateSign(gameid: string, uid: string, areaid: string, nonce: string, secret: string): string {
  const signStr = `${gameid}|${uid}|${areaid}|${nonce}|${secret}`
  return CryptoJS.MD5(signStr).toString().toLowerCase()
}

export function createWebBridge(): NativeBridge {
  const config = getTestConfig()
  console.log('[Web Bridge] 配置:', {
    gameid: config.gameid,
    uid: config.uid,
    areaid: config.areaid,
    playerName: config.playerName,
    nonce: config.nonce ? '***' : '未设置',
    secret: config.secret ? '***' : '未设置',
    apiUrl: config.apiUrl
  })

  return {
    async callPlayerApi<T>(params: BridgeCallParams): Promise<ApiResponse<T>> {
      // 获取签名参数
      const signedParams = await this.getSignedParams(params.endpoint, params.body)

      // 构建完整 URL（apiUrl + endpoint）
      const fullUrl = `${config.apiUrl}${params.endpoint}`

      try {
        const response = await fetch(fullUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(signedParams)
        })

        const json = await response.json()
        console.log('[Web Bridge] API 原始响应:', json)

        // 标准化响应格式
        // 后端响应被 TransformInterceptor 包装: { success: true, data: { result: true, data: {...} } }
        // 需要解包嵌套结构

        if ('success' in json && json.data && 'result' in json.data) {
          // 双层包装格式: { success, data: { result, data } }
          const inner = json.data
          console.log('[Web Bridge] 解包后数据:', inner)
          return {
            result: inner.result,
            data: inner.data,
            error: inner.error,
            errorCode: inner.errorCode
          } as ApiResponse<T>
        } else if ('result' in json) {
          // 单层格式: { result, data }
          return json as ApiResponse<T>
        } else if ('success' in json) {
          // ExceptionFilter 格式: { success, message, code }
          return {
            result: json.success,
            data: json.data,
            error: json.message,
            errorCode: json.code
          } as ApiResponse<T>
        }

        // 未知格式，原样返回
        return json as ApiResponse<T>
      } catch (error) {
        console.error('[Web Bridge] API 调用失败:', error)
        return { result: false, error: `请求失败: ${error}` }
      }
    },

    async getPlayerInfo(): Promise<PlayerInfo> {
      return {
        gameid: config.gameid,
        uid: config.uid,
        areaid: config.areaid,
        playerName: config.playerName
      }
    },

    async getSignedParams(_endpoint: string, body: Record<string, unknown>): Promise<Record<string, unknown>> {
      // 使用固定 nonce 和 secret 生成签名
      const sign = (config.nonce && config.secret)
        ? generateSign(config.gameid, config.uid, config.areaid, config.nonce, config.secret)
        : ''

      return {
        gameid: config.gameid,
        uid: config.uid,
        areaid: config.areaid,
        playerName: config.playerName,
        nonce: config.nonce,
        sign,
        ...body
      }
    },

    async uploadFile(file: Blob, filename: string, uploadToken: string): Promise<{ url: string }> {
      const formData = new FormData()
      formData.append('file', file, filename)

      // 使用配置的 apiUrl
      const uploadUrl = `${config.apiUrl}/api/v1/player/upload`

      try {
        const response = await fetch(uploadUrl, {
          method: 'POST',
          headers: {
            'X-Upload-Token': uploadToken
          },
          body: formData
        })

        const json = await response.json()
        console.log('[Web Bridge] 上传原始响应:', JSON.stringify(json, null, 2))

        // 处理异常响应格式 (HttpExceptionFilter)
        // 格式: { success: false, code: "...", message: "...", data: null }
        if (json.success === false) {
          console.error('[Web Bridge] 上传失败 (异常响应):', json.message || json.code)
          return { url: '' }
        }

        // 处理 TransformInterceptor 包装的成功响应格式
        // 格式: { success: true, data: { result: true, url: "..." }, timestamp: "..." }
        if (json.success && json.data) {
          const inner = json.data
          console.log('[Web Bridge] 解包后数据:', JSON.stringify(inner, null, 2))
          if (inner.result && inner.url) {
            console.log('[Web Bridge] 上传成功, URL:', inner.url)
            return { url: inner.url }
          }
          // 处理业务失败响应
          console.error('[Web Bridge] 上传失败 (业务错误):', inner.error || inner.errorCode || '未知错误')
          return { url: '' }
        }

        // 兼容未包装的响应格式
        if (json.result && json.url) {
          console.log('[Web Bridge] 上传成功 (直接格式), URL:', json.url)
          return { url: json.url }
        }

        console.error('[Web Bridge] 上传失败 (未知格式):', json)
        return { url: '' }
      } catch (error) {
        console.error('[Web Bridge] 上传失败:', error)
        return { url: '' }
      }
    },

    getApiUrl(): string {
      return config.apiUrl
    },

    close(): void {
      console.log('[Web Bridge] 关闭 WebView')

      // 浏览器安全限制：window.close() 只能关闭由 JS window.open() 打开的窗口
      // 如果是用户直接打开的页面，window.close() 会静默失败

      // 尝试关闭窗口
      window.close()

      // 如果 500ms 后窗口仍然存在，说明关闭失败，使用备用方案
      setTimeout(() => {
        // 检查窗口是否仍然打开
        if (!window.closed) {
          console.log('[Web Bridge] window.close() 被浏览器阻止，使用备用方案')

          // 备用方案1：如果有 opener（被 window.open 打开），尝试通知父窗口
          if (window.opener) {
            try {
              window.opener.postMessage({ type: 'WEBVIEW_CLOSE' }, '*')
            } catch (e) {
              // 忽略跨域错误
            }
          }

          // 备用方案2：跳转到空白页并显示提示
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
