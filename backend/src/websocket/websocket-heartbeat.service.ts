import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Socket, Server } from 'socket.io';
import { AppLogger } from '../common/logger/app-logger.service';

interface HeartbeatState {
  interval: NodeJS.Timeout;
  lastPingTime: number;
  missedCount: number; // 连续超时次数
  sessionId?: string; // 关联的会话ID
}

/**
 * WebSocket 心跳管理服务
 * 负责检测和管理客户端连接的心跳状态
 */
@Injectable()
export class WebsocketHeartbeatService {
  // 心跳状态存储
  private readonly heartbeatStates = new Map<string, HeartbeatState>();

  // 心跳配置
  private readonly checkInterval: number; // 检测间隔
  private readonly maxMissedCount: number; // 最大连续超时次数
  private readonly pingTimeout: number; // 单次ping超时时间

  // WebSocket Server 引用（用于通知）
  private server: Server | null = null;

  constructor(
    private readonly configService: ConfigService,
    private readonly logger: AppLogger,
  ) {
    this.logger.setContext(WebsocketHeartbeatService.name);

    // 从配置读取参数
    this.checkInterval = this.configService.get<number>(
      'WS_HEARTBEAT_CHECK_INTERVAL',
      15000, // 默认15秒检测一次
    );
    this.maxMissedCount = this.configService.get<number>(
      'WS_HEARTBEAT_MAX_MISSED',
      3, // 默认连续3次超时断开
    );
    this.pingTimeout = this.configService.get<number>(
      'WS_HEARTBEAT_PING_TIMEOUT',
      15000, // 单次超时时间（与检测间隔一致）
    );

    this.logger.log(
      `心跳配置: 检测间隔=${this.checkInterval}ms, 最大超时次数=${this.maxMissedCount}, ` +
        `总超时时间=${(this.checkInterval * this.maxMissedCount) / 1000}秒`,
    );
  }

  /**
   * 设置 WebSocket Server 引用
   */
  setServer(server: Server): void {
    this.server = server;
  }

  /**
   * 设置客户端心跳检测
   */
  setupHeartbeat(client: Socket, sessionId?: string): void {
    // 清除旧的定时器
    this.clearHeartbeat(client.id);

    const state: HeartbeatState = {
      interval: null as any,
      lastPingTime: Date.now(),
      missedCount: 0,
      sessionId,
    };

    // 监听 ping 消息
    client.on('ping', () => {
      const currentState = this.heartbeatStates.get(client.id);
      if (currentState) {
        currentState.lastPingTime = Date.now();
        currentState.missedCount = 0; // 重置超时计数
      }
      client.emit('pong');
    });

    // 定期检查心跳
    state.interval = setInterval(() => {
      this.checkHeartbeat(client);
    }, this.checkInterval);

    this.heartbeatStates.set(client.id, state);
    this.logger.debug(`已为客户端 ${client.id} 设置心跳检测`);
  }

  /**
   * 更新客户端关联的会话ID
   */
  updateSessionId(clientId: string, sessionId: string): void {
    const state = this.heartbeatStates.get(clientId);
    if (state) {
      state.sessionId = sessionId;
    }
  }

  /**
   * 检查心跳状态
   */
  private checkHeartbeat(client: Socket): void {
    const state = this.heartbeatStates.get(client.id);
    if (!state) return;

    const timeSinceLastPing = Date.now() - state.lastPingTime;

    if (timeSinceLastPing > this.pingTimeout) {
      state.missedCount++;

      this.logger.warn(
        `客户端 ${client.id} 心跳超时 (${state.missedCount}/${this.maxMissedCount})`,
        { sessionId: state.sessionId },
      );

      // 检查是否达到最大超时次数
      if (state.missedCount >= this.maxMissedCount) {
        this.handleHeartbeatTimeout(client, state);
      } else {
        // 还未达到最大次数，发送警告通知
        this.sendTimeoutWarning(client, state);
      }
    }
  }

