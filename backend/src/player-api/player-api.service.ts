import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { KeyService } from './services/key.service';
import { TokenService } from './services/token.service';
import { UploadService } from '../upload/upload.service';
import {
  PlayerConnectDto,
  PlayerConnectResponse,
  PlayerConnectData,
  QuestItem,
  ActiveTicketInfo,
  HistoryMessageItem,
  ConnectErrorCode,
  ConnectErrorMessages,
} from './dto/connect.dto';
import {
  PlayerUploadResponse,
  UploadErrorCode,
  UploadErrorMessages,
} from './dto/upload.dto';
import { TicketStatus } from '@prisma/client';

/**
 * 关闭原因枚举
 */
export enum CloseReason {
  RESOLVED = 'RESOLVED',
  MANUAL_PLAYER = 'MANUAL_PLAYER',
  MANUAL_AGENT = 'MANUAL_AGENT',
  AUTO_TIMEOUT = 'AUTO_TIMEOUT',
  AUTO_CLOSED_BY_NEW_TICKET = 'AUTO_CLOSED_BY_NEW_TICKET',
  DATA_CLEANUP = 'DATA_CLEANUP',
}

/**
 * 关闭者枚举
 */
export enum ClosedBy {
  PLAYER = 'PLAYER',
  AGENT = 'AGENT',
  SYSTEM = 'SYSTEM',
}

// 客服工作时间配置
const WORKING_HOURS = {
  // 周末不休息 (1=周一, ..., 5=周五)
  workDays: [0,1, 2, 3, 4, 5, 6],
  // 工作时间段
  periods: [
    { start: '09:30', end: '12:30' },
    { start: '14:00', end: '18:30' },
  ],
  // 显示文本
  displayText: '上午:9:30-12:30, 下午:14:00-18:30',
};

@Injectable()
export class PlayerApiService {
  private readonly logger = new Logger(PlayerApiService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly keyService: KeyService,
    private readonly tokenService: TokenService,
    private readonly uploadService: UploadService,
  ) {}

  /**
   * 检查当前是否在工作时间内
   */
  private isWithinWorkingHours(): boolean {
    const now = new Date();
    const dayOfWeek = now.getDay(); // 0=周日, 1=周一, ..., 6=周六

    // 检查是否是工作日
    if (!WORKING_HOURS.workDays.includes(dayOfWeek)) {
      return false;
    }

    // 获取当前时间 (HH:MM 格式)
    const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;

    // 检查是否在任一工作时间段内
    return WORKING_HOURS.periods.some(
      (period) => currentTime >= period.start && currentTime <= period.end,
    );
  }

  /**
   * 检查是否有在线客服
   */
  private async hasOnlineAgents(): Promise<boolean> {
    const onlineAgentCount = await this.prisma.user.count({
      where: {
        role: 'AGENT',
        isOnline: true,
        deletedAt: null,
      },
    });
    return onlineAgentCount > 0;
  }

  /**
   * 检查客服可用性
   * 返回: { available, reason }
   */
  private async checkAgentAvailability(): Promise<{
    available: boolean;
    reason?: string;
  }> {
    const isWorkingHours = this.isWithinWorkingHours();
    if (!isWorkingHours) {
      return { available: false, reason: '非工作时间' };
    }

    const hasAgents = await this.hasOnlineAgents();
    if (!hasAgents) {
      return { available: false, reason: '暂无在线客服' };
    }

    return { available: true };
  }

