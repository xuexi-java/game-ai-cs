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
import { Logger, UseGuards, Inject, OnModuleInit } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { MessageService } from '../message/message.service';
import { TicketService } from '../ticket/ticket.service';
import { forwardRef } from '@nestjs/common';
import Redis from 'ioredis';

@WebSocketGateway({
  cors: {
    // 注意：WebSocket Gateway 的 CORS 配置是静态的，无法从环境变量动态读取
    // 实际 CORS 控制由 main.ts 中的 app.enableCors() 统一管理
    // 这里的配置仅作为开发环境的默认值，生产环境应通过环境变量 FRONTEND_URL 配置
    origin: process.env.FRONTEND_URL?.split(',').map((url) => url.trim()) || [
      'http://localhost:20101',
      'http://localhost:20102',
    ],
    credentials: true,
  },
  namespace: '/',
})
export class WebsocketGateway
  implements OnGatewayConnection, OnGatewayDisconnect, OnModuleInit
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(WebsocketGateway.name);
  
  // 保留内存 Map 作为缓存（提高性能）
  private connectedClients = new Map<
    string,
    {
      userId?: string;
      role?: string;
      username?: string;
      realName?: string;
      sessionId?: string;
    }
  >();
  private playerSessions = new Map<string, string>(); // clientId -> sessionId
  private heartbeatIntervals = new Map<string, NodeJS.Timeout>(); // clientId -> interval

  // Redis Key 前缀
  private readonly REDIS_PREFIX = {
    CLIENT: 'ws:client:',
    PLAYER_SESSION: 'ws:player:',
    AGENT_ONLINE: 'ws:agent:online:',
  };

  constructor(
    private jwtService: JwtService,
    private configService: ConfigService,
    private prisma: PrismaService,
    private messageService: MessageService,
    @Inject(forwardRef(() => TicketService))
    private ticketService: TicketService,
    @Inject('REDIS_CLIENT')
    private redis: Redis,
  ) {}

  async onModuleInit() {
    // 服务启动时恢复状态（延迟执行，等待 Redis 连接就绪）
    setTimeout(() => {
      this.restoreStateFromRedis();
    }, 2000); // 延迟 2 秒，确保 Redis 连接就绪
  }

  // 检查 Redis 是否可用
  private async isRedisAvailable(): Promise<boolean> {
    try {
      const result = await Promise.race([
        this.redis.ping(),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Redis ping timeout')), 2000),
        ),
      ]);
      return result === 'PONG';
    } catch (error) {
      this.logger.warn(`Redis 不可用: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  }

  // 从 Redis 恢复状态
  private async restoreStateFromRedis() {
    try {
      this.logger.log('开始从 Redis 恢复 WebSocket 状态...');

      // 检查 Redis 是否可用
      const isAvailable = await this.isRedisAvailable();
      if (!isAvailable) {
        this.logger.warn('Redis 不可用，跳过状态恢复');
        return;
      }

      // 检查 Redis 连接状态（使用 ping 而不是 status，因为 status 类型不包含 'ready'）
      const pingResult = await this.isRedisAvailable();
      if (!pingResult) {
        this.logger.warn(`Redis 连接未就绪 (状态: ${this.redis.status})，等待连接...`);
        // 等待连接就绪，最多等待 5 秒
        let retries = 0;
        while (retries < 10) {
          await new Promise((resolve) => setTimeout(resolve, 500));
          const available = await this.isRedisAvailable();
          if (available) {
            break;
          }
          retries++;
        }
        const finalCheck = await this.isRedisAvailable();
        if (!finalCheck) {
          this.logger.warn('Redis 连接超时，跳过状态恢复');
          return;
        }
      }

      // 恢复在线客服状态
      const onlineAgentKeys = await this.redis.keys(`${this.REDIS_PREFIX.AGENT_ONLINE}*`);
      for (const key of onlineAgentKeys) {
        const agentId = key.replace(this.REDIS_PREFIX.AGENT_ONLINE, '');
        const agentData = await this.redis.get(key);
        if (agentData) {
          try {
            const data = JSON.parse(agentData);
            // 更新数据库中的在线状态
            await this.prisma.user.update({
              where: { id: agentId },
              data: { isOnline: true },
            });
            this.logger.log(`恢复客服在线状态: ${agentId}`);
          } catch (error) {
            this.logger.warn(`恢复客服状态失败: ${agentId}`, error);
          }
        }
      }

      // 清理过期的连接数据（超过24小时）
      const allClientKeys = await this.redis.keys(`${this.REDIS_PREFIX.CLIENT}*`);
      for (const key of allClientKeys) {
        const ttl = await this.redis.ttl(key);
        if (ttl === -1) {
          // 没有过期时间的 key，设置24小时过期
          await this.redis.expire(key, 86400);
        }
      }

      this.logger.log('WebSocket 状态恢复完成');
    } catch (error) {
      // 如果是连接错误，只记录警告，不阻止应用启动
      if (error instanceof Error && error.message.includes('enableOfflineQueue')) {
        this.logger.warn('Redis 连接未就绪，跳过状态恢复（这是正常的，应用将继续启动）');
      } else {
        this.logger.error(`恢复状态失败: ${error instanceof Error ? error.message : String(error)}`, error instanceof Error ? error.stack : undefined);
      }
    }
  }

  // 保存客户端信息到 Redis
  private async saveClientToRedis(clientId: string, clientInfo: any) {
    const key = `${this.REDIS_PREFIX.CLIENT}${clientId}`;
    await this.redis.setex(key, 86400, JSON.stringify(clientInfo)); // 24小时过期
  }

  // 从 Redis 获取客户端信息
  private async getClientFromRedis(clientId: string) {
    const key = `${this.REDIS_PREFIX.CLIENT}${clientId}`;
    const data = await this.redis.get(key);
    return data ? JSON.parse(data) : null;
  }

  // 删除 Redis 中的客户端信息
  private async deleteClientFromRedis(clientId: string) {
    const key = `${this.REDIS_PREFIX.CLIENT}${clientId}`;
    await this.redis.del(key);
  }

  // 保存玩家会话绑定到 Redis
  private async savePlayerSessionToRedis(clientId: string, sessionId: string) {
    const key = `${this.REDIS_PREFIX.PLAYER_SESSION}${clientId}`;
    await this.redis.setex(key, 86400, sessionId); // 24小时过期
  }

  // 从 Redis 获取玩家会话
  private async getPlayerSessionFromRedis(clientId: string): Promise<string | null> {
    const key = `${this.REDIS_PREFIX.PLAYER_SESSION}${clientId}`;
    return await this.redis.get(key);
  }

  // 删除 Redis 中的玩家会话
  private async deletePlayerSessionFromRedis(clientId: string) {
    const key = `${this.REDIS_PREFIX.PLAYER_SESSION}${clientId}`;
    await this.redis.del(key);
  }

  // 保存客服在线状态到 Redis
  private async saveAgentOnlineToRedis(agentId: string, agentInfo: any) {
    const key = `${this.REDIS_PREFIX.AGENT_ONLINE}${agentId}`;
    await this.redis.setex(key, 86400, JSON.stringify(agentInfo)); // 24小时过期
  }

  // 删除 Redis 中的客服在线状态
  private async deleteAgentOnlineFromRedis(agentId: string) {
    const key = `${this.REDIS_PREFIX.AGENT_ONLINE}${agentId}`;
    await this.redis.del(key);
  }

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
            const clientInfo = {
              userId: user.id,
              role: user.role,
              username: user.username,
              realName: user.realName || undefined,
            };

            // 保存到内存和 Redis
            this.connectedClients.set(client.id, clientInfo);
            await this.saveClientToRedis(client.id, clientInfo);

            // 更新用户在线状态（客服和管理员）
            if (user.role === 'AGENT' || user.role === 'ADMIN') {
              await this.prisma.user.update({
                where: { id: user.id },
                data: { isOnline: true },
              });
              
              // 保存客服/管理员在线状态到 Redis
              await this.saveAgentOnlineToRedis(user.id, {
                username: user.username,
                realName: user.realName || undefined,
                avatar: user.avatar || undefined,
              });

              this.notifyAgentStatusChange(user.id, true, {
                username: user.username,
                realName: user.realName || undefined,
                avatar: user.avatar || undefined,
              });

              // ✅ 修复：客服或管理员上线时，自动分配 WAITING 状态的工单
              // 异步执行，不阻塞连接
              this.ticketService
                .autoAssignWaitingTickets(user.id)
                .catch((error) => {
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
        const clientInfo = {};
        this.connectedClients.set(client.id, clientInfo);
        await this.saveClientToRedis(client.id, clientInfo);
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

    // 从 Redis 删除客户端信息
    await this.deleteClientFromRedis(client.id);

    if (clientInfo?.userId) {
      // 先查询用户角色
      const user = await this.prisma.user.findUnique({
        where: { id: clientInfo.userId },
        select: { role: true },
      }).catch(() => null);

      // 更新用户离线状态
      await this.prisma.user
        .update({
          where: { id: clientInfo.userId },
          data: { isOnline: false },
        })
        .catch(() => {});

      if (user?.role === 'AGENT') {
        // 从 Redis 删除客服在线状态
        await this.deleteAgentOnlineFromRedis(clientInfo.userId);
        
        this.notifyAgentStatusChange(clientInfo.userId, false, {
          username: clientInfo.username,
          realName: clientInfo.realName,
        });
      }
    } else {
      // 玩家端断开连接
      // 注意：不再自动关闭会话，让会话保持在队列中，等待客服处理
      // 玩家可以通过主动关闭会话或客服处理来完成会话
      const sessionId = this.playerSessions.get(client.id);
      if (sessionId) {
        this.logger.log(`玩家断开连接，会话 ${sessionId} 保持在队列中，等待客服处理`);
        this.playerSessions.delete(client.id);
        await this.deletePlayerSessionFromRedis(client.id);
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
    @MessageBody()
    data: { sessionId: string; content: string; messageType?: string },
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

      // 权限检查：只有处理该会话的客服才能发送消息
      // 管理员可以发送消息到任何会话
      const user = await this.prisma.user.findUnique({
        where: { id: clientInfo.userId },
        select: { role: true },
      });

      if (user?.role === 'AGENT') {
        // 客服只能发送消息到自己处理的会话
        if (session.agentId !== clientInfo.userId) {
          return {
            success: false,
            error: '无权发送消息：该会话已分配给其他客服，只有处理该会话的客服才能回复',
          };
        }
        // 检查会话状态，必须是IN_PROGRESS状态才能发送消息
        if (session.status !== 'IN_PROGRESS') {
          return {
            success: false,
            error: '会话未接入，请先接入会话后才能发送消息',
          };
        }
      }

      // 创建会话消息（传递用户信息用于权限检查）
      const message = await this.messageService.create(
        {
          sessionId: data.sessionId,
          content: data.content,
          messageType: (data.messageType as any) || 'TEXT',
        },
        'AGENT',
        clientInfo.userId,
        user ? { id: clientInfo.userId, role: user.role } : undefined,
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
      // 保存玩家会话到 Redis
      await this.savePlayerSessionToRedis(client.id, data.sessionId);
      const existingInfo = this.connectedClients.get(client.id);
      if (existingInfo) {
        existingInfo.sessionId = data.sessionId;
        // 保存玩家会话到 Redis
        await this.saveClientToRedis(client.id, existingInfo);
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

    // 设置心跳超时（2分钟无响应则视为断开）
    let lastPingTime = Date.now();
    const heartbeatTimeout = 120000; // 2分钟（120秒）

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
    // 发送到会话房间（包括玩家端和客服端）
    this.server.to(`session:${sessionId}`).emit('session-update', data);
    this.logger.debug(`通知会话更新: ${sessionId}, 状态: ${data.status}, 房间: session:${sessionId}`);
  }

  // 通知新会话（管理端）
  notifyNewSession(session: any) {
    this.server.emit('new-session', session);
  }

  // 通知队列更新
  notifyQueueUpdate(
    sessionId: string,
    position: number,
    waitTime?: number | null,
  ) {
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
