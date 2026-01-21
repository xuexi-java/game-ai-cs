import { io, Socket } from 'socket.io-client'
import type {
  WsConnectionReadyData,
  WsTicketCreatedData,
  WsMessageAckData,
  WsMessageReceiveData,
  WsTransferResultData,
  WsQueueUpdateData,
  WsAgentAssignedData,
  WsTicketUpdateData,
  WsTypingStatusData,
  WsKickedData,
  WsHistoryLoadedData,
  WsErrorData
} from '@/types'

export interface SocketEvents {
  onConnectionReady: (data: WsConnectionReadyData) => void
  onTicketCreated: (data: WsTicketCreatedData) => void
  onMessageAck: (data: WsMessageAckData) => void
  onMessageReceive: (data: WsMessageReceiveData) => void
  onTransferResult: (data: WsTransferResultData) => void
  onQueueUpdate: (data: WsQueueUpdateData) => void
  onAgentAssigned: (data: WsAgentAssignedData) => void
  onTicketUpdate: (data: WsTicketUpdateData) => void
  onTypingStatus: (data: WsTypingStatusData) => void
  onKicked: (data: WsKickedData) => void
  onHistoryLoaded: (data: WsHistoryLoadedData) => void
  onError: (data: WsErrorData) => void
  onConnect: () => void
  onDisconnect: (reason: string) => void
  onTokenInvalid: () => void  // token 失效回调，用于触发刷新 token 并重连
}

export class SocketService {
  private socket: Socket | null = null
  private events: Partial<SocketEvents> = {}
  private reconnectAttempts = 0
  private maxReconnectAttempts = 5
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null
  private readonly heartbeatIntervalMs = 3000 // 每3秒发送一次心跳
  private tokenInvalidFlag = false  // token 失效标记，防止自动重连

  /**
   * 连接 WebSocket
   * @param wsUrl WebSocket 地址 (不含 token)
   * @param wsToken 认证 Token
   */
  connect(wsUrl: string, wsToken: string): void {
    if (this.socket?.connected) {
      console.log('[Socket] 已连接，跳过')
      return
    }

    console.log('[Socket] 正在连接:', wsUrl)

    // 重置 token 失效标记（新连接时清除）
    this.tokenInvalidFlag = false

    this.socket = io(wsUrl, {
      transports: ['websocket'],
      autoConnect: true,
      reconnection: false,  // 禁用自动重连，改为手动控制
      auth: {
        token: wsToken
      }
    })

    this.setupListeners()
  }

