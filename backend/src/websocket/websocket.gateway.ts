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
import {
  Inject,
  OnModuleInit,
  OnApplicationBootstrap,
  forwardRef,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { MessageService } from '../message/message.service';
import { TicketService } from '../ticket/ticket.service';
import { SessionService } from '../session/session.service';
import { KeyService } from '../player-api/services/key.service';
import { TokenService } from '../player-api/services/token.service';
import { SessionAIService } from '../session/services/session-ai.service';
import {
  wsConnectionsGauge,
  wsMessagesCounter,
} from '../metrics/queue.metrics';
import { AppLogger } from '../common/logger/app-logger.service';
import { WebsocketStateService } from './websocket-state.service';
import { WebsocketHeartbeatService } from './websocket-heartbeat.service';
import { WebsocketRateLimitService } from './websocket-rate-limit.service';
import { WsErrorCode, WsErrorMessages } from '../player-api/dto/connect.dto';
import { TicketStatus } from '@prisma/client';

@WebSocketGateway({
  cors: {
    origin: process.env.FRONTEND_URL?.split(',').map((url) => url.trim()) ||
      (process.env.CORS_DEFAULT_DEV_ORIGINS?.split(',') || [
        'http://localhost:20101',
        'http://localhost:5173',
      ]),
    credentials: true,
  },
  namespace: '/',
})
export class WebsocketGateway
  implements
    OnGatewayConnection,
    OnGatewayDisconnect,
    OnModuleInit,
    OnApplicationBootstrap
{
  @WebSocketServer()
  server: Server;

  // 内存缓存（提高性能）
  private connectedClients = new Map<
    string,
    {
      userId?: string;
      role?: string;
      username?: string;
      realName?: string;
      sessionId?: string;
      clientType?: 'player' | 'agent';
      // 玩家API新增字段
      gameid?: string;
      uid?: string;
      areaid?: string;
      tid?: string;
      key?: string;
      playerName?: string;
    }
  >();
  private playerSessions = new Map<string, string>(); // clientId -> sessionId

  constructor(
    private jwtService: JwtService,
    private configService: ConfigService,
    private prisma: PrismaService,
    private messageService: MessageService,
    @Inject(forwardRef(() => TicketService))
    private ticketService: TicketService,
    @Inject(forwardRef(() => SessionService))
    private sessionService: SessionService,
    private readonly stateService: WebsocketStateService,
    private readonly heartbeatService: WebsocketHeartbeatService,
    private readonly rateLimitService: WebsocketRateLimitService,
    private readonly logger: AppLogger,
    @Inject(forwardRef(() => KeyService))
    private readonly keyService: KeyService,
    @Inject(forwardRef(() => TokenService))
    private readonly tokenService: TokenService,
    @Inject(forwardRef(() => SessionAIService))
    private readonly sessionAIService: SessionAIService,
  ) {
    this.logger.setContext(WebsocketGateway.name);
  }

  async onModuleInit() {
    // 初始化阶段不再延迟，实际恢复放在 onApplicationBootstrap
  }

  async onApplicationBootstrap() {
    // 设置心跳服务的 Server 引用（用于通知客服）
    this.heartbeatService.setServer(this.server);

    this.stateService.restoreStateFromRedis().catch((err) => {
      this.logger.error('WebSocket 状态恢复过程中发生未捕获异常', err);
    });
  }

  async handleConnection(client: Socket) {
    try {
      // 获取 auth.token（可能是客服端JWT 或 玩家端wsToken）
      const authToken = client.handshake.auth?.token as string;

      // 检查是否是旧版 tid+key 认证（兼容旧版玩家端）
      const tid = client.handshake.query?.tid as string;
      const key = client.handshake.query?.key as string;

      // 获取后台管理端 JWT token（从 header 获取，优先级最高）
      const headerJwtToken =
        client.handshake.headers?.authorization?.replace('Bearer ', '');

      // 认证优先级：
      // 1. Header 中的 JWT（客服端旧版）
      // 2. auth.token 先尝试 JWT 验证（客服端新版），失败则作为 wsToken（玩家端）
      // 3. tid+key（旧版玩家端）

      if (headerJwtToken) {
        // 客服端：从 header 获取 JWT
        await this.handleAgentJwtAuth(client, headerJwtToken);
      } else if (authToken) {
        // 先尝试作为客服端 JWT 验证
        const isAgentJwt = await this.tryAgentJwtAuth(client, authToken);
        if (!isAgentJwt) {
          // 不是有效的客服端 JWT，作为玩家端 wsToken 处理
          await this.handlePlayerWsTokenAuth(client, authToken);
        }
      } else if (tid && key) {
        // 兼容旧版：tid+key 认证
        await this.handlePlayerKeyAuth(client, tid, key);
      } else {
        // 无认证信息 - 兼容旧版玩家端
        const clientInfo = {};
        this.connectedClients.set(client.id, clientInfo);
        await this.stateService.saveClient(client.id, clientInfo);

        this.logger.log(`玩家连接（无认证）: ${client.id}`);

        // 设置心跳检测
        this.heartbeatService.setupHeartbeat(client);
      }
    } catch (error) {
      this.logger.error(
        `连接处理错误: ${error.message}`,
        error instanceof Error ? error.stack : undefined,
        { clientId: client.id },
      );
    }
  }

  /**
   * 处理客服端 JWT 认证
   */
  private async handleAgentJwtAuth(client: Socket, jwtToken: string) {
    try {
      const payload = this.jwtService.verify(jwtToken, {
        secret: this.configService.get<string>('JWT_SECRET'),
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
        await this.stateService.saveClient(client.id, clientInfo);

        // 更新用户在线状态（客服和管理员）
        if (user.role === 'AGENT' || user.role === 'ADMIN') {
          await this.prisma.user.update({
            where: { id: user.id },
            data: { isOnline: true },
          });

          await this.stateService.saveAgentOnline(user.id, {
            username: user.username,
            realName: user.realName || undefined,
            avatar: user.avatar || undefined,
          });

          this.notifyAgentStatusChange(user.id, true, {
            username: user.username,
            realName: user.realName || undefined,
            avatar: user.avatar || undefined,
          });

          // 客服或管理员上线时，自动分配 WAITING 状态的工单
          this.ticketService
            .autoAssignWaitingTickets(user.id)
            .catch((error) => {
              this.logger.error(
                `自动分配工单失败: ${error.message}`,
                error instanceof Error ? error.stack : undefined,
                { userId: user.id },
              );
            });
        }

        this.logger.log(`客服连接: ${user.username} (${client.id})`);
      } else {
        this.logger.warn(`JWT用户不存在或已删除: ${client.id}`);
        client.disconnect(true);
      }
    } catch (error) {
      this.logger.warn(`客服JWT验证失败: ${client.id}`);
      client.disconnect(true);
    }
  }

  /**
   * 尝试作为客服端 JWT 验证
   * @returns true 如果是有效的客服端 JWT，false 否则
   */
  private async tryAgentJwtAuth(client: Socket, token: string): Promise<boolean> {
    try {
      const payload = this.jwtService.verify(token, {
        secret: this.configService.get<string>('JWT_SECRET'),
      });

      // 验证成功，检查用户是否存在
      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
      });

      if (user && !user.deletedAt) {
        // 是有效的客服端 JWT，执行完整认证流程
        await this.handleAgentJwtAuth(client, token);
        return true;
      }

      return false;
    } catch {
      // JWT 验证失败，可能是玩家端的 wsToken
      return false;
    }
  }

  /**
   * 处理玩家API的tid+key认证
   */
  private async handlePlayerKeyAuth(client: Socket, tid: string, key: string) {
    // 1. 验证Key
    const verifyResult = await this.keyService.verifyKey(key, tid);
    if (!verifyResult.valid || !verifyResult.data) {
      this.logger.warn(`Key验证失败: tid=${tid}, clientId=${client.id}`);
      client.emit('error', { code: 'INVALID_KEY', message: '连接凭证无效' });
      client.disconnect(true);
      return;
    }

    const keyData = verifyResult.data;

    // 2. 检查并踢掉同一玩家的旧连接
    const existingSocketId = await this.keyService.getPlayerSocket(
      keyData.gameid,
      keyData.uid,
    );
    if (existingSocketId && existingSocketId !== client.id) {
      const existingSocket = this.server.sockets.sockets.get(existingSocketId);
      if (existingSocket) {
        this.logger.log(`踢掉旧连接: ${existingSocketId}`);
        existingSocket.emit('connection:kicked', { reason: 'NEW_CONNECTION' });
        existingSocket.disconnect(true);
      }
    }

    // 3. 存储新的Socket映射
    await this.keyService.storePlayerSocket(
      keyData.gameid,
      keyData.uid,
      client.id,
    );

    // 4. 查询工单信息
    const ticket = await this.prisma.ticket.findFirst({
      where: { ticketNo: tid, deletedAt: null },
      include: {
        sessions: {
          where: { status: { in: ['PENDING', 'QUEUED', 'IN_PROGRESS'] } },
          take: 1,
        },
      },
    });

    if (!ticket) {
      this.logger.warn(`工单不存在: tid=${tid}`);
      client.emit('error', { code: 'TICKET_NOT_FOUND', message: '工单不存在' });
      client.disconnect(true);
      return;
    }

    // 5. 保存客户端信息
    const clientInfo: {
      clientType: 'player';
      gameid: string;
      uid: string;
      areaid: string;
      tid: string;
      key: string;
      sessionId?: string;
    } = {
      clientType: 'player',
      gameid: keyData.gameid,
      uid: keyData.uid,
      areaid: keyData.areaid,
      tid: tid,
      key: key,
    };

    this.connectedClients.set(client.id, clientInfo);
    await this.stateService.saveClient(client.id, clientInfo);

    // 6. 自动加入工单房间
    client.join(`ticket:${ticket.id}`);

    // 7. 如果有活跃会话，自动加入会话房间
    if (ticket.sessions.length > 0) {
      const session = ticket.sessions[0];
      client.join(`session:${session.id}`);
      this.playerSessions.set(client.id, session.id);
      await this.stateService.savePlayerSession(client.id, session.id);
      clientInfo.sessionId = session.id;
    }

    // 8. 设置心跳检测
    this.heartbeatService.setupHeartbeat(client);

    // 9. 发送连接成功事件
    client.emit('connected', {
      tid: tid,
      status: ticket.status,
    });

    // 10. 更新玩家最后活跃时间
    await this.prisma.ticket.update({
      where: { id: ticket.id },
      data: { playerLastSeenAt: new Date() },
    });

    this.logger.log(
      `玩家Key认证成功: gameid=${keyData.gameid}, uid=${keyData.uid}, tid=${tid}`,
    );
  }

  /**
   * 处理玩家端 wsToken 认证（新协议）
   * 连接成功后，玩家需要调用 ticket:create 或 ticket:resume 绑定工单
   */
  private async handlePlayerWsTokenAuth(client: Socket, wsToken: string) {
    // 1. 验证 wsToken
    const tokenResult = this.tokenService.verifyWsToken(wsToken);
    if (!tokenResult.valid || !tokenResult.payload) {
      // 记录详细的验证失败原因
      const tokenPreview = wsToken ? `${wsToken.substring(0, 20)}...` : '(空)';
      this.logger.warn(
        `wsToken验证失败: clientId=${client.id}, ` +
        `errorCode=${tokenResult.errorCode || 'UNKNOWN'}, ` +
        `reason=${tokenResult.errorMessage || '未知错误'}, ` +
        `tokenPreview=${tokenPreview}`,
      );
      client.emit('error', {
        code: WsErrorCode.INVALID_TOKEN,
        message: tokenResult.errorMessage || WsErrorMessages[WsErrorCode.INVALID_TOKEN],
      });
      client.disconnect(true);
      return;
    }

    const { gameid, areaid, uid, playerName } = tokenResult.payload;

    // 2. 检查并踢掉同一玩家的旧连接
    const existingSocketId = await this.keyService.getPlayerSocket(gameid, uid);
    if (existingSocketId && existingSocketId !== client.id) {
      const existingSocket = this.server?.sockets?.sockets?.get(existingSocketId);
      if (existingSocket) {
        this.logger.log(`踢掉旧连接: ${existingSocketId}`);
        existingSocket.emit('connection:kicked', { reason: 'NEW_CONNECTION' });
        existingSocket.disconnect(true);
      }
    }

    // 3. 存储新的Socket映射
    await this.keyService.storePlayerSocket(gameid, uid, client.id);

    // 4. 保存客户端信息（此时还没有绑定工单）
    const clientInfo = {
      clientType: 'player' as const,
      gameid,
      uid,
      areaid,
      playerName,
      // tid 和 sessionId 在 ticket:create 或 ticket:resume 时设置
    };

    this.connectedClients.set(client.id, clientInfo);
    await this.stateService.saveClient(client.id, clientInfo);

    // 5. 设置心跳检测
    this.heartbeatService.setupHeartbeat(client);

    // 6. 发送连接就绪事件（等待客户端调用 ticket:create 或 ticket:resume）
    client.emit('connection:ready', {
      gameid,
      areaid,
      uid,
      playerName,
    });

    this.logger.log(`玩家wsToken认证成功: gameid=${gameid}, uid=${uid}`);
  }

  async handleDisconnect(client: Socket) {
    const clientInfo = this.connectedClients.get(client.id);

    // 记录 WebSocket 断开连接指标
    if (clientInfo?.clientType) {
      wsConnectionsGauge.dec({ client_type: clientInfo.clientType });
    }

    // 清除心跳检测和限流状态
    this.heartbeatService.clearHeartbeat(client.id);
    this.rateLimitService.clearClient(client.id);

    // 从 Redis 删除客户端信息
    await this.stateService.deleteClient(client.id);

    if (clientInfo?.userId) {
      const user = await this.prisma.user
        .findUnique({
          where: { id: clientInfo.userId },
          select: { role: true },
        })
        .catch(() => null);

      await this.prisma.user
        .update({
          where: { id: clientInfo.userId },
          data: { isOnline: false },
        })
        .catch(() => {});

      if (user?.role === 'AGENT') {
        await this.stateService.deleteAgentOnline(clientInfo.userId);

        this.notifyAgentStatusChange(clientInfo.userId, false, {
          username: clientInfo.username,
          realName: clientInfo.realName,
        });
      }
    } else {
      // 玩家端断开连接
      const sessionId = this.playerSessions.get(client.id);
      if (sessionId) {
        this.logger.log(
          `玩家断开连接，会话 ${sessionId} 保持在队列中，等待客服处理`,
        );
        this.playerSessions.delete(client.id);
        await this.stateService.deletePlayerSession(client.id);
      }
    }

    this.connectedClients.delete(client.id);
    this.logger.log(`客户端断开: ${client.id}`);
  }

  // ==================== 玩家端消息处理 ====================

  @SubscribeMessage('send-message')
  async handlePlayerMessage(
    @MessageBody() data: { sessionId: string; content: string },
    @ConnectedSocket() client: Socket,
  ) {
    try {
      const clientInfo = this.connectedClients.get(client.id);
      if (clientInfo && !clientInfo.clientType) {
        clientInfo.clientType = 'player';
        wsConnectionsGauge.inc({ client_type: 'player' });
      }

      if (!this.rateLimitService.allowMessage(client.id, 'player')) {
        this.rateLimitService.handleRateLimit(
          client,
          'send-message',
          'player',
          clientInfo,
        );
        return { success: false, error: 'rate_limited' };
      }

      wsMessagesCounter.inc({ direction: 'in' });

      const message = await this.messageService.create(
        {
          sessionId: data.sessionId,
          content: data.content,
        },
        'PLAYER',
      );

      this.notifyMessage(data.sessionId, message);

      return { success: true, messageId: message.id };
    } catch (error: unknown) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;
      this.logger.error(
        `发送消息失败: ${errorMsg}`,
        errorStack,
        {
          sessionId: data.sessionId,
          content: data.content?.substring(0, 50),
        },
      );
      return { success: false, error: errorMsg };
    }
  }

  // ==================== 玩家端新协议事件 ====================

  /**
   * 创建新工单
   * 玩家选择问题类型后调用，创建新工单并绑定到当前 Socket
   */
  @SubscribeMessage('ticket:create')
  async handleTicketCreate(
    @MessageBody()
    data: {
      issueType: string;
      confirmClose?: boolean; // 是否确认关闭旧工单
    },
    @ConnectedSocket() client: Socket,
  ) {
    this.logger.log(`[ticket:create] 收到请求: clientId=${client.id}, data=${JSON.stringify(data)}`);

    try {
      const clientInfo = this.connectedClients.get(client.id);
      this.logger.log(`[ticket:create] clientInfo: ${JSON.stringify(clientInfo)}`);

      if (!clientInfo || clientInfo.clientType !== 'player') {
        this.logger.warn(`[ticket:create] 无效客户端: clientInfo=${JSON.stringify(clientInfo)}`);
        client.emit('error', {
          code: WsErrorCode.INVALID_TOKEN,
          message: '无效的客户端连接',
        });
        return { success: false, error: WsErrorCode.INVALID_TOKEN };
      }

      const { gameid, areaid, uid, playerName } = clientInfo;
      if (!gameid || !areaid || !uid) {
        return { success: false, error: WsErrorCode.INVALID_TOKEN };
      }

      // 1. 验证问题类型
      if (!data.issueType) {
        client.emit('error', {
          code: WsErrorCode.ISSUE_TYPE_REQUIRED,
          message: WsErrorMessages[WsErrorCode.ISSUE_TYPE_REQUIRED],
        });
        return { success: false, error: WsErrorCode.ISSUE_TYPE_REQUIRED };
      }

      const issueTypeRecord = await this.prisma.issueType.findFirst({
        where: { id: data.issueType, enabled: true, deletedAt: null },
      });
      if (!issueTypeRecord) {
        client.emit('error', {
          code: WsErrorCode.ISSUE_TYPE_NOT_FOUND,
          message: WsErrorMessages[WsErrorCode.ISSUE_TYPE_NOT_FOUND],
        });
        return { success: false, error: WsErrorCode.ISSUE_TYPE_NOT_FOUND };
      }

      // 2. 查找游戏配置 (gameid 是游戏代码，如 "10003")
      const game = await this.prisma.game.findFirst({
        where: { gameCode: gameid, deletedAt: null },
      });
      if (!game) {
        this.logger.warn(`[ticket:create] 游戏不存在: gameid=${gameid}`);
        client.emit('error', {
          code: 'GAME_NOT_FOUND',
          message: '游戏配置不存在',
        });
        return { success: false, error: 'GAME_NOT_FOUND' };
      }

      // 3. 检查是否有未关闭工单
      this.logger.log(
        `[ticket:create] 查询活跃工单: gameId=${game.id}, uid=${uid}, gameid=${gameid}`,
      );

      const existingTicket = await this.prisma.ticket.findFirst({
        where: {
          gameId: game.id,
          playerUid: uid,
          status: { in: [TicketStatus.IN_PROGRESS, TicketStatus.WAITING] },
          deletedAt: null,
        },
      });

      this.logger.log(
        `[ticket:create] 查询结果: ${existingTicket ? `找到工单 ${existingTicket.ticketNo}` : '未找到活跃工单'}`,
      );

      if (existingTicket && !data.confirmClose) {
        client.emit('error', {
          code: WsErrorCode.CONFIRM_CLOSE_REQUIRED,
          message: WsErrorMessages[WsErrorCode.CONFIRM_CLOSE_REQUIRED],
          data: {
            existingTicketNo: existingTicket.ticketNo,
            existingDescription: existingTicket.description,
          },
        });
        return { success: false, error: WsErrorCode.CONFIRM_CLOSE_REQUIRED };
      }

      // 4. 关闭旧工单（如果有且确认关闭）
      if (existingTicket && data.confirmClose) {
        await this.prisma.ticket.update({
          where: { id: existingTicket.id },
          data: {
            status: TicketStatus.RESOLVED,
            closedAt: new Date(),
            closeReason: 'AUTO_CLOSED_BY_NEW_TICKET',
            closedBy: 'SYSTEM',
          },
        });
      }

      // 5. 创建新工单
      const ticketNo = await this.generateTicketNo();
      const token = this.generateToken();

      const newTicket = await this.prisma.ticket.create({
        data: {
          ticketNo,
          gameId: game.id,
          playerIdOrName: playerName || uid,
          description: '', // 第一条消息会自动设置为描述
          token,
          playerUid: uid,
          playerAreaId: areaid,
          status: issueTypeRecord.routeMode === 'HUMAN' ? TicketStatus.WAITING : TicketStatus.IN_PROGRESS,
          ticketIssueTypes: {
            create: {
              issueTypeId: data.issueType,
            },
          },
        },
      });

      // 6. 更新客户端信息
      clientInfo.tid = ticketNo;
      await this.stateService.saveClient(client.id, clientInfo);

      // 7. 加入工单房间
      client.join(`ticket:${newTicket.id}`);

      // 8. 发送工单创建成功事件
      client.emit('ticket:created', {
        tid: ticketNo,
        status: newTicket.status,
      });

      this.logger.log(`工单创建成功: tid=${ticketNo}, issueType=${data.issueType}`);

      return { success: true, tid: ticketNo, status: newTicket.status };
    } catch (error: unknown) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.logger.error(`创建工单失败: ${errorMsg}`);
      return { success: false, error: errorMsg };
    }
  }

  /**
   * 恢复旧工单
   * 玩家选择继续咨询旧工单时调用
   */
  @SubscribeMessage('ticket:resume')
  async handleTicketResume(
    @MessageBody()
    data: {
      tid: string;
    },
    @ConnectedSocket() client: Socket,
  ) {
    try {
      const clientInfo = this.connectedClients.get(client.id);
      if (!clientInfo || clientInfo.clientType !== 'player') {
        return { success: false, error: WsErrorCode.INVALID_TOKEN };
      }

      const { gameid, areaid, uid } = clientInfo;
      if (!gameid || !areaid || !uid) {
        return { success: false, error: WsErrorCode.INVALID_TOKEN };
      }

      // 1. 查找游戏配置 (gameid 是游戏代码，如 "10003")
      const game = await this.prisma.game.findFirst({
        where: { gameCode: gameid, deletedAt: null },
      });
      if (!game) {
        this.logger.warn(`[ticket:resume] 游戏不存在: gameid=${gameid}`);
        return { success: false, error: 'GAME_NOT_FOUND' };
      }

      // 2. 查询工单
      const ticket = await this.prisma.ticket.findFirst({
        where: { ticketNo: data.tid, deletedAt: null },
        include: {
          sessions: {
            where: { status: { in: ['PENDING', 'QUEUED', 'IN_PROGRESS'] } },
            take: 1,
          },
        },
      });

      if (!ticket) {
        client.emit('error', {
          code: WsErrorCode.TICKET_NOT_FOUND,
          message: WsErrorMessages[WsErrorCode.TICKET_NOT_FOUND],
        });
        return { success: false, error: WsErrorCode.TICKET_NOT_FOUND };
      }

      // 3. 验证工单归属
      if (ticket.gameId !== game.id || ticket.playerUid !== uid) {
        client.emit('error', {
          code: WsErrorCode.TICKET_NOT_YOURS,
          message: WsErrorMessages[WsErrorCode.TICKET_NOT_YOURS],
        });
        return { success: false, error: WsErrorCode.TICKET_NOT_YOURS };
      }

      // 4. 检查工单状态（RESOLVED 允许只读访问）
      const isReadOnly = ticket.status === TicketStatus.RESOLVED;

      // 5. 更新客户端信息
      clientInfo.tid = data.tid;
      await this.stateService.saveClient(client.id, clientInfo);

      // 6. 加入工单房间
      client.join(`ticket:${ticket.id}`);

      // 7. 如果有活跃会话，加入会话房间；否则创建新会话（确保转人工可以正常工作）
      let sessionId: string;
      if (ticket.sessions.length > 0) {
        const session = ticket.sessions[0];
        sessionId = session.id;
        this.logger.log(`玩家加入已有会话房间: sessionId=${session.id}`);
      } else if (!isReadOnly) {
        // 创建新会话（只读工单不创建）
        const newSession = await this.sessionService.create({
          ticketId: ticket.id,
        });
        sessionId = newSession.id;
        this.logger.log(`恢复工单时创建新会话: sessionId=${sessionId}`);
      } else {
        this.logger.log(`只读工单，不创建新会话`);
        sessionId = '';
      }

      if (sessionId) {
        client.join(`session:${sessionId}`);
        this.playerSessions.set(client.id, sessionId);
        await this.stateService.savePlayerSession(client.id, sessionId);
        clientInfo.sessionId = sessionId;
      }

      // 8. 获取历史消息
      const history = await this.getTicketHistoryMessages(ticket.id);

      // 9. 更新玩家最后活跃时间（非只读时）
      if (!isReadOnly) {
        await this.prisma.ticket.update({
          where: { id: ticket.id },
          data: { playerLastSeenAt: new Date() },
        });
      }

      // 10. 发送连接就绪事件
      client.emit('connection:ready', {
        tid: data.tid,
        status: ticket.status,
        isReadOnly,
        history,
      });

      this.logger.log(`工单恢复成功: tid=${data.tid}, isReadOnly=${isReadOnly}`);

      return { success: true, tid: data.tid, status: ticket.status, isReadOnly };
    } catch (error: unknown) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.logger.error(`恢复工单失败: ${errorMsg}`);
      return { success: false, error: errorMsg };
    }
  }

  /**
   * 发送消息（新协议）
   * 支持 clientMsgId 用于幂等性和 ack
   */
  @SubscribeMessage('message:send')
  async handleMessageSend(
    @MessageBody()
    data: {
      content: string;
      clientMsgId: string;
      type?: 'TEXT' | 'IMAGE';
    },
    @ConnectedSocket() client: Socket,
  ) {
    try {
      const clientInfo = this.connectedClients.get(client.id);
      if (!clientInfo || clientInfo.clientType !== 'player') {
        return { success: false, error: WsErrorCode.INVALID_TOKEN };
      }

      // 检查是否已绑定工单
      if (!clientInfo.tid) {
        client.emit('error', {
          code: WsErrorCode.NO_TICKET_BOUND,
          message: WsErrorMessages[WsErrorCode.NO_TICKET_BOUND],
        });
        return { success: false, error: WsErrorCode.NO_TICKET_BOUND };
      }

      // 检查工单是否只读
      const ticket = await this.prisma.ticket.findFirst({
        where: { ticketNo: clientInfo.tid, deletedAt: null },
        include: {
          sessions: {
            where: { status: { in: ['PENDING', 'QUEUED', 'IN_PROGRESS'] } },
            take: 1,
          },
        },
      });

      if (!ticket) {
        return { success: false, error: WsErrorCode.TICKET_NOT_FOUND };
      }

      if (ticket.status === TicketStatus.RESOLVED) {
        client.emit('error', {
          code: WsErrorCode.READ_ONLY_TICKET,
          message: WsErrorMessages[WsErrorCode.READ_ONLY_TICKET],
        });
        return { success: false, error: WsErrorCode.READ_ONLY_TICKET };
      }

      // 限流检查
      if (!this.rateLimitService.allowMessage(client.id, 'player')) {
        this.rateLimitService.handleRateLimit(client, 'message:send', 'player', clientInfo);
        return { success: false, error: 'rate_limited' };
      }

      wsMessagesCounter.inc({ direction: 'in' });

      // 获取或创建会话
      let sessionId: string;
      if (clientInfo.sessionId) {
        sessionId = clientInfo.sessionId;
      } else if (ticket.sessions.length > 0) {
        sessionId = ticket.sessions[0].id;
        clientInfo.sessionId = sessionId;
        client.join(`session:${sessionId}`);
        this.playerSessions.set(client.id, sessionId);
      } else {
        // 创建新会话
        const session = await this.sessionService.create({
          ticketId: ticket.id,
        });
        sessionId = session.id;
        clientInfo.sessionId = sessionId;
        client.join(`session:${sessionId}`);
        this.playerSessions.set(client.id, sessionId);
      }

      // 创建消息
      const message = await this.messageService.create(
        {
          sessionId,
          content: data.content,
          messageType: (data.type || 'TEXT') as any,
          clientMsgId: data.clientMsgId,
        },
        'PLAYER',
      );

      // 如果是第一条消息，设置为工单描述
      if (!ticket.description || ticket.description === '') {
        await this.prisma.ticket.update({
          where: { id: ticket.id },
          data: { description: data.content.substring(0, 200) },
        });
      }

      // 通知消息
      this.notifyMessage(sessionId, message);

      // 发送 ack
      client.emit('message:ack', {
        clientMsgId: data.clientMsgId,
        id: message.id,
        status: 'delivered',
        timestamp: message.createdAt.toISOString(),
      });

      // 触发 AI 回复（异步，不阻塞）
      this.logger.log(`触发AI回复: sessionId=${sessionId}, content长度=${data.content.length}`);
      this.sessionAIService.processAiReply(sessionId, data.content).catch((error) => {
        this.logger.error(`AI reply failed for session ${sessionId}: ${error.message}`);
      });

      return { success: true, messageId: message.id };
    } catch (error: unknown) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.logger.error(`发送消息失败: ${errorMsg}`);
      return { success: false, error: errorMsg };
    }
  }

  /**
   * 请求转人工
   */
  @SubscribeMessage('transfer:request')
  async handleTransferRequest(
    @MessageBody() data: { reason?: string },
    @ConnectedSocket() client: Socket,
  ) {
    try {
      const clientInfo = this.connectedClients.get(client.id);
      if (!clientInfo || clientInfo.clientType !== 'player') {
        return { success: false, error: WsErrorCode.INVALID_TOKEN };
      }

      if (!clientInfo.tid) {
        client.emit('error', {
          code: WsErrorCode.NO_TICKET_BOUND,
          message: WsErrorMessages[WsErrorCode.NO_TICKET_BOUND],
        });
        return { success: false, error: WsErrorCode.NO_TICKET_BOUND };
      }

      // 获取活跃会话
      const sessionId = clientInfo.sessionId;
      if (!sessionId) {
        return { success: false, error: 'NO_ACTIVE_SESSION' };
      }

      // 调用转人工服务
      const result = await this.sessionService.transferToAgent(sessionId, {
        urgency: 'URGENT',
        reason: data.reason || 'PLAYER_REQUEST',
      });

      // 发送转人工结果
      client.emit('transfer:result', {
        success: true,
        queuePosition: result.queuePosition,
        waitTime: result.estimatedWaitTime,
        message: result.message,
        ticketNo: 'ticketNo' in result ? result.ticketNo : undefined,
        convertedToTicket: result.convertedToTicket,
      });

      this.logger.log(`玩家请求转人工: sessionId=${sessionId}, convertedToTicket=${result.convertedToTicket}`);

      return {
        success: true,
        queuePosition: result.queuePosition,
        waitTime: result.estimatedWaitTime,
        convertedToTicket: result.convertedToTicket,
      };
    } catch (error: unknown) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      client.emit('transfer:result', { success: false, error: errorMsg });
      return { success: false, error: errorMsg };
    }
  }

  /**
   * 关闭工单
   */
  @SubscribeMessage('ticket:close')
  async handleTicketClose(
    @MessageBody() data: { reason?: string },
    @ConnectedSocket() client: Socket,
  ) {
    try {
      const clientInfo = this.connectedClients.get(client.id);
      if (!clientInfo || clientInfo.clientType !== 'player') {
        return { success: false, error: WsErrorCode.INVALID_TOKEN };
      }

      if (!clientInfo.tid) {
        client.emit('error', {
          code: WsErrorCode.NO_TICKET_BOUND,
          message: WsErrorMessages[WsErrorCode.NO_TICKET_BOUND],
        });
        return { success: false, error: WsErrorCode.NO_TICKET_BOUND };
      }

      // 查找工单
      const ticket = await this.prisma.ticket.findFirst({
        where: { ticketNo: clientInfo.tid, deletedAt: null },
      });

      if (!ticket) {
        return { success: false, error: WsErrorCode.TICKET_NOT_FOUND };
      }

      if (ticket.status === TicketStatus.RESOLVED) {
        return { success: false, error: WsErrorCode.TICKET_CLOSED };
      }

      // 关闭所有活跃会话
      const activeSessions = await this.prisma.session.findMany({
        where: {
          ticketId: ticket.id,
          status: { in: ['PENDING', 'QUEUED', 'IN_PROGRESS'] },
        },
        select: { id: true },
      });

      for (const session of activeSessions) {
        await this.sessionService.closeByPlayer(session.id);
      }

      // 更新工单状态
      const closeReason = data.reason === 'RESOLVED' ? 'RESOLVED' : 'MANUAL_PLAYER';
      await this.ticketService.updateStatus(ticket.id, 'RESOLVED', {
        closureMethod: 'manual',
        closedBy: 'PLAYER',
      });

      await this.prisma.ticket.update({
        where: { id: ticket.id },
        data: {
          closeReason,
          closedBy: 'PLAYER',
          closedAt: new Date(),
        },
      });

      // 发送工单状态更新
      client.emit('ticket:update', {
        tid: clientInfo.tid,
        status: 'RESOLVED',
        closeReason,
        closedBy: 'PLAYER',
      });

      this.notifyTicketUpdate(ticket.id, { status: 'RESOLVED', closeReason, closedBy: 'PLAYER' });

      this.logger.log(`工单关闭: tid=${clientInfo.tid}, reason=${closeReason}`);

      return { success: true };
    } catch (error: unknown) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      return { success: false, error: errorMsg };
    }
  }

  /**
   * 加载更多历史消息（新协议）
   */
  @SubscribeMessage('history:load')
  async handleHistoryLoad(
    @MessageBody()
    data: {
      beforeId?: string; // 游标
      limit?: number;
    },
    @ConnectedSocket() client: Socket,
  ) {
    try {
      const clientInfo = this.connectedClients.get(client.id);
      if (!clientInfo || clientInfo.clientType !== 'player') {
        return { success: false, error: WsErrorCode.INVALID_TOKEN };
      }

      if (!clientInfo.tid) {
        return { success: false, error: WsErrorCode.NO_TICKET_BOUND };
      }

      // 查找工单
      const ticket = await this.prisma.ticket.findFirst({
        where: { ticketNo: clientInfo.tid, deletedAt: null },
      });

      if (!ticket) {
        return { success: false, error: WsErrorCode.TICKET_NOT_FOUND };
      }

      const limit = Math.min(data.limit || 20, 50);

      // 获取历史消息
      const messages = await this.prisma.message.findMany({
        where: {
          session: { ticketId: ticket.id },
          ...(data.beforeId
            ? { createdAt: { lt: await this.getMessageCreatedAt(data.beforeId) } }
            : {}),
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        include: {
          agent: {
            select: { id: true, username: true, realName: true },
          },
        },
      });

      const sortedMessages = messages.reverse();
      const hasMore = messages.length === limit;

      // 发送历史消息
      client.emit('history:loaded', {
        messages: sortedMessages,
        hasMore,
      });

      return {
        success: true,
        messages: sortedMessages,
        hasMore,
      };
    } catch (error: unknown) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      return { success: false, error: errorMsg };
    }
  }

  /**
   * 输入状态更新（新协议）
   */
  @SubscribeMessage('typing:update')
  async handleTypingUpdate(
    @MessageBody() data: { isTyping: boolean },
    @ConnectedSocket() client: Socket,
  ) {
    try {
      const clientInfo = this.connectedClients.get(client.id);
      if (!clientInfo) {
        return { success: false };
      }

      const sessionId = clientInfo.sessionId || this.playerSessions.get(client.id);
      if (!sessionId) {
        return { success: false };
      }

      const isAgent = !!clientInfo.userId;
      const senderType = isAgent ? 'AGENT' : 'PLAYER';

      // 广播输入状态
      this.server.to(`session:${sessionId}`).emit('typing:status', {
        sessionId,
        senderType,
        isTyping: data.isTyping,
      });

      return { success: true };
    } catch {
      return { success: false };
    }
  }

  /**
   * 生成工单号
   */
  private async generateTicketNo(): Promise<string> {
    const date = new Date();
    const dateStr = date.toISOString().slice(0, 10).replace(/-/g, '');
    const random = Math.floor(Math.random() * 100000000).toString().padStart(8, '0');
    return `T-${dateStr}-${random}`;
  }

  /**
   * 生成访问Token
   */
  private generateToken(): string {
    const crypto = require('crypto');
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * 获取工单历史消息（用于 ticket:resume）
   */
  private async getTicketHistoryMessages(ticketId: string, limit = 50) {
    const sessions = await this.prisma.session.findMany({
      where: { ticketId },
      include: {
        messages: {
          orderBy: { createdAt: 'desc' },
          take: limit + 1,
        },
      },
    });

    const allMessages: any[] = [];
    for (const session of sessions) {
      for (const msg of session.messages) {
        allMessages.push({
          id: msg.id,
          content: msg.content,
          senderType: msg.senderType,
          messageType: msg.messageType,
          createdAt: msg.createdAt.toISOString(),
        });
      }
    }

    allMessages.sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );

    const hasMore = allMessages.length > limit;
    const messages = hasMore ? allMessages.slice(-limit) : allMessages;

    return { messages, hasMore };
  }

  // ==================== 客服端消息处理 ====================

  @SubscribeMessage('agent:send-message')
  async handleAgentMessage(
    @MessageBody()
    data: { sessionId: string; content: string; messageType?: string },
    @ConnectedSocket() client: Socket,
  ) {
    try {
      const clientInfo = this.connectedClients.get(client.id);
      if (clientInfo && !clientInfo.clientType) {
        clientInfo.clientType = 'agent';
        wsConnectionsGauge.inc({ client_type: 'agent' });
      }

      if (!this.rateLimitService.allowMessage(client.id, 'agent')) {
        this.rateLimitService.handleRateLimit(
          client,
          'agent:send-message',
          'agent',
          clientInfo,
        );
        return { success: false, error: 'rate_limited' };
      }

      if (!clientInfo?.userId) {
        return { success: false, error: '未认证' };
      }

      wsMessagesCounter.inc({ direction: 'in' });

      const session = await this.prisma.session.findUnique({
        where: { id: data.sessionId },
        include: { ticket: true },
      });

      if (!session) {
        return { success: false, error: '会话不存在' };
      }

      const user = await this.prisma.user.findUnique({
        where: { id: clientInfo.userId },
        select: { role: true },
      });

      if (user?.role === 'AGENT') {
        if (session.agentId !== clientInfo.userId) {
          return {
            success: false,
            error: '无权发送消息：该会话已分配给其他客服',
          };
        }
        if (session.status !== 'IN_PROGRESS') {
          return {
            success: false,
            error: '会话未接入，请先接入会话后才能发送消息',
          };
        }
      }

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

      this.notifyMessage(data.sessionId, message);

      // 如果会话关联了工单，同时创建工单消息
      if (session.ticketId && session.ticket) {
        try {
          const ticketMessage = await this.prisma.ticketMessage.create({
            data: {
              ticketId: session.ticketId,
              senderId: clientInfo.userId,
              content: data.content,
            },
            include: {
              sender: {
                select: { id: true, username: true, realName: true },
              },
            },
          });

          this.notifyTicketMessage(session.ticketId, ticketMessage);

          await this.prisma.ticket.update({
            where: { id: session.ticketId },
            data: { status: 'IN_PROGRESS' },
          });

          this.notifyTicketUpdate(session.ticketId, { status: 'IN_PROGRESS' });
        } catch (ticketError: unknown) {
          const errorMsg = ticketError instanceof Error ? ticketError.message : String(ticketError);
          this.logger.warn(`创建工单消息失败: ${errorMsg}`);
        }
      }

      return { success: true, messageId: message.id };
    } catch (error: unknown) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;
      this.logger.error(
        `客服发送消息失败: ${errorMsg}`,
        errorStack,
        {
          sessionId: data.sessionId,
          content: data.content?.substring(0, 50),
        },
      );
      return { success: false, error: errorMsg };
    }
  }

  // ==================== 会话/房间管理 ====================

  @SubscribeMessage('join-session')
  async handleJoinSession(
    @MessageBody() data: { sessionId: string; isReconnect?: boolean },
    @ConnectedSocket() client: Socket,
  ) {
    client.join(`session:${data.sessionId}`);

    const clientInfo = this.connectedClients.get(client.id);
    if (!clientInfo?.userId) {
      // 玩家端加入会话
      const previousSessionId = this.playerSessions.get(client.id);
      const isReconnect = data.isReconnect || previousSessionId === data.sessionId;

      this.playerSessions.set(client.id, data.sessionId);
      await this.stateService.savePlayerSession(client.id, data.sessionId);

      // 更新心跳服务的 sessionId
      this.heartbeatService.updateSessionId(client.id, data.sessionId);

      const existingInfo = this.connectedClients.get(client.id);
      if (existingInfo) {
        existingInfo.sessionId = data.sessionId;
        await this.stateService.saveClient(client.id, existingInfo);
      }

      // 如果是重连，通知客服玩家已重新连接
      if (isReconnect) {
        this.heartbeatService.notifyAgentPlayerReconnected(
          data.sessionId,
          client.id,
        );
        this.logger.log(`玩家重新连接会话: ${data.sessionId}`);
      } else {
        this.logger.log(`玩家加入会话: ${data.sessionId}`);
      }
    } else {
      // 客服/管理员加入会话
      this.logger.log(`客服加入会话: ${data.sessionId}`);
    }

    return { success: true };
  }

  @SubscribeMessage('leave-session')
  async handleLeaveSession(
    @MessageBody() data: { sessionId: string },
    @ConnectedSocket() client: Socket,
  ) {
    client.leave(`session:${data.sessionId}`);
    this.logger.log(`客户端离开会话: ${data.sessionId}`);
    return { success: true };
  }

  @SubscribeMessage('join-ticket')
  async handleJoinTicket(
    @MessageBody() data: { ticketId: string },
    @ConnectedSocket() client: Socket,
  ) {
    client.join(`ticket:${data.ticketId}`);
    this.logger.log(`客户端加入工单: ${data.ticketId}`);
    return { success: true };
  }

  @SubscribeMessage('leave-ticket')
  async handleLeaveTicket(
    @MessageBody() data: { ticketId: string },
    @ConnectedSocket() client: Socket,
  ) {
    client.leave(`ticket:${data.ticketId}`);
    this.logger.log(`客户端离开工单: ${data.ticketId}`);
    return { success: true };
  }

  @SubscribeMessage('ping')
  handlePing(@ConnectedSocket() client: Socket) {
    return this.heartbeatService.handlePing(client);
  }

  // ==================== 玩家API扩展事件 ====================

  /**
   * 加载更多历史消息
   * 支持分页加载消息，用于玩家端查看历史记录
   */
  @SubscribeMessage('load-more-history')
  async handleLoadMoreHistory(
    @MessageBody()
    data: {
      sessionId?: string;
      ticketId?: string;
      cursor?: string; // 消息ID，用于游标分页
      limit?: number;
    },
    @ConnectedSocket() client: Socket,
  ) {
    try {
      const clientInfo = this.connectedClients.get(client.id);
      if (!clientInfo) {
        return { success: false, error: 'NOT_CONNECTED' };
      }

      const limit = Math.min(data.limit || 20, 50); // 最多50条

      // 如果提供了 ticketId，获取该工单的所有会话消息
      if (data.ticketId) {
        const messages = await this.prisma.message.findMany({
          where: {
            session: {
              ticketId: data.ticketId,
            },
            ...(data.cursor
              ? {
                  createdAt: {
                    lt: await this.getMessageCreatedAt(data.cursor),
                  },
                }
              : {}),
          },
          orderBy: { createdAt: 'desc' },
          take: limit,
          include: {
            agent: {
              select: {
                id: true,
                username: true,
                realName: true,
              },
            },
          },
        });

        // 反转以按时间正序返回
        const sortedMessages = messages.reverse();

        return {
          success: true,
          messages: sortedMessages,
          hasMore: messages.length === limit,
          nextCursor: messages.length > 0 ? messages[0].id : null,
        };
      }

      // 如果提供了 sessionId，获取该会话的消息
      if (data.sessionId) {
        const messages = await this.prisma.message.findMany({
          where: {
            sessionId: data.sessionId,
            ...(data.cursor
              ? {
                  createdAt: {
                    lt: await this.getMessageCreatedAt(data.cursor),
                  },
                }
              : {}),
          },
          orderBy: { createdAt: 'desc' },
          take: limit,
          include: {
            agent: {
              select: {
                id: true,
                username: true,
                realName: true,
              },
            },
          },
        });

        const sortedMessages = messages.reverse();

        return {
          success: true,
          messages: sortedMessages,
          hasMore: messages.length === limit,
          nextCursor: messages.length > 0 ? messages[0].id : null,
        };
      }

      return { success: false, error: 'MISSING_PARAMS' };
    } catch (error: unknown) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.logger.error(`加载历史消息失败: ${errorMsg}`);
      return { success: false, error: errorMsg };
    }
  }

  /**
   * 获取消息创建时间（用于游标分页）
   */
  private async getMessageCreatedAt(messageId: string): Promise<Date> {
    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
      select: { createdAt: true },
    });
    return message?.createdAt || new Date();
  }

  /**
   * 玩家请求转人工
   * 用于玩家主动请求转接人工客服
   */
  @SubscribeMessage('transfer-to-human')
  async handleTransferToHuman(
    @MessageBody()
    data: {
      sessionId?: string;
      reason?: string;
    },
    @ConnectedSocket() client: Socket,
  ) {
    try {
      const clientInfo = this.connectedClients.get(client.id);
      if (!clientInfo) {
        return { success: false, error: 'NOT_CONNECTED' };
      }

      // 获取sessionId：优先使用传入的，否则使用客户端关联的
      let sessionId = data.sessionId;
      if (!sessionId && clientInfo.tid) {
        // 通过工单号查找活跃会话
        const ticket = await this.prisma.ticket.findFirst({
          where: { ticketNo: clientInfo.tid, deletedAt: null },
          include: {
            sessions: {
              where: { status: { in: ['PENDING', 'QUEUED', 'IN_PROGRESS'] } },
              take: 1,
            },
          },
        });
        sessionId = ticket?.sessions[0]?.id;
      }

      if (!sessionId) {
        return { success: false, error: 'NO_ACTIVE_SESSION' };
      }

      // 调用转人工服务
      const result = await this.sessionService.transferToAgent(sessionId, {
        urgency: 'URGENT',
        reason: data.reason || 'PLAYER_REQUEST',
      });

      this.logger.log(`玩家请求转人工: sessionId=${sessionId}, reason=${data.reason}`);

      return {
        success: true,
        queuePosition: result.queuePosition,
        estimatedWaitTime: result.estimatedWaitTime,
      };
    } catch (error: unknown) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.logger.error(`转人工失败: ${errorMsg}`);
      return { success: false, error: errorMsg };
    }
  }

  /**
   * 玩家关闭工单
   * 用于玩家主动关闭工单
   */
  @SubscribeMessage('close-ticket')
  async handleCloseTicket(
    @MessageBody()
    data: {
      ticketId?: string;
      reason?: string; // RESOLVED / OTHER
    },
    @ConnectedSocket() client: Socket,
  ) {
    try {
      const clientInfo = this.connectedClients.get(client.id);
      if (!clientInfo) {
        return { success: false, error: 'NOT_CONNECTED' };
      }

      // 获取ticketId
      let ticketId = data.ticketId;
      if (!ticketId && clientInfo.tid) {
        const ticket = await this.prisma.ticket.findFirst({
          where: { ticketNo: clientInfo.tid, deletedAt: null },
          select: { id: true },
        });
        ticketId = ticket?.id;
      }

      if (!ticketId) {
        return { success: false, error: 'NO_TICKET' };
      }

      // 关闭所有活跃会话
      const activeSessions = await this.prisma.session.findMany({
        where: {
          ticketId,
          status: { in: ['PENDING', 'QUEUED', 'IN_PROGRESS'] },
        },
        select: { id: true },
      });

      for (const session of activeSessions) {
        await this.sessionService.closeByPlayer(session.id);
      }

      // 更新工单状态
      const closeReason = data.reason === 'RESOLVED' ? 'RESOLVED' : 'MANUAL_PLAYER';
      await this.ticketService.updateStatus(ticketId, 'RESOLVED', {
        closureMethod: 'manual',
        closedBy: 'PLAYER',
      });

      // 更新工单的关闭原因
      await this.prisma.ticket.update({
        where: { id: ticketId },
        data: {
          closeReason,
          closedBy: 'PLAYER',
          closedAt: new Date(),
        },
      });

      this.logger.log(`玩家关闭工单: ticketId=${ticketId}, reason=${closeReason}`);

      // 通知工单状态更新
      this.notifyTicketUpdate(ticketId, { status: 'RESOLVED', closeReason, closedBy: 'PLAYER' });

      return { success: true };
    } catch (error: unknown) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.logger.error(`关闭工单失败: ${errorMsg}`);
      return { success: false, error: errorMsg };
    }
  }

  /**
   * 正在输入状态
   * 用于显示"对方正在输入..."
   */
  @SubscribeMessage('typing')
  async handleTyping(
    @MessageBody()
    data: {
      sessionId?: string;
      isTyping: boolean;
    },
    @ConnectedSocket() client: Socket,
  ) {
    try {
      const clientInfo = this.connectedClients.get(client.id);
      if (!clientInfo) {
        return { success: false };
      }

      // 获取sessionId
      let sessionId = data.sessionId;
      if (!sessionId) {
        sessionId = this.playerSessions.get(client.id);
      }

      if (!sessionId) {
        return { success: false };
      }

      // 确定发送者类型
      const isAgent = !!clientInfo.userId;
      const senderType = isAgent ? 'agent' : 'player';

      // 广播输入状态到会话房间
      this.server.to(`session:${sessionId}`).emit('typing:status', {
        sessionId,
        senderType,
        senderId: isAgent ? clientInfo.userId : null,
        isTyping: data.isTyping,
      });

      return { success: true };
    } catch (error) {
      return { success: false };
    }
  }

  // ==================== 通知方法 ====================

  notifySessionUpdate(sessionId: string, data: any) {
    this.server.to(`session:${sessionId}`).emit('session-update', data);
    this.logger.debug(`通知会话更新: ${sessionId}, 状态: ${data.status}`);
  }

  notifyNewSession(session: any) {
    this.server.emit('new-session', session);
  }

  notifyQueueUpdate(
    sessionId: string,
    position: number,
    waitTime?: number | null,
  ) {
    this.server.to(`session:${sessionId}`).emit('queue-update', {
      queuePosition: position,
      position,
      waitTime,
      estimatedWaitTime: waitTime,
    });
    this.logger.debug(`通知排队更新: sessionId=${sessionId}, position=${position}, waitTime=${waitTime}`);
  }

  /**
   * 通知玩家客服已接入
   */
  notifyAgentAssigned(sessionId: string, agentName: string, agentId: string) {
    this.server.to(`session:${sessionId}`).emit('agent:assigned', {
      agentId,
      agentName,
    });
    this.logger.debug(`通知客服接入: sessionId=${sessionId}, agentName=${agentName}`);
  }

  notifyMessage(sessionId: string, message: any) {
    wsMessagesCounter.inc({ direction: 'out' });
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

  notifyTicketMessage(ticketId: string, message: any) {
    this.server.to(`ticket:${ticketId}`).emit('ticket-message', message);
  }

  notifyTicketUpdate(ticketId: string, data: any) {
    this.server.to(`ticket:${ticketId}`).emit('ticket-update', data);
    this.server.emit('ticket-status-changed', { ticketId, ...data });
  }

  /**
   * 通知特定客服有新会话分配给他
   * 通过遍历 connectedClients 找到该客服的 socket
   */
  notifyAgentNewSession(agentId: string, session: any) {
    // 遍历所有连接的客户端，找到该客服的 socket
    for (const [socketId, clientInfo] of this.connectedClients.entries()) {
      if (clientInfo.userId === agentId) {
        const socket = this.server?.sockets?.sockets?.get(socketId);
        if (socket) {
          socket.emit('new-session', session);
          this.logger.log(`通知客服 ${agentId} 有新会话分配: ${session.id}`);
        }
      }
    }
  }
}
