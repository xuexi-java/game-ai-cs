import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger, UseGuards } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { MessageService } from '../message/message.service';
import { TicketService } from '../ticket/ticket.service';
import { Inject, forwardRef } from '@nestjs/common';

@WebSocketGateway({
  cors: {
    origin: ['http://localhost:20001', 'http://localhost:20002'],
    credentials: true,
  },
  namespace: '/',
})
export class WebsocketGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(WebsocketGateway.name);
  private connectedClients = new Map<
    string,
    { userId?: string; role?: string; username?: string; realName?: string; sessionId?: string }
  >();
  private playerSessions = new Map<string, string>(); // clientId -> sessionId
  private heartbeatIntervals = new Map<string, NodeJS.Timeout>(); // clientId -> interval

  constructor(
    private jwtService: JwtService,
    private configService: ConfigService,
    private prisma: PrismaService,
    private messageService: MessageService,
    @Inject(forwardRef(() => TicketService))
    private ticketService: TicketService,
  ) {}

  async handleConnection(client: Socket) {
    try {
      const token =
        client.handshake.auth?.token ||
        client.handshake.headers?.authorization?.replace('Bearer ', '');

      if (token) {
        try {
          const payload = this.jwtService.verify(token, {
            secret:
              this.configService.get<string>('JWT_SECRET') || 'your-secret-key',
          });

          const user = await this.prisma.user.findUnique({
            where: { id: payload.sub },
          });

          if (user && !user.deletedAt) {
            this.connectedClients.set(client.id, {
              userId: user.id,
              role: user.role,
              username: user.username,
              realName: user.realName || undefined,
            });

            // 更新用户在线状态
            if (user.role === 'AGENT') {
              await this.prisma.user.update({
                where: { id: user.id },
                data: { isOnline: true },
              });
              this.notifyAgentStatusChange(user.id, true, {
                username: user.username,
                realName: user.realName || undefined,
                avatar: user.avatar || undefined,
              });
              
              // 客服上线时，自动分配 WAITING 状态的工单
              // 异步执行，不阻塞连接
              this.ticketService.autoAssignWaitingTickets(user.id).catch((error) => {
                this.logger.error(`自动分配工单失败: ${error.message}`);
              });
            }

            this.logger.log(`用户连接: ${user.username} (${client.id})`);
          }
        } catch (error) {
          this.logger.warn(`Token验证失败: ${client.id}`);
        }
      } else {
        // 玩家端连接（无token）
        this.connectedClients.set(client.id, {});
        this.logger.log(`玩家连接: ${client.id}`);
        
        // 设置心跳检测
        this.setupHeartbeat(client);
      }
    } catch (error) {
      this.logger.error(`连接处理错误: ${error.message}`);
    }
  }

  async handleDisconnect(client: Socket) {
    const clientInfo = this.connectedClients.get(client.id);

    // 清除心跳检测
    this.clearHeartbeat(client.id);

    if (clientInfo?.userId) {
      // 更新用户离线状态
      const user = await this.prisma.user
        .update({
          where: { id: clientInfo.userId },
          data: { isOnline: false },
        })
        .catch(() => {});
      if (user?.role === 'AGENT') {
        this.notifyAgentStatusChange(clientInfo.userId, false, {
          username: clientInfo.username,
          realName: clientInfo.realName,
        });
      }
    } else {
      // 玩家端断开连接，检查是否有活跃会话需要关闭
      const sessionId = this.playerSessions.get(client.id);
      if (sessionId) {
        try {
          const activeSession = await this.prisma.session.findUnique({
            where: { id: sessionId },
          });

          if (activeSession && (activeSession.status === 'IN_PROGRESS' || activeSession.status === 'QUEUED')) {
            // 通过 ticketService 调用 sessionService 的 closeByPlayer 方法
            // 由于循环依赖，需要通过 ticketService 来访问 sessionService
            await this.ticketService.closeSessionByPlayer(activeSession.id);
          }
        } catch (error) {
          this.logger.error(`处理玩家断开连接失败: ${error.message}`);
        }
        this.playerSessions.delete(client.id);
      }
    }

    this.connectedClients.delete(client.id);
    this.logger.log(`客户端断开: ${client.id}`);
  }

  // 玩家端 - 发送消息
  @SubscribeMessage('send-message')
  async handlePlayerMessage(
    @MessageBody() data: { sessionId: string; content: string },
    @ConnectedSocket() client: Socket,
  ) {
    try {
      const message = await this.messageService.create(
        {
          sessionId: data.sessionId,
          content: data.content,
        },
        'PLAYER',
      );

      this.notifyMessage(data.sessionId, message);

      return { success: true, messageId: message.id };
    } catch (error) {
      this.logger.error(`发送消息失败: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  // 管理端 - 客服发送消息
  @SubscribeMessage('agent:send-message')
  async handleAgentMessage(
    @MessageBody() data: { sessionId: string; content: string; messageType?: string },
    @ConnectedSocket() client: Socket,
  ) {
    try {
      const clientInfo = this.connectedClients.get(client.id);
      if (!clientInfo?.userId) {
        return { success: false, error: '未认证' };
      }

      // 获取会话信息，检查是否关联了工单
      const session = await this.prisma.session.findUnique({
        where: { id: data.sessionId },
        include: {
          ticket: true,
        },
      });

      if (!session) {
        return { success: false, error: '会话不存在' };
      }

      // 创建会话消息
      const message = await this.messageService.create(
        {
          sessionId: data.sessionId,
          content: data.content,
          messageType: data.messageType as any || 'TEXT',
        },
        'AGENT',
        clientInfo.userId,
      );

      // 发送到会话房间
      this.notifyMessage(data.sessionId, message);

      // 如果会话关联了工单，同时创建工单消息并发送到工单房间
      if (session.ticketId && session.ticket) {
        try {
          // 创建工单消息
          const ticketMessage = await this.prisma.ticketMessage.create({
            data: {
              ticketId: session.ticketId,
              senderId: clientInfo.userId,
              content: data.content,
            },
            include: {
              sender: {
                select: {
                  id: true,
                  username: true,
                  realName: true,
                },
              },
            },
          });

          // 发送到工单房间（玩家端可以接收）
          this.notifyTicketMessage(session.ticketId, ticketMessage);

          // 更新工单状态
          await this.prisma.ticket.update({
            where: { id: session.ticketId },
            data: {
              status: 'IN_PROGRESS',
            },
          });

          // 通知工单状态更新
          this.notifyTicketUpdate(session.ticketId, {
            status: 'IN_PROGRESS',
          });
        } catch (ticketError) {
          // 工单消息创建失败不影响会话消息
          this.logger.warn(`创建工单消息失败: ${ticketError.message}`);
        }
      }

      return { success: true, messageId: message.id };
    } catch (error) {
      this.logger.error(`客服发送消息失败: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  // 加入会话房间
  @SubscribeMessage('join-session')
  async handleJoinSession(
    @MessageBody() data: { sessionId: string },
    @ConnectedSocket() client: Socket,
  ) {
    client.join(`session:${data.sessionId}`);
    
    // 记录玩家的会话ID（用于断开连接时关闭会话）
    const clientInfo = this.connectedClients.get(client.id);
    if (!clientInfo?.userId) {
      // 玩家端
      this.playerSessions.set(client.id, data.sessionId);
      const existingInfo = this.connectedClients.get(client.id);
      if (existingInfo) {
        existingInfo.sessionId = data.sessionId;
      }
    }
    
    this.logger.log(`客户端加入会话: ${data.sessionId}`);
    return { success: true };
  }

  // 心跳检测
  @SubscribeMessage('ping')
  handlePing(@ConnectedSocket() client: Socket) {
    client.emit('pong');
    return { success: true };
  }

  // 设置心跳检测
  private setupHeartbeat(client: Socket) {
    // 清除旧的定时器
    this.clearHeartbeat(client.id);

    // 设置心跳超时（30秒无响应则视为断开）
    let lastPingTime = Date.now();
    const heartbeatTimeout = 30000; // 30秒

    // 监听 ping 消息
    client.on('ping', () => {
      lastPingTime = Date.now();
      client.emit('pong');
    });

    // 定期检查心跳
    const interval = setInterval(() => {
      const timeSinceLastPing = Date.now() - lastPingTime;
      if (timeSinceLastPing > heartbeatTimeout) {
        this.logger.warn(`客户端 ${client.id} 心跳超时，断开连接`);
        client.disconnect();
        clearInterval(interval);
        this.heartbeatIntervals.delete(client.id);
      }
    }, 10000); // 每10秒检查一次

    this.heartbeatIntervals.set(client.id, interval);
  }

  // 清除心跳检测
  private clearHeartbeat(clientId: string) {
    const interval = this.heartbeatIntervals.get(clientId);
    if (interval) {
      clearInterval(interval);
      this.heartbeatIntervals.delete(clientId);
    }
  }

  // 离开会话房间
  @SubscribeMessage('leave-session')
  async handleLeaveSession(
    @MessageBody() data: { sessionId: string },
    @ConnectedSocket() client: Socket,
  ) {
    client.leave(`session:${data.sessionId}`);
    this.logger.log(`客户端离开会话: ${data.sessionId}`);
    return { success: true };
  }

  // 加入工单房间（玩家端）
  @SubscribeMessage('join-ticket')
  async handleJoinTicket(
    @MessageBody() data: { ticketId: string },
    @ConnectedSocket() client: Socket,
  ) {
    client.join(`ticket:${data.ticketId}`);
    this.logger.log(`客户端加入工单: ${data.ticketId}`);
    return { success: true };
  }

  // 离开工单房间
  @SubscribeMessage('leave-ticket')
  async handleLeaveTicket(
    @MessageBody() data: { ticketId: string },
    @ConnectedSocket() client: Socket,
  ) {
    client.leave(`ticket:${data.ticketId}`);
    this.logger.log(`客户端离开工单: ${data.ticketId}`);
    return { success: true };
  }

  // 通知会话更新（客服接入、队列更新等）
  notifySessionUpdate(sessionId: string, data: any) {
    this.server.to(`session:${sessionId}`).emit('session-update', data);
  }

  // 通知新会话（管理端）
  notifyNewSession(session: any) {
    this.server.emit('new-session', session);
  }

  // 通知队列更新
  notifyQueueUpdate(sessionId: string, position: number, waitTime?: number | null) {
    this.server.to(`session:${sessionId}`).emit('queue-update', {
      queuePosition: position,
      position, // 兼容旧版本
      waitTime,
      estimatedWaitTime: waitTime, // 兼容新版本
    });
  }

  // 通知新消息
  notifyMessage(sessionId: string, message: any) {
    // 发送给会话房间的所有客户端（玩家端和客服端）
    this.server.to(`session:${sessionId}`).emit('message', {
      sessionId,
      message,
    });
  }

  notifyAgentStatusChange(
    agentId: string,
    isOnline: boolean,
    extra?: { username?: string; realName?: string; avatar?: string },
  ) {
    this.server.emit('agent-status-changed', {
      agentId,
      isOnline,
      username: extra?.username,
      realName: extra?.realName,
      avatar: extra?.avatar,
    });
  }

  // 通知工单消息（玩家端和客服端）
  notifyTicketMessage(ticketId: string, message: any) {
    // 通知所有连接到该工单的客户端（通过 ticketId 房间）
    this.server.to(`ticket:${ticketId}`).emit('ticket-message', message);
  }

  // 通知工单状态更新
  notifyTicketUpdate(ticketId: string, data: any) {
    // 通知所有连接到该工单的客户端
    this.server.to(`ticket:${ticketId}`).emit('ticket-update', data);
    // 同时通知管理端（工单列表可能需要更新）
    this.server.emit('ticket-status-changed', {
      ticketId,
      ...data,
    });
  }
}