  private setupListeners(): void {
    if (!this.socket) return

    this.socket.on('connect', () => {
      console.log('[Socket] 已连接')
      this.reconnectAttempts = 0
      this.startHeartbeat()
      this.events.onConnect?.()
    })

    this.socket.on('disconnect', (reason) => {
      console.log('[Socket] 断开连接:', reason)
      this.stopHeartbeat()
      this.events.onDisconnect?.(reason)
    })

    // 监听服务器的 pong 响应（静默处理，避免日志刷屏）
    this.socket.on('pong', () => {
      // 心跳响应，无需日志
    })

    this.socket.on('connect_error', (error) => {
      console.error('[Socket] 连接错误:', error)
      
      // 如果是 token 失效导致的错误，不重试
      if (this.tokenInvalidFlag) {
        console.log('[Socket] Token 失效，停止重连')
        return
      }
      
      this.reconnectAttempts++
      
      if (this.reconnectAttempts >= this.maxReconnectAttempts) {
        console.error('[Socket] 重连次数超限，停止重连')
        this.events.onError?.({ code: 'CONNECT_FAILED', message: '连接失败，请检查网络后重试' })
        return
      }
      
      // 指数退避重连：1s, 2s, 4s, 8s, 16s
      const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts - 1), 30000)
      console.log(`[Socket] ${delay}ms 后尝试第 ${this.reconnectAttempts} 次重连...`)
      
      setTimeout(() => {
        if (!this.socket?.connected && !this.tokenInvalidFlag) {
          console.log('[Socket] 执行重连...')
          this.socket?.connect()
        }
      }, delay)
    })

    // 连接就绪
    this.socket.on('connection:ready', (data: WsConnectionReadyData) => {
      console.log('[Socket] 连接就绪:', data)
      this.events.onConnectionReady?.(data)
    })

    // 工单创建成功
    this.socket.on('ticket:created', (data: WsTicketCreatedData) => {
      console.log('[Socket] 工单创建成功:', data)
      this.events.onTicketCreated?.(data)
    })

    // 消息 ack
    this.socket.on('message:ack', (data: WsMessageAckData) => {
      console.log('[Socket] 消息确认:', data)
      this.events.onMessageAck?.(data)
    })

    // 收到消息 (保持兼容旧事件名)
    this.socket.on('message', (data: WsMessageReceiveData) => {
      console.log('[Socket] 收到消息:', data)
      this.events.onMessageReceive?.(data)
    })

    // 转人工结果
    this.socket.on('transfer:result', (data: WsTransferResultData) => {
      console.log('[Socket] 转人工结果:', data)
      this.events.onTransferResult?.(data)
    })

    // 排队更新（后端使用 queue-update 事件名）
    this.socket.on('queue-update', (data: WsQueueUpdateData) => {
      console.log('[Socket] 排队更新:', data)
      this.events.onQueueUpdate?.(data)
    })

    // 客服接入
    this.socket.on('agent:assigned', (data: WsAgentAssignedData) => {
      console.log('[Socket] 客服接入:', data)
      this.events.onAgentAssigned?.(data)
    })

    // 工单状态更新
    this.socket.on('ticket:update', (data: WsTicketUpdateData) => {
      console.log('[Socket] 工单状态更新:', data)
      this.events.onTicketUpdate?.(data)
    })

    // 输入状态
    this.socket.on('typing:status', (data: WsTypingStatusData) => {
      this.events.onTypingStatus?.(data)
    })

    // 被踢下线
    this.socket.on('connection:kicked', (data: WsKickedData) => {
      console.log('[Socket] 被踢下线:', data)
      this.events.onKicked?.(data)
    })

    // 历史消息加载完成
    this.socket.on('history:loaded', (data: WsHistoryLoadedData) => {
      console.log('[Socket] 历史消息:', data)
      this.events.onHistoryLoaded?.(data)
    })

    // 错误
    this.socket.on('error', (data: WsErrorData) => {
      console.error('[Socket] 错误:', data)

      // 认证相关错误，停止自动重连并通知上层刷新 token
      if (data.code === 'INVALID_TOKEN' || data.code === 'TOKEN_EXPIRED') {
        console.log('[Socket] 认证失败，标记 token 失效，停止重连')
        
        // 设置 token 失效标记，阻止后续重连
        this.tokenInvalidFlag = true
        
        // 断开连接
        this.socket?.disconnect()
        
        // 通知上层刷新 token 并重连
        this.events.onTokenInvalid?.()
        return  // 不再触发 onError，由上层处理
      }

      this.events.onError?.(data)
    })
  }

  on<K extends keyof SocketEvents>(event: K, callback: SocketEvents[K]): void {
    this.events[event] = callback
  }

  /**
   * 创建新工单
   */
  createTicket(issueType: string, confirmClose?: boolean): void {
    if (!this.socket?.connected) {
      console.warn('[Socket] 未连接，无法创建工单')
      return
    }

    console.log('[Socket] 创建工单:', { issueType, confirmClose })
    this.socket.emit('ticket:create', { issueType, confirmClose })
  }

  /**
   * 恢复旧工单
   */
  resumeTicket(tid: string): void {
    if (!this.socket?.connected) {
      console.warn('[Socket] 未连接，无法恢复工单')
      return
    }

    console.log('[Socket] 恢复工单:', tid)
    this.socket.emit('ticket:resume', { tid })
  }

  /**
   * 发送消息
   */
  sendMessage(content: string, type: 'TEXT' | 'IMAGE' = 'TEXT'): string {
    if (!this.socket?.connected) {
      console.warn('[Socket] 未连接，无法发送消息')
      return ''
    }

    const clientMsgId = `msg_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
    console.log('[Socket] 发送消息:', { clientMsgId, type, content: type === 'IMAGE' ? '[图片]' : content })

    this.socket.emit('message:send', {
      content,
      clientMsgId,
      type
    })

    return clientMsgId
  }

  /**
   * 请求转人工
   */
  requestTransfer(reason?: string): void {
    if (!this.socket?.connected) {
      console.warn('[Socket] 未连接，无法转人工')
      return
    }

    console.log('[Socket] 请求转人工')
    this.socket.emit('transfer:request', { reason })
  }

  /**
   * 关闭工单
   */
  closeTicket(reason?: string): void {
    if (!this.socket?.connected) {
      console.warn('[Socket] 未连接，无法关闭工单')
      return
    }

    console.log('[Socket] 关闭工单')
    this.socket.emit('ticket:close', { reason })
  }

  /**
   * 加载更多历史消息
   */
  loadHistory(beforeId?: string, limit?: number): void {
    if (!this.socket?.connected) {
      console.warn('[Socket] 未连接，无法加载历史')
      return
    }

    console.log('[Socket] 加载历史消息')
    this.socket.emit('history:load', { beforeId, limit })
  }

  /**
   * 发送输入状态
   */
  sendTyping(isTyping: boolean): void {
    if (!this.socket?.connected) return
    this.socket.emit('typing:update', { isTyping })
  }

  disconnect(): void {
    if (this.socket) {
      console.log('[Socket] 主动断开连接')
      this.stopHeartbeat()
      this.socket.disconnect()
      this.socket = null
    }
  }

  /**
   * 启动心跳
   */
  private startHeartbeat(): void {
    this.stopHeartbeat()
    console.log('[Socket] 启动心跳, 间隔:', this.heartbeatIntervalMs, 'ms')

    this.heartbeatInterval = setInterval(() => {
      if (this.socket?.connected) {
        // 静默发送心跳，避免日志刷屏
        this.socket.emit('ping')
      }
    }, this.heartbeatIntervalMs)
  }

  /**
   * 停止心跳
   */
  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval)
      this.heartbeatInterval = null
      console.log('[Socket] 停止心跳')
    }
  }

  isConnected(): boolean {
    return this.socket?.connected ?? false
  }
}

// 单例
let socketInstance: SocketService | null = null

export function getSocket(): SocketService {
  if (!socketInstance) {
    socketInstance = new SocketService()
  }
  return socketInstance
}