  /**
   * 处理心跳超时（达到最大次数）
   */
  private handleHeartbeatTimeout(client: Socket, state: HeartbeatState): void {
    const sessionId = state.sessionId;

    this.logger.warn(
      `客户端 ${client.id} 连续 ${this.maxMissedCount} 次心跳超时，断开连接`,
      { sessionId },
    );

    // 1. 通知玩家连接即将断开
    try {
      client.emit('connection-lost', {
        code: 408001,
        msg: '连接超时，请检查网络后重新连接',
        reason: 'heartbeat_timeout',
        sessionId,
        canReconnect: true, // 告知客户端可以重连
      });
    } catch (error) {
      this.logger.warn(`发送断开通知给玩家失败: ${error.message}`);
    }

    // 2. 通知客服该玩家连接断开（如果有关联会话）
    if (sessionId && this.server) {
      this.notifyAgentPlayerDisconnected(sessionId, client.id);
    }

    // 3. 清理心跳状态
    this.clearHeartbeat(client.id);

    // 4. 断开连接（不修改会话状态，等待重连）
    // 使用 close 而不是 disconnect，允许客户端重连
    client.disconnect(false);
  }

  /**
   * 发送超时警告（未达到最大次数时）
   */
  private sendTimeoutWarning(client: Socket, state: HeartbeatState): void {
    const remainingAttempts = this.maxMissedCount - state.missedCount;

    try {
      client.emit('heartbeat-warning', {
        code: 408002,
        msg: `心跳超时，还有 ${remainingAttempts} 次机会`,
        missedCount: state.missedCount,
        maxMissedCount: this.maxMissedCount,
        remainingAttempts,
      });
    } catch (error) {
      this.logger.warn(`发送心跳警告失败: ${error.message}`);
    }
  }

  /**
   * 通知客服玩家连接断开
   */
  private notifyAgentPlayerDisconnected(
    sessionId: string,
    clientId: string,
  ): void {
    if (!this.server) return;

    try {
      // 向会话房间广播玩家断开通知（客服端会收到）
      this.server.to(`session:${sessionId}`).emit('player-disconnected', {
        sessionId,
        clientId,
        reason: 'heartbeat_timeout',
        msg: '玩家连接超时断开，等待重连中...',
        timestamp: new Date().toISOString(),
        canReconnect: true,
      });

      this.logger.log(`已通知客服：会话 ${sessionId} 的玩家连接断开`);
    } catch (error) {
      this.logger.warn(`通知客服失败: ${error.message}`);
    }
  }

  /**
   * 通知客服玩家重新连接
   */
  notifyAgentPlayerReconnected(sessionId: string, clientId: string): void {
    if (!this.server) return;

    try {
      this.server.to(`session:${sessionId}`).emit('player-reconnected', {
        sessionId,
        clientId,
        msg: '玩家已重新连接',
        timestamp: new Date().toISOString(),
      });

      this.logger.log(`已通知客服：会话 ${sessionId} 的玩家重新连接`);
    } catch (error) {
      this.logger.warn(`通知客服重连失败: ${error.message}`);
    }
  }

  /**
   * 清除客户端心跳检测
   */
  clearHeartbeat(clientId: string): void {
    const state = this.heartbeatStates.get(clientId);
    if (state) {
      clearInterval(state.interval);
      this.heartbeatStates.delete(clientId);
    }
  }

  /**
   * 处理 ping 消息（用于 @SubscribeMessage 装饰器）
   */
  handlePing(client: Socket): { success: boolean } {
    const state = this.heartbeatStates.get(client.id);
    if (state) {
      state.lastPingTime = Date.now();
      state.missedCount = 0;
    }
    client.emit('pong');
    return { success: true };
  }

  /**
   * 获取客户端心跳状态
   */
  getHeartbeatState(clientId: string): {
    lastPingTime: number;
    missedCount: number;
    sessionId?: string;
  } | null {
    const state = this.heartbeatStates.get(clientId);
    if (!state) return null;
    return {
      lastPingTime: state.lastPingTime,
      missedCount: state.missedCount,
      sessionId: state.sessionId,
    };
  }

  /**
   * 获取当前活跃的心跳检测数量
   */
  getActiveHeartbeatCount(): number {
    return this.heartbeatStates.size;
  }

  /**
   * 清理所有心跳检测（应用关闭时调用）
   */
  clearAllHeartbeats(): void {
    for (const [clientId, state] of this.heartbeatStates) {
      clearInterval(state.interval);
    }
    this.heartbeatStates.clear();
    this.logger.log('所有心跳检测已清理');
  }
}