  /**
   * Bootstrap 总入口 (原 connect + status 合并)
   * 一次性返回所有初始化需要的信息
   *
   * 注：dto 中的 uid/areaid/gameid 由 Controller 从 SignGuard 验证后的 playerInfo 填充
   */
  async connect(
    dto: PlayerConnectDto & { uid: string; areaid: string; gameid: string },
    gameId: string,
  ): Promise<PlayerConnectResponse> {
    const { uid, areaid, gameid, playerName, language } = dto;

    try {
      // 1. 生成 wsToken 和 uploadToken
      const wsTokenData = this.tokenService.generateWsToken(gameid, areaid, uid, playerName);
      const uploadTokenData = this.tokenService.generateUploadToken(gameid, areaid, uid);

      // 2. 生成 WebSocket URL (不含认证参数)
      const wsUrl = this.keyService.generateWsUrl();

      // 3. 查询问题类型列表
      const issueTypes = await this.prisma.issueType.findMany({
        where: {
          enabled: true,
          deletedAt: null,
        },
        orderBy: { sortOrder: 'asc' },
      });

      const questList: QuestItem[] = issueTypes.map((it) => ({
        id: it.id,
        name: it.name,
        icon: it.icon || undefined,
        routeMode: it.routeMode,
      }));

      // 4. 检查客服可用性
      const agentAvailability = await this.checkAgentAvailability();

      // 5. 查询未关闭工单
      this.logger.log(
        `[Bootstrap] 开始查询活跃工单`,
      );
      this.logger.log(
        `[Bootstrap] 查询参数: gameId(数据库ID)=${gameId}, uid=${uid}, gameid(游戏标识)=${gameid}`,
      );

      const openTickets = await this.prisma.ticket.findMany({
        where: {
          gameId,
          playerUid: uid,
          status: { in: [TicketStatus.IN_PROGRESS, TicketStatus.WAITING] },
          deletedAt: null,
        },
        orderBy: { createdAt: 'desc' },
        include: {
          ticketIssueTypes: {
            include: {
              issueType: true,
            },
          },
          sessions: {
            where: {
              status: 'IN_PROGRESS',
              agentId: { not: null },
            },
            take: 1,
          },
        },
      });

      this.logger.log(
        `[Bootstrap] 查询结果: 找到 ${openTickets.length} 个活跃工单` +
        (openTickets.length > 0 ? `, 最新工单号=${openTickets[0].ticketNo}` : ''),
      );

      // 6. 处理多工单异常情况（取最新的，其他自动关闭）
      let activeTicket: ActiveTicketInfo | null = null;
      let history: HistoryMessageItem[] = [];

      if (openTickets.length > 0) {
        const lastTicket = openTickets[0];

        // 关闭其他多余工单
        if (openTickets.length > 1) {
          this.logger.warn(
            `发现多个未关闭工单: gameId=${gameId}, uid=${uid}, count=${openTickets.length}`,
          );
          const ticketIdsToClose = openTickets.slice(1).map((t) => t.id);
          await this.prisma.ticket.updateMany({
            where: { id: { in: ticketIdsToClose } },
            data: {
              status: TicketStatus.RESOLVED,
              closedAt: new Date(),
              closeReason: CloseReason.DATA_CLEANUP,
              closedBy: ClosedBy.SYSTEM,
            },
          });
        }

        // 构建 activeTicket 信息
        const issueTypeName = lastTicket.ticketIssueTypes[0]?.issueType?.name;
        const isAgentConnected = lastTicket.sessions.length > 0;

        activeTicket = {
          tid: lastTicket.ticketNo,
          status: lastTicket.status,
          description: lastTicket.description || undefined,
          createdAt: lastTicket.createdAt.toISOString(),
          issueType: issueTypeName,
          isAgentConnected,
        };

        // 获取历史消息
        const historyResult = await this.getTicketHistory(lastTicket.id);
        history = historyResult.messages;
      }

      // 7. 构建首屏消息 (如无活跃工单)
      const bootstrapMessages: HistoryMessageItem[] = activeTicket
        ? []
        : this.buildBootstrapMessages();

      // 8. 构建响应
      // 确定使用的语言：客户端传入 > 默认 zh-CN
      const confirmedLanguage = language || 'zh-CN';

      const data: PlayerConnectData = {
        wsUrl,
        wsToken: wsTokenData.token,
        uploadToken: uploadTokenData.token,
        questList,
        agentAvailable: agentAvailability.available,
        offlineReason: agentAvailability.reason,
        workingHours: WORKING_HOURS.displayText,
        activeTicket,
        history,
        bootstrapMessages,
        language: confirmedLanguage,
      };

      // 记录返回结果
      this.logger.log(
        `[Bootstrap] 返回结果: activeTicket=${activeTicket ? activeTicket.tid : 'null'}, historyCount=${history.length}`,
      );

      return {
        result: true,
        data,
      };
    } catch (error) {
      this.logger.error(`Bootstrap failed: ${error.message}`, error.stack);
      return {
        result: false,
        error: ConnectErrorMessages[ConnectErrorCode.INTERNAL_ERROR],
        errorCode: ConnectErrorCode.INTERNAL_ERROR,
      };
    }
  }

