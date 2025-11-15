import { io, Socket } from 'socket.io-client';
import { message } from 'antd';
import { useSessionStore } from '../stores/sessionStore';
import type { Session, Message } from '../types';

class WebSocketService {
  private socket: Socket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;

  connect(token: string) {
    if (this.socket?.connected) {
      return;
    }

    this.socket = io('ws://localhost:3000', {
      auth: {
        token: token
      },
      transports: ['websocket'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: this.maxReconnectAttempts,
    });

    this.setupEventListeners();
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }

  private setupEventListeners() {
    if (!this.socket) return;

    // 连接成功
    this.socket.on('connect', () => {
      console.log('WebSocket连接成功');
      this.reconnectAttempts = 0;
      message.success('实时连接已建立');
    });

    // 连接断开
    this.socket.on('disconnect', (reason) => {
      console.log('WebSocket连接断开:', reason);
      if (reason === 'io server disconnect') {
        // 服务器主动断开，需要重新连接
        this.socket?.connect();
      }
    });

    // 连接错误
    this.socket.on('connect_error', (error) => {
      console.error('WebSocket连接错误:', error);
      this.reconnectAttempts++;
      
      if (this.reconnectAttempts >= this.maxReconnectAttempts) {
        message.error('无法连接到服务器，请检查网络连接');
      }
    });

    // 新会话通知
    this.socket.on('new-session', (session: Session) => {
      console.log('收到新会话:', session);
      const { queuedSessions, setQueuedSessions } = useSessionStore.getState();
      setQueuedSessions([...queuedSessions, session]);
      
      message.info(`新会话: ${session.ticket.ticketNo}`, 3);
    });

    // 会话状态更新
    this.socket.on('session-update', (data: Partial<Session> & { sessionId: string }) => {
      console.log('会话状态更新:', data);
      const { updateSession } = useSessionStore.getState();
      updateSession(data.sessionId, data);
    });

    // 接收消息
    this.socket.on('message', (data: { sessionId: string; message: Message }) => {
      console.log('收到消息:', data);
      const { addMessage } = useSessionStore.getState();
      addMessage(data.sessionId, data.message);
    });
  }

  // 客服发送消息
  sendAgentMessage(sessionId: string, content: string): Promise<{ success: boolean; messageId?: string; error?: string }> {
    return new Promise((resolve) => {
      if (!this.socket?.connected) {
        resolve({ success: false, error: '连接已断开' });
        return;
      }

      this.socket.emit('agent:send-message', 
        { sessionId, content },
        (response: { success: boolean; messageId?: string; error?: string }) => {
          resolve(response);
        }
      );
    });
  }

  // 加入会话房间
  joinSession(sessionId: string): Promise<{ success: boolean }> {
    return new Promise((resolve) => {
      if (!this.socket?.connected) {
        resolve({ success: false });
        return;
      }

      this.socket.emit('join-session', 
        { sessionId },
        (response: { success: boolean }) => {
          resolve(response);
        }
      );
    });
  }

  // 离开会话房间
  leaveSession(sessionId: string): Promise<{ success: boolean }> {
    return new Promise((resolve) => {
      if (!this.socket?.connected) {
        resolve({ success: false });
        return;
      }

      this.socket.emit('leave-session', 
        { sessionId },
        (response: { success: boolean }) => {
          resolve(response);
        }
      );
    });
  }

  // 获取连接状态
  isConnected(): boolean {
    return this.socket?.connected || false;
  }
}

// 导出单例实例
export const websocketService = new WebSocketService();
