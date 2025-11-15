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

@WebSocketGateway({
  cors: {
    origin: ['http://localhost:5173', 'http://localhost:5174'],
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
  private connectedClients = new Map<string, { userId?: string; role?: string }>();

  constructor(
    private jwtService: JwtService,
    private configService: ConfigService,
    private prisma: PrismaService,
    private messageService: MessageService,
  ) {}

  async handleConnection(client: Socket) {
    try {
      const token = client.handshake.auth?.token || client.handshake.headers?.authorization?.replace('Bearer ', '');
      
      if (token) {
        try {
          const payload = this.jwtService.verify(token, {
            secret: this.configService.get<string>('JWT_SECRET') || 'your-secret-key',
          });
          
          const user = await this.prisma.user.findUnique({
            where: { id: payload.sub },
          });

          if (user && !user.deletedAt) {
            this.connectedClients.set(client.id, {
              userId: user.id,
              role: user.role,
            });

            // 更新用户在线状态
            if (user.role === 'AGENT') {
              await this.prisma.user.update({
                where: { id: user.id },
                data: { isOnline: true },
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
      }
    } catch (error) {
      this.logger.error(`连接处理错误: ${error.message}`);
    }
  }

  async handleDisconnect(client: Socket) {
    const clientInfo = this.connectedClients.get(client.id);
    
    if (clientInfo?.userId) {
      // 更新用户离线状态
      await this.prisma.user.update({
        where: { id: clientInfo.userId },
        data: { isOnline: false },
      }).catch(() => {});
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

      // 广播消息给会话相关方
      this.server.emit(`session:${data.sessionId}:message`, message);

      return { success: true, messageId: message.id };
    } catch (error) {
      this.logger.error(`发送消息失败: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  // 管理端 - 客服发送消息
  @SubscribeMessage('agent:send-message')
  async handleAgentMessage(
    @MessageBody() data: { sessionId: string; content: string },
    @ConnectedSocket() client: Socket,
  ) {
    try {
      const clientInfo = this.connectedClients.get(client.id);
      if (!clientInfo?.userId) {
        return { success: false, error: '未认证' };
      }

      const message = await this.messageService.create(
        {
          sessionId: data.sessionId,
          content: data.content,
        },
        'AGENT',
        clientInfo.userId,
      );

      // 广播消息
      this.server.emit(`session:${data.sessionId}:message`, message);

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
    this.logger.log(`客户端加入会话: ${data.sessionId}`);
    return { success: true };
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

  // 通知会话更新（客服接入、队列更新等）
  notifySessionUpdate(sessionId: string, data: any) {
    this.server.to(`session:${sessionId}`).emit('session-update', data);
  }

  // 通知新会话（管理端）
  notifyNewSession(session: any) {
    this.server.emit('new-session', session);
  }

  // 通知队列更新
  notifyQueueUpdate(sessionId: string, position: number, waitTime?: number) {
    this.server.to(`session:${sessionId}`).emit('queue-update', {
      position,
      waitTime,
    });
  }
}