  /**
   * 构建首屏消息 (无活跃工单时显示)
   */
  private buildBootstrapMessages(): HistoryMessageItem[] {
    return [
      {
        id: 'bootstrap-welcome',
        content: '您好，欢迎使用客服系统！请选择您需要咨询的问题类型。',
        senderType: 'SYSTEM',
        messageType: 'TEXT',
        createdAt: new Date().toISOString(),
      },
    ];
  }

  /**
   * 获取工单历史消息
   */
  private async getTicketHistory(
    ticketId: string,
    limit: number = 50,
  ): Promise<{ messages: HistoryMessageItem[]; hasMore: boolean }> {
    // 从Session获取消息
    const sessions = await this.prisma.session.findMany({
      where: { ticketId },
      include: {
        messages: {
          orderBy: { createdAt: 'desc' },
          take: limit + 1,
        },
      },
    });

    const allMessages: HistoryMessageItem[] = [];
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

    // 按时间排序
    allMessages.sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );

    const hasMore = allMessages.length > limit;
    const messages = hasMore ? allMessages.slice(-limit) : allMessages;

    return { messages, hasMore };
  }

  /**
   * 生成工单号
   * 格式: T-YYYYMMDD-8位随机数
   */
  private async generateTicketNo(): Promise<string> {
    const date = new Date();
    const dateStr = date.toISOString().slice(0, 10).replace(/-/g, '');
    const random = Math.floor(Math.random() * 100000000)
      .toString()
      .padStart(8, '0');
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
   * 上传文件
   * 验证文件类型和大小后调用上传服务
   */
  async uploadFile(
    file: Express.Multer.File,
    playerInfo: { gameid: string; uid: string; areaid: string },
  ): Promise<PlayerUploadResponse> {
    try {
      // 1. 验证文件存在
      if (!file) {
        return {
          result: false,
          error: UploadErrorMessages[UploadErrorCode.NO_FILE],
          errorCode: UploadErrorCode.NO_FILE,
        };
      }

      // 2. 验证文件类型
      const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/heic', 'image/heif'];
      if (!allowedTypes.includes(file.mimetype)) {
        return {
          result: false,
          error: UploadErrorMessages[UploadErrorCode.INVALID_TYPE],
          errorCode: UploadErrorCode.INVALID_TYPE,
        };
      }

      // 3. 验证文件大小（5MB）
      const maxSize = 5 * 1024 * 1024;
      if (file.size > maxSize) {
        return {
          result: false,
          error: UploadErrorMessages[UploadErrorCode.FILE_TOO_LARGE],
          errorCode: UploadErrorCode.FILE_TOO_LARGE,
        };
      }

      // 4. 构建唯一的标识符用于存储
      const identifier = `player/${playerInfo.gameid}/${playerInfo.areaid}/${playerInfo.uid}`;

      // 5. 调用上传服务
      const result = await this.uploadService.saveFile(file, identifier);

      this.logger.log(
        `文件上传成功: gameid=${playerInfo.gameid}, uid=${playerInfo.uid}, url=${result.fileUrl}`,
      );

      return {
        result: true,
        url: result.fileUrl,
      };
    } catch (error) {
      this.logger.error(`文件上传失败: ${error.message}`, error.stack);
      return {
        result: false,
        error: UploadErrorMessages[UploadErrorCode.UPLOAD_FAILED],
        errorCode: UploadErrorCode.UPLOAD_FAILED,
      };
    }
  }
}
