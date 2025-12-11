import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  Button,
  Tag,
  Space,
  Typography,
  Input,
  Image,
  message,
  Spin,
  Upload,
  Badge,
  Empty,
} from 'antd';
import {
  MessageOutlined,
  SendOutlined,
  CloseOutlined,
  PaperClipOutlined,
  ThunderboltOutlined,
  CopyOutlined,
  RobotOutlined,
  UserAddOutlined,
  UserOutlined,
  CustomerServiceOutlined,
  CaretRightOutlined,
  TranslationOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { useSessionStore } from '../../stores/sessionStore';
import { useAgentStore } from '../../stores/agentStore';
import { useAuthStore } from '../../stores/authStore';
import type { Session, Message } from '../../types';
import './ActivePage.css';
import {
  API_BASE_URL,
  DIFY_API_KEY,
  DIFY_BASE_URL,
  DIFY_APP_MODE,
  DIFY_WORKFLOW_ID,
  AGENT_STATUS_POLL_INTERVAL,
} from '../../config/api';
import { getOnlineAgents } from '../../services/user.service';
import {
  getActiveSessions,
  getQueuedSessions,
  getSessionById,
  joinSession,
  joinSessionByTicketId,
  closeSession,
} from '../../services/session.service';
import { translateMessage, getSessionMessages } from '../../services/message.service';
import { sendTicketMessage, getTicketMessages, getTicketById } from '../../services/ticket.service';
import { uploadTicketAttachment } from '../../services/upload.service';

// 延迟导入 websocketService 避免循环依赖
const getWebSocketService = async () => {
  const { websocketService } = await import('../../services/websocket.service');
  return websocketService;
};
import QuickReplyDrawer from '../../components/QuickReplyDrawer';
import { notificationService } from '../../services/notification.service';

const { TextArea } = Input;
const { Text } = Typography;
const API_ORIGIN = API_BASE_URL.replace(/\/api\/v1\/?$/, '');
const COLLAPSE_STORAGE_KEY = 'workbench_collapsed_sections';

const resolveMediaUrl = (url?: string) => {
  if (!url) return '';
  if (/^https?:\/\//i.test(url)) {
    return url;
  }
  const normalized = url.startsWith('/') ? url : `/${url}`;
  return `${API_ORIGIN}${normalized}`;
};

// 判断是否为文件URL
const isFileUrl = (content: string) => {
  return /\/uploads\//.test(content) || /\.(pdf|doc|docx|xls|xlsx|txt|zip|rar)$/i.test(content);
};

// 获取文件名
const getFileName = (url: string) => {
  const match = url.match(/\/([^\/]+)$/);
  return match ? match[1] : '文件';
};

const SESSION_STATUS_META: Record<
  string,
  { label: string; color: string; description?: string }
> = {
  PENDING: { label: '待分配', color: 'default', description: 'AI 处理中' },
  QUEUED: { label: '排队中', color: 'orange', description: '等待客服接入' },
  IN_PROGRESS: { label: '进行中', color: 'green', description: '客服处理中' },
  CLOSED: { label: '已结束', color: 'default', description: '会话已结束' },
};

const TICKET_STATUS_META: Record<string, { label: string; color: string }> = {
  WAITING: { label: '待人工', color: 'orange' },
  IN_PROGRESS: { label: '处理中', color: 'processing' },
  RESOLVED: { label: '已解决', color: 'green' },
};

const formatDateTime = (value?: string | null) => {
  if (!value) return '-';
  return dayjs(value).format('YYYY-MM-DD HH:mm:ss');
};

const ActivePage: React.FC = () => {
  const [messageInput, setMessageInput] = useState('');
  const [sendingMessage, setSendingMessage] = useState(false);
  const [aiOptimizing, setAiOptimizing] = useState(false);
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [sessionsError, setSessionsError] = useState<string | null>(null);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [quickReplyDrawerOpen, setQuickReplyDrawerOpen] = useState(false);
  const lastManualInputRef = useRef('');
  const aiOptimizedRef = useRef(false);
  const currentSessionRef = useRef<Session | null>(null);

  // 翻译相关状态
  const [translatingMessageIds, setTranslatingMessageIds] = useState<Set<string>>(new Set());
  const [translatedMessages, setTranslatedMessages] = useState<Record<string, string>>({});
  const [showOriginal, setShowOriginal] = useState<Record<string, boolean>>({});

  // 布局调整相关状态
  const [leftPanelWidth, setLeftPanelWidth] = useState(320);
  const [rightPanelWidth, setRightPanelWidth] = useState(360);
  const isResizingLeft = useRef(false);
  const isResizingRight = useRef(false);
  const leftPanelRef = useRef<HTMLDivElement>(null);
  const rightPanelRef = useRef<HTMLDivElement>(null);
  const [collapsedSections, setCollapsedSections] = useState(() => {
    if (typeof window === 'undefined') {
      return { queued: false, active: false };
    }
    try {
      const stored = window.localStorage.getItem(COLLAPSE_STORAGE_KEY);
      return stored ? JSON.parse(stored) : { queued: false, active: false };
    } catch (error) {
      console.warn('读取面板折叠状态失败', error);
      return { queued: false, active: false };
    }
  });
  const toggleSection = (key: 'queued' | 'active') => {
    setCollapsedSections((prev: { queued: boolean; active: boolean }) => {
      const next = { ...prev, [key]: !prev[key] };
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(COLLAPSE_STORAGE_KEY, JSON.stringify(next));
      }
      return next;
    });
  };

  const {
    activeSessions,
    setActiveSessions,
    queuedSessions,
    setQueuedSessions,
    currentSession,
    setCurrentSession,
    sessionMessages,
    setSessionMessages,
    updateSession,
    unreadCounts,
    clearUnread,
  } = useSessionStore();
  const onlineAgents = useAgentStore((state) => state.onlineAgents);
  const setOnlineAgents = useAgentStore((state) => state.setOnlineAgents);
  const authUser = useAuthStore((state) => state.user);
  const ticketInfo = currentSession?.ticket;
  const attachmentList = ticketInfo?.attachments ?? [];
  const sessionStatusMeta = currentSession
    ? SESSION_STATUS_META[currentSession.status] || {
      label: currentSession.status,
      color: 'default',
    }
    : null;
  const ticketStatusMeta = ticketInfo?.status
    ? TICKET_STATUS_META[ticketInfo.status] || {
      label: ticketInfo.status,
      color: 'default',
    }
    : null;
  const fallbackIssueTypes =
    ticketInfo?.ticketIssueTypes
      ?.map((item) => item.issueType?.name)
      .filter((name): name is string => Boolean(name)) ?? [];

  // 获取问题类型：优先使用 issueTypes，如果没有则使用 ticketIssueTypes
  const ticketIssueTypes = ticketInfo?.issueTypes?.map((it) => it.name) ??
    (ticketInfo?.ticketIssueTypes?.map((item: any) => item.issueType?.name).filter(Boolean) ?? []) ??
    fallbackIssueTypes;

  useEffect(() => {
    let mounted = true;

    const fetchOnlineAgents = async () => {
      try {
        const agents = await getOnlineAgents();
        if (mounted) {
          setOnlineAgents(agents);
        }
      } catch (error) {
        console.error('加载在线客服失败', error);
      }
    };

    fetchOnlineAgents();
    const intervalId = window.setInterval(
      fetchOnlineAgents,
      AGENT_STATUS_POLL_INTERVAL,
    );

    return () => {
      mounted = false;
      window.clearInterval(intervalId);
    };
  }, [setOnlineAgents]);

  const loadSessions = useCallback(async () => {
    setLoadingSessions(true);
    setSessionsError(null);
    try {
      const [queued, active] = await Promise.all([
        getQueuedSessions(),
        getActiveSessions(),
      ]);
      setQueuedSessions(queued);
      setActiveSessions(active);
      const merged = [...active, ...queued];
      const previous = currentSessionRef.current;
      let next: Session | null = null;
      if (previous) {
        next = merged.find((item) => item.id === previous.id) || null;
      }
      if (!next) {
        next = active[0] || queued[0] || null;
      }
      setCurrentSession(next);
      currentSessionRef.current = next || null;
      if (next) {
        const { sessionMessages: cachedMessages } = useSessionStore.getState();
        // 检查是否为工单ID（格式为 ticket-xxx），如果是则跳过加载会话详情
        // 因为工单可能还没有创建会话
        if (next.id && next.id.startsWith('ticket-')) {
          console.warn('跳过加载工单详情，工单ID:', next.id);
          return;
        }
        
        // ✅ 修复：先检查缓存中是否有消息，如果有且数量大于0，则优先使用缓存
        const cachedMessagesForSession = cachedMessages[next.id];
        if (cachedMessagesForSession && cachedMessagesForSession.length > 0) {
          console.log(`[客服端] loadSessions - 使用缓存消息，会话 ${next.id}，消息数量: ${cachedMessagesForSession.length}`);
          setCurrentSession(next);
          currentSessionRef.current = next;
          // 直接使用缓存的消息，不需要重新加载
          return;
        }
        
        // 总是重新加载消息，确保获取最新的完整消息列表
        try {
          const detail = await getSessionById(next.id);
          console.log('[客服端] loadSessions - 加载会话详情:', {
            sessionId: detail.id,
            ticketId: detail.ticketId,
            messagesCount: detail.messages?.length || 0
          });
          setCurrentSession(detail);
          currentSessionRef.current = detail;
          // 确保消息按时间排序
          let sortedMessages = (detail.messages ?? []).sort(
            (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
          );
          
          // ✅ 修复：如果会话消息为空，尝试通过工单查找关联会话的消息
          if (sortedMessages.length === 0 && detail.ticketId) {
            console.warn(`[客服端] loadSessions - 会话 ${detail.id} 消息为空，尝试通过工单 ${detail.ticketId} 查找关联会话的消息`);
            try {
              const ticketData = await getTicketById(detail.ticketId);
              console.log('[客服端] loadSessions - 工单数据:', {
                ticketId: ticketData.id,
                sessionsCount: ticketData.sessions?.length || 0
              });
              if (ticketData.sessions && ticketData.sessions.length > 0) {
                const allSessionMessages: Message[] = [];
                for (const ticketSession of ticketData.sessions) {
                  if (ticketSession.id && ticketSession.messages && Array.isArray(ticketSession.messages)) {
                    const sessionMsgs = ticketSession.messages.map((msg: any) => ({
                      id: msg.id,
                      sessionId: ticketSession.id,
                      senderType: msg.senderType,
                      messageType: msg.messageType || 'TEXT',
                      content: msg.content,
                      metadata: msg.metadata || {},
                      createdAt: msg.createdAt,
                    }));
                    allSessionMessages.push(...sessionMsgs);
                  } else if (ticketSession.id) {
                    try {
                      const sessionMsgs = await getSessionMessages(ticketSession.id);
                      allSessionMessages.push(...sessionMsgs);
                    } catch (err) {
                      console.warn(`[客服端] loadSessions - 获取会话 ${ticketSession.id} 的消息失败:`, err);
                    }
                  }
                }
                if (allSessionMessages.length > 0) {
                  const uniqueMessages = allSessionMessages.filter(
                    (msg, index, self) => index === self.findIndex((m) => m.id === msg.id)
                  );
                  sortedMessages = uniqueMessages.sort(
                    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
                  );
                  console.log(`[客服端] loadSessions - 通过工单关联会话获取到 ${sortedMessages.length} 条消息`);
                }
              }
            } catch (ticketError) {
              console.error('[客服端] loadSessions - 通过工单查找会话消息失败:', ticketError);
            }
          }
          
          // ✅ 修复：只有在找到消息时才设置，避免用空消息覆盖已有的缓存消息
          if (sortedMessages.length > 0) {
            setSessionMessages(next.id, sortedMessages);
            console.log('[客服端] loadSessions - 设置消息列表，数量:', sortedMessages.length);
          } else {
            // 如果仍然没有消息，检查缓存中是否有消息，如果有则保留缓存
            const existingCachedMessages = cachedMessages[next.id];
            if (existingCachedMessages && existingCachedMessages.length > 0) {
              console.log(`[客服端] loadSessions - 后端返回空消息，但缓存中有 ${existingCachedMessages.length} 条消息，保留缓存`);
              // 不调用 setSessionMessages，保留缓存的消息
            } else {
              console.warn(`[客服端] loadSessions - 会话 ${next.id} 没有消息，且缓存也为空`);
              setSessionMessages(next.id, []); // 明确设置为空数组
            }
          }
        } catch (error) {
          console.error('加载会话详情失败', error);
          // 如果加载失败，不清空当前会话，保持显示基本信息
        }
      }
    } catch (error) {
      console.error('加载会话失败', error);
      setSessionsError('加载会话失败，请稍后重试');
      message.error('加载会话失败，请稍后重试');
    } finally {
      setLoadingSessions(false);
    }
  }, [setQueuedSessions, setActiveSessions, setCurrentSession, setSessionMessages]);

  // 拖拽调整左侧面板宽度
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isResizingLeft.current && leftPanelRef.current) {
        const newWidth = e.clientX;
        if (newWidth >= 200 && newWidth <= 600) {
          setLeftPanelWidth(newWidth);
        }
      }
      if (isResizingRight.current && rightPanelRef.current) {
        const newWidth = window.innerWidth - e.clientX;
        if (newWidth >= 200 && newWidth <= 600) {
          setRightPanelWidth(newWidth);
        }
      }
    };

    const handleMouseUp = () => {
      isResizingLeft.current = false;
      isResizingRight.current = false;
    };

    if (isResizingLeft.current || isResizingRight.current) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isResizingLeft.current, isResizingRight.current]);

  useEffect(() => {
    // 初始化通知服务
    notificationService.init();

    loadSessions();

    // 定时刷新待接入队列（每30秒）
    const refreshInterval = setInterval(() => {
      loadSessions();
    }, AGENT_STATUS_POLL_INTERVAL);

    // 监听页面可见性变化
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        // 页面可见时，可以清除所有未读数（可选，根据需求决定）
        // 或者只清除当前会话的未读数
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      clearInterval(refreshInterval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [loadSessions]);

  // 监听会话关闭事件和刷新事件，自动刷新会话列表
  useEffect(() => {
    const handleSessionClosed = (event: CustomEvent<string>) => {
      const closedSessionId = event.detail;
      console.log('会话已关闭:', closedSessionId);
      // 如果当前会话被关闭，清空当前会话
      if (currentSession?.id === closedSessionId) {
        setCurrentSession(null);
        currentSessionRef.current = null;
        setSessionMessages(closedSessionId, []);
      }
      // 刷新会话列表
      loadSessions();
    };

    const handleRefreshSessions = () => {
      loadSessions();
    };

    window.addEventListener('session-closed', handleSessionClosed as EventListener);
    window.addEventListener('refresh-sessions', handleRefreshSessions as EventListener);
    return () => {
      window.removeEventListener('session-closed', handleSessionClosed as EventListener);
      window.removeEventListener('refresh-sessions', handleRefreshSessions as EventListener);
    };
  }, [currentSession, loadSessions]);

  useEffect(() => {
    currentSessionRef.current = currentSession || null;

    // 当切换会话时，确保加载消息
    if (currentSession && currentSession.id) {
      // ✅ 修复：从 store 中获取最新的缓存消息
      const { sessionMessages: latestCachedMessages } = useSessionStore.getState();
      const cachedMessages = latestCachedMessages[currentSession.id];
      // ✅ 修复：如果缓存中有消息，直接使用，不需要重新加载
      if (cachedMessages && cachedMessages.length > 0) {
        console.log(`[客服端] 会话切换，使用缓存消息: ${currentSession.id}，消息数量: ${cachedMessages.length}`);
        // 直接返回，不重新加载，避免用空消息覆盖缓存
        return; // 直接返回，不重新加载
      }
      // 如果没有缓存的消息，或者消息数量为0，重新加载
      if (!cachedMessages || cachedMessages.length === 0) {
        console.log('[客服端] 会话切换，缓存中没有消息，重新加载消息:', currentSession.id);
        handleOpenChat(currentSession).catch((error) => {
          console.error('加载会话消息失败:', error);
        });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentSession?.id]); // 移除 handleOpenChat 依赖，避免重复调用

  const handleOpenChat = useCallback(
    async (session: Session) => {
      // ✅ 修复：先检查缓存中是否有消息，如果有且数量大于0，直接返回
      const { sessionMessages: cachedMessages } = useSessionStore.getState();
      const existingCachedMessages = cachedMessages[session.id];
      if (existingCachedMessages && existingCachedMessages.length > 0) {
        console.log(`[客服端] handleOpenChat - 使用缓存消息，会话 ${session.id}，消息数量: ${existingCachedMessages.length}`);
        // 先设置会话，即使加载失败也能显示基本信息
        setCurrentSession(session);
        currentSessionRef.current = session;
        // 直接返回，不重新加载，避免用空消息覆盖缓存
        return;
      }
      
      console.log(`[客服端] handleOpenChat - 缓存中没有消息，开始加载会话 ${session.id}`);
      
      // 先设置会话，即使加载失败也能显示基本信息
      setCurrentSession(session);
      currentSessionRef.current = session;

      // 检查是否为虚拟会话（工单）
      const isVirtual = (session as any).isVirtual || session.id.startsWith('ticket-');

      if (isVirtual) {
        // 虚拟会话（工单）：加载工单消息
        const ticketId = session.ticketId;
        if (!ticketId) {
          message.error('工单信息无效');
          return;
        }

        try {
          const ticketMessages = await getTicketMessages(ticketId);

          // 将工单消息转换为会话消息格式
          const convertedMessages: Message[] = (Array.isArray(ticketMessages) ? ticketMessages : []).map((msg: any) => ({
            id: msg.id,
            sessionId: session.id,
            senderType: (msg.senderId ? 'AGENT' : 'PLAYER') as 'AGENT' | 'PLAYER',
            messageType: 'TEXT' as const,
            content: msg.content,
            createdAt: msg.createdAt,
            agentId: msg.senderId,
          }));

          // 确保消息按时间排序
          const sortedMessages = convertedMessages.sort(
            (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
          );

          // 标记虚拟会话已加载消息，允许发送
          const updatedSession = {
            ...session,
            isVirtual: true,
            messagesLoaded: true, // 标记已加载消息
          };
          setCurrentSession(updatedSession);
          currentSessionRef.current = updatedSession;
          setSessionMessages(session.id, sortedMessages);
        } catch (error) {
          console.error('加载工单消息失败', error);
          message.error('加载工单消息失败');
        }
        return;
      }

      // 正常会话：总是重新加载消息，确保获取最新的完整消息列表
      try {
        // ✅ 修复：先检查缓存中是否有消息
        const { sessionMessages: cachedMessages } = useSessionStore.getState();
        const existingCachedMessages = cachedMessages[session.id];
        
        const detail = await getSessionById(session.id);
        console.log('[客服端] handleOpenChat - 加载会话详情:', {
          sessionId: detail.id,
          ticketId: detail.ticketId,
          messagesCount: detail.messages?.length || 0,
          cachedMessagesCount: existingCachedMessages?.length || 0
        });

        // 更新会话信息
        setCurrentSession(detail);
        currentSessionRef.current = detail;

        // 清除未读数
        clearUnread(session.id);

        // 确保消息按时间排序
        let sortedMessages = (detail.messages ?? []).sort(
          (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        );
        
        // ✅ 修复：如果会话消息为空，尝试通过工单查找关联会话的消息
        if (sortedMessages.length === 0 && detail.ticketId) {
          console.warn(`[客服端] handleOpenChat - 会话 ${detail.id} 消息为空，尝试通过工单 ${detail.ticketId} 查找关联会话的消息`);
          try {
            const ticketData = await getTicketById(detail.ticketId);
            console.log('[客服端] handleOpenChat - 工单数据:', {
              ticketId: ticketData.id,
              sessionsCount: ticketData.sessions?.length || 0
            });
            if (ticketData.sessions && ticketData.sessions.length > 0) {
              const allSessionMessages: Message[] = [];
              for (const ticketSession of ticketData.sessions) {
                if (ticketSession.id && ticketSession.messages && Array.isArray(ticketSession.messages)) {
                  const sessionMsgs = ticketSession.messages.map((msg: any) => ({
                    id: msg.id,
                    sessionId: ticketSession.id,
                    senderType: msg.senderType,
                    messageType: msg.messageType || 'TEXT',
                    content: msg.content,
                    metadata: msg.metadata || {},
                    createdAt: msg.createdAt,
                  }));
                  allSessionMessages.push(...sessionMsgs);
                } else if (ticketSession.id) {
                  try {
                    const sessionMsgs = await getSessionMessages(ticketSession.id);
                    allSessionMessages.push(...sessionMsgs);
                  } catch (err) {
                    console.warn(`[客服端] handleOpenChat - 获取会话 ${ticketSession.id} 的消息失败:`, err);
                  }
                }
              }
              if (allSessionMessages.length > 0) {
                const uniqueMessages = allSessionMessages.filter(
                  (msg, index, self) => index === self.findIndex((m) => m.id === msg.id)
                );
                sortedMessages = uniqueMessages.sort(
                  (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
                );
                console.log(`[客服端] handleOpenChat - 通过工单关联会话获取到 ${sortedMessages.length} 条消息`);
              }
            }
          } catch (ticketError) {
            console.error('[客服端] handleOpenChat - 通过工单查找会话消息失败:', ticketError);
          }
        }
        
        // ✅ 修复：只有在找到消息时才设置，避免用空消息覆盖已有的缓存消息
        if (sortedMessages.length > 0) {
          setSessionMessages(session.id, sortedMessages);
          console.log('[客服端] handleOpenChat - 设置消息列表，数量:', sortedMessages.length);
        } else {
          // 如果仍然没有消息，检查缓存中是否有消息，如果有则保留缓存
          if (existingCachedMessages && existingCachedMessages.length > 0) {
            console.log(`[客服端] handleOpenChat - 后端返回空消息，但缓存中有 ${existingCachedMessages.length} 条消息，保留缓存`);
            // 不调用 setSessionMessages，保留缓存的消息
          } else {
            console.warn(`[客服端] handleOpenChat - 会话 ${session.id} 没有消息，且缓存也为空`);
            setSessionMessages(session.id, []); // 明确设置为空数组
          }
        }

        // 如果会话已接入，加入WebSocket房间以接收实时消息
        if (detail.status === 'IN_PROGRESS' && detail.agentId === authUser?.id) {
          const wsService = await getWebSocketService();
          await wsService.joinSession(session.id);
        }
      } catch (error) {
        console.error('加载会话详情失败', error);
        message.error('加载会话详情失败');
        // 即使加载失败，也尝试使用会话中的消息（如果有）
        if (session.messages && session.messages.length > 0) {
          const sortedMessages = [...session.messages].sort(
            (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
          );
          setSessionMessages(session.id, sortedMessages);
        }
      }
    },
    [setCurrentSession, setSessionMessages, authUser?.id, clearUnread],
  );

  const handleInputChange = (value: string) => {
    setMessageInput(value);
    if (!aiOptimizedRef.current) {
      lastManualInputRef.current = value;
    }
  };

  const handleSendMessage = async () => {
    if (!currentSession || !messageInput.trim()) return;

    // 检查是否为虚拟会话（工单）
    const isVirtual = (currentSession as any).isVirtual || currentSession.id.startsWith('ticket-');

    if (isVirtual) {
      // 虚拟会话（工单）：发送工单消息
      const ticketId = currentSession.ticketId;
      if (!ticketId) {
        message.error('工单信息无效');
        return;
      }

      const content = messageInput.trim();
      setMessageInput('');
      setSendingMessage(true);

      try {
        // 发送工单消息
        const newMessage = await sendTicketMessage(ticketId, content) as any;

        // 将工单消息转换为会话消息格式并添加到消息列表
        const convertedMessage: Message = {
          id: newMessage.id,
          sessionId: currentSession.id,
          senderType: 'AGENT',
          messageType: 'TEXT',
          content: newMessage.content,
          createdAt: newMessage.createdAt,
        };

        setSessionMessages(currentSession.id, [
          ...(sessionMessages[currentSession.id] || []),
          convertedMessage,
        ]);

        message.success('消息已发送');
      } catch (error: any) {
        console.error('发送工单消息失败:', error);
        message.error(error?.response?.data?.message || '发送消息失败，请重试');
      } finally {
        setSendingMessage(false);
      }
      return;
    }

    // 正常会话：检查会话是否已接入（状态为 IN_PROGRESS 且 agentId 匹配当前用户）
    // 使用 ref 中的最新会话信息，如果 ref 中没有则使用 currentSession
    let sessionToUse = currentSessionRef.current || currentSession;
    let isJoined =
      sessionToUse.status === 'IN_PROGRESS' &&
      sessionToUse.agentId === authUser?.id;

    // 如果检查失败，尝试重新获取会话信息（可能状态还没有更新）
    if (!isJoined) {
      try {
        const detail = await getSessionById(currentSession.id);
        if (detail.status === 'IN_PROGRESS' && detail.agentId === authUser?.id) {
          // 会话已接入，更新当前会话并继续发送
          setCurrentSession(detail);
          currentSessionRef.current = detail;
          sessionToUse = detail;
          isJoined = true;
        } else {
          message.warning('请先接入会话后才能发送消息');
          return;
        }
      } catch (error) {
        console.error('获取会话信息失败:', error);
        message.warning('请先接入会话后才能发送消息');
        return;
      }
    }

    if (!isJoined) {
      message.warning('请先接入会话后才能发送消息');
      return;
    }

    const content = messageInput.trim();
    setMessageInput('');
    setSendingMessage(true);

    // 先添加临时消息（乐观更新）
    const tempMessage: Message = {
      id: `temp-${Date.now()}`,
      sessionId: sessionToUse.id,
      senderType: 'AGENT',
      messageType: 'TEXT',
      content,
      createdAt: new Date().toISOString(),
      metadata: {},
    };
    setSessionMessages(sessionToUse.id, [
      ...(sessionMessages[sessionToUse.id] || []),
      tempMessage,
    ]);

    try {
      // 通过WebSocket发送消息
      const wsService = await getWebSocketService();
      const result = await wsService.sendAgentMessage(sessionToUse.id, content);

      if (!result.success) {
        // 发送失败，移除临时消息
        const currentMessages = sessionMessages[sessionToUse.id] || [];
        setSessionMessages(sessionToUse.id, currentMessages.filter(m => m.id !== tempMessage.id));
        message.error(result.error || '发送消息失败');
      }
      // 如果成功，WebSocket会收到服务器返回的真实消息，临时消息会被替换
    } catch (error: any) {
      console.error('发送消息失败:', error);
      // 移除临时消息
      const sessionIdToUse = sessionToUse?.id || currentSession?.id;
      if (sessionIdToUse) {
        const currentMessages = sessionMessages[sessionIdToUse] || [];
        setSessionMessages(sessionIdToUse, currentMessages.filter(m => m.id !== tempMessage.id));
      }
      message.error('发送消息失败，请重试');
    } finally {
      setSendingMessage(false);
      aiOptimizedRef.current = false;
      lastManualInputRef.current = '';
    }
  };

  const handleFileUpload = async (file: File) => {
    if (!currentSession || !currentSession.ticket?.id) {
      message.warning('请先选择会话');
      return false;
    }

    const isJoined =
      currentSession.status === 'IN_PROGRESS' &&
      currentSession.agentId === authUser?.id;

    if (!isJoined) {
      message.warning('请先接入会话后才能发送文件');
      return false;
    }

    setUploadingFile(true);
    try {
      // 上传文件
      const uploadResult = await uploadTicketAttachment(file, {
        ticketId: currentSession.ticket.id,
      });

      // 判断文件类型
      const isImage = file.type.startsWith('image/') ||
        /\.(png|jpe?g|gif|webp|bmp)$/i.test(file.name);

      // 先添加临时消息（乐观更新）
      const tempMessage: Message = {
        id: `temp-${Date.now()}`,
        sessionId: currentSession.id,
        senderType: 'AGENT',
        messageType: isImage ? 'IMAGE' : 'TEXT',
        content: uploadResult.fileUrl,
        createdAt: new Date().toISOString(),
        metadata: {},
      };
      setSessionMessages(currentSession.id, [
        ...(sessionMessages[currentSession.id] || []),
        tempMessage,
      ]);

      // 通过WebSocket发送消息
      const wsService = await getWebSocketService();
      const result = await wsService.sendAgentMessage(
        currentSession.id,
        uploadResult.fileUrl,
        isImage ? 'IMAGE' : 'TEXT'
      );

      if (!result.success) {
        // 发送失败，移除临时消息
        const currentMessages = sessionMessages[currentSession.id] || [];
        setSessionMessages(currentSession.id, currentMessages.filter(m => m.id !== tempMessage.id));
        message.error(result.error || '发送文件失败');
        return false;
      }

      message.success('文件发送成功');
      return false; // 阻止默认上传行为
    } catch (error: any) {
      console.error('文件上传失败:', error);
      message.error(error?.message || '文件上传失败');
      return false;
    } finally {
      setUploadingFile(false);
    }
  };

  const handleJoinSession = async (session: Session) => {
    if (!session || !session.id) {
      message.error('会话信息无效');
      return;
    }

    // 检查是否为虚拟会话（工单）
    const isVirtual = (session as any).isVirtual || session.id.startsWith('ticket-');

    if (isVirtual) {
      // ✅ 修复：虚拟会话（工单）需要真正接入会话，而不是只加载消息
      const ticketId = session.ticketId;
      if (!ticketId) {
        message.error('工单信息无效');
        return;
      }

      try {
        // 通过工单ID接入会话（如果会话不存在则创建，如果已关闭则重新激活）
        const joinedSession = await joinSessionByTicketId(ticketId);
        console.log(`[客服端] 虚拟会话接入成功:`, joinedSession);

        // 接入成功后，加载消息
        const sessionMessages = joinedSession.messages || [];
        
        // 同时加载工单消息
        const ticketMessages = await getTicketMessages(ticketId).catch(() => []);

        // 将工单消息转换为会话消息格式
        const convertedTicketMessages: Message[] = (Array.isArray(ticketMessages) ? ticketMessages : []).map((msg: any) => ({
          id: msg.id,
          sessionId: joinedSession.id,
          senderType: (msg.senderId ? 'AGENT' : 'PLAYER') as 'AGENT' | 'PLAYER',
          messageType: 'TEXT' as const,
          content: msg.content,
          metadata: msg.metadata || {},
          createdAt: msg.createdAt,
          agentId: msg.senderId,
        }));

        // ✅ 修复：合并会话消息和工单消息，去重并按时间排序
        const allMessages = [...(sessionMessages || []), ...convertedTicketMessages];
        const uniqueMessages = allMessages.filter(
          (msg, index, self) => index === self.findIndex((m) => m.id === msg.id)
        );
        const sortedMessages = uniqueMessages.sort(
          (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        );

        console.log(`[客服端] 工单会话 ${joinedSession.id} 加载消息完成:`, {
          会话消息数: sessionMessages?.length || 0,
          工单消息数: convertedTicketMessages.length,
          合并后总数: sortedMessages.length
        });

        // 设置当前会话和消息
        setCurrentSession(joinedSession);
        currentSessionRef.current = joinedSession;
        setSessionMessages(joinedSession.id, sortedMessages);

        // 刷新会话列表
        await loadSessions();

        message.success('接入会话成功');
      } catch (error: any) {
        console.error('接入虚拟会话失败:', error);
        message.error(error?.response?.data?.message || '接入会话失败，请重试');
      }
      return;
    }

    // 正常会话：接入会话
    try {
      console.log(`[客服端] 准备接入会话:`, {
        sessionId: session.id,
        ticketId: session.ticketId,
        status: session.status,
        hasMessages: !!session.messages,
        messagesCount: session.messages?.length || 0
      });
      
      const updatedSession = await joinSession(session.id);
      console.log(`[客服端] joinSession 返回:`, {
        sessionId: updatedSession.id,
        ticketId: updatedSession.ticketId,
        hasMessages: !!updatedSession.messages,
        messagesCount: updatedSession.messages?.length || 0,
        messages: updatedSession.messages
      });
      
      message.success('接入会话成功');

      //  无论当前选中的是哪个会话，都要加载消息并更新会话信息
      // 这样可以避免消息丢失的问题
      const enrichedSession = {
        ...updatedSession,
        status: 'IN_PROGRESS' as const,
        agentId: updatedSession.agentId || authUser?.id,
      };

      //  修复：加载并设置消息（重要：要在设置当前会话之前完成）
      let sortedMessages = (updatedSession.messages ?? []).sort(
        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      );
      
      //  修复：如果后端没有返回消息，主动调用 API 获取会话消息
      if (sortedMessages.length === 0) {
        console.warn(`[客服端] 接入会话 ${session.id}，后端未返回消息，尝试通过 API 获取`);
        try {
          const apiMessages = await getSessionMessages(session.id);
          console.log(`[客服端] getSessionMessages API 返回:`, {
            sessionId: session.id,
            messagesCount: apiMessages?.length || 0,
            messages: apiMessages
          });
          if (apiMessages && apiMessages.length > 0) {
            sortedMessages = apiMessages.sort(
              (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
            );
            console.log(`[客服端] 通过 API 获取到 ${sortedMessages.length} 条会话消息`);
          } else {
            console.warn(`[客服端] API 返回的会话消息为空，会话ID: ${session.id}，工单ID: ${session.ticketId || updatedSession.ticketId}`);
            // ✅ 修复：如果会话消息为空，尝试通过工单查找关联的会话并加载消息
            const ticketId = session.ticketId || updatedSession.ticketId;
            if (ticketId) {
              console.log(`[客服端] 尝试通过工单 ${ticketId} 查找关联会话的消息`);
              try {
                // 通过工单获取所有关联的会话
                const ticketData = await getTicketById(ticketId);
                console.log(`[客服端] 工单数据:`, {
                  ticketId: ticketData.id,
                  sessionsCount: ticketData.sessions?.length || 0,
                  sessions: ticketData.sessions
                });
                if (ticketData.sessions && ticketData.sessions.length > 0) {
                  // 查找所有会话的消息
                  const allSessionMessages: Message[] = [];
                  for (const ticketSession of ticketData.sessions) {
                    console.log(`[客服端] 检查会话 ${ticketSession.id}:`, {
                      hasMessages: !!ticketSession.messages,
                      messagesCount: ticketSession.messages?.length || 0
                    });
                    if (ticketSession.id && ticketSession.messages && Array.isArray(ticketSession.messages)) {
                      const sessionMsgs = ticketSession.messages.map((msg: any) => ({
                        id: msg.id,
                        sessionId: ticketSession.id,
                        senderType: msg.senderType,
                        messageType: msg.messageType || 'TEXT',
                        content: msg.content,
                        metadata: msg.metadata || {},
                        createdAt: msg.createdAt,
                      }));
                      allSessionMessages.push(...sessionMsgs);
                    } else if (ticketSession.id) {
                      // 如果会话数据中没有消息，尝试通过 API 获取
                      try {
                        const sessionMsgs = await getSessionMessages(ticketSession.id);
                        console.log(`[客服端] 通过 API 获取会话 ${ticketSession.id} 的消息:`, sessionMsgs.length);
                        allSessionMessages.push(...sessionMsgs);
                      } catch (err) {
                        console.warn(`[客服端] 获取会话 ${ticketSession.id} 的消息失败:`, err);
                      }
                    }
                  }
                  
                  if (allSessionMessages.length > 0) {
                    // 去重并按时间排序
                    const uniqueMessages = allSessionMessages.filter(
                      (msg, index, self) => index === self.findIndex((m) => m.id === msg.id)
                    );
                    sortedMessages = uniqueMessages.sort(
                      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
                    );
                    console.log(`[客服端] 通过工单关联会话获取到 ${sortedMessages.length} 条消息`);
                  } else {
                    console.warn(`[客服端] 工单关联的所有会话都没有消息`);
                  }
                }
              } catch (ticketError) {
                console.error(`[客服端] 通过工单查找会话消息失败:`, ticketError);
              }
            }
          }
        } catch (error) {
          console.error(`[客服端] 获取会话消息失败:`, error);
        }
      }
      
      setSessionMessages(session.id, sortedMessages);
      console.log(`✅ 接入会话 ${session.id}，已加载 ${sortedMessages.length} 条消息`);

      // 更新会话列表中的会话（包含 agent 信息）
      updateSession(session.id, {
        status: 'IN_PROGRESS',
        agentId: updatedSession.agentId || authUser?.id,
        agent: updatedSession.agent || (authUser ? {
          id: authUser.id,
          username: authUser.username,
          realName: authUser.realName,
        } : null),
      });

      // 自动切换到该会话（接入后应该查看这个会话）
      setCurrentSession(enrichedSession);
      currentSessionRef.current = enrichedSession;

      // 加入WebSocket会话房间
      const wsService = await getWebSocketService();
      await wsService.joinSession(session.id);

      // 刷新会话列表（在更新当前会话之后）
      await loadSessions();
    } catch (error: any) {
      console.error('接入会话失败:', error);
      message.error(error?.response?.data?.message || '接入会话失败，请重试');
    }
  };

  const handleCloseSession = async () => {
    if (!currentSession) {
      message.warning('请先选择一个会话');
      return;
    }

    try {
      await closeSession(currentSession.id);
      message.success('会话已结束');
      // 刷新会话列表
      await loadSessions();
      // 清空当前会话
      setCurrentSession(null);
      currentSessionRef.current = null;
      setSessionMessages(currentSession.id, []);
    } catch (error: any) {
      console.error('结束会话失败:', error);
      message.error(error?.response?.data?.message || '结束会话失败，请重试');
    }
  };

  const handleTranslate = useCallback(async (messageId: string) => {
    // 如果已经翻译过，就不再翻译
    if (translatedMessages[messageId]) {
      return;
    }

    setTranslatingMessageIds((prev) => {
      const next = new Set(prev);
      next.add(messageId);
      return next;
    });

    try {
      const response = await translateMessage(messageId, 'zh'); // 默认翻译为中文
      const translatedContent = response.metadata?.translation?.translatedContent;

      if (translatedContent) {
        setTranslatedMessages((prev) => ({
          ...prev,
          [messageId]: translatedContent,
        }));
      } else {
        message.warning('翻译结果为空');
      }
    } catch (error: any) {
      console.error('Translation failed:', error);

      // 提供更详细的错误提示
      let errorMessage = '翻译失败，请稍后重试';
      if (error?.response?.data?.message) {
        errorMessage = error.response.data.message;
      } else if (error?.message) {
        errorMessage = error.message;
      }

      message.error(errorMessage);
    } finally {
      setTranslatingMessageIds((prev) => {
        const next = new Set(prev);
        next.delete(messageId);
        return next;
      });
    }
  }, [translatedMessages]);

  const handleUndoAiOptimization = useCallback(() => {
    if (!aiOptimizedRef.current) return;
    setMessageInput(lastManualInputRef.current);
    aiOptimizedRef.current = false;
    message.info('已恢复AI优化前的文本');
  }, []);

  const handleAiOptimize = useCallback(async () => {
    const content = messageInput.trim();
    if (!content) {
      message.warning('请输入需要优化的内容');
      return;
    }

    // 强制使用最新的配置值（避免缓存问题）
    // 直接硬编码最新的API Key，确保不会被缓存影响
    const currentApiKey = 'app-mHw0Fsjq0pzuYZwrqDxoYLA6';
    const currentBaseUrl = 'http://118.89.16.95/v1';
    const currentAppMode = 'chat' as 'chat' | 'workflow';

    // 验证API Key格式
    if (!currentApiKey || !currentApiKey.startsWith('app-')) {
      message.error('Dify API Key 格式错误，无法执行AI优化');
      return;
    }

    if (!currentBaseUrl) {
      message.error('Dify Base URL 缺失，无法执行AI优化');
      return;
    }

    // 开发环境显示配置信息
    if (import.meta.env.DEV) {
      console.log('当前使用的Dify配置（强制使用最新值）:', {
        apiKey: currentApiKey,
        apiKeyLength: currentApiKey.length,
        baseUrl: currentBaseUrl,
        appMode: currentAppMode,
        timestamp: new Date().toISOString(),
      });
    }

    const difyUser = authUser?.id || authUser?.username || 'agent';

    lastManualInputRef.current = messageInput;
    setAiOptimizing(true);
    try {
      const normalizedBase = currentBaseUrl.replace(/\/$/, '');
      const headers = {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: `Bearer ${currentApiKey}`,
      };

      let apiEndpoint: string;
      let payload: Record<string, any>;

      // 根据公共访问URL是 /chat/ 开头，直接使用chat API
      // 因为API Key是app-开头，已经关联了chat应用，不需要额外配置
      let useChatAPI = true;

      // 直接使用chat API（与后端sendChatMessage方法保持一致）
      apiEndpoint = `${normalizedBase}/chat-messages`;
      payload = {
        inputs: {},
        query: `请优化以下客服回复内容，使其更加专业和友好：\n${content}`,
        response_mode: 'blocking',
        user: difyUser,
      };

      // 开发环境显示实际请求信息
      if (import.meta.env.DEV) {
        console.log('实际发送的Dify请求:', {
          endpoint: apiEndpoint,
          apiKey: currentApiKey,
          apiKeyLength: currentApiKey?.length || 0,
          apiKeyPrefix: currentApiKey?.substring(0, 4) || 'N/A',
          headers: { ...headers, Authorization: `Bearer ${currentApiKey.substring(0, 15)}...` },
          payload,
        });
      }


      let response = await fetch(apiEndpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
      });

      // 开发环境：记录响应状态和错误详情
      if (import.meta.env.DEV) {
        console.log('Dify API响应状态:', {
          status: response.status,
          statusText: response.statusText,
          ok: response.ok,
          headers: Object.fromEntries(response.headers.entries()),
        });
      }

      // 如果chat API返回401，检查API Key是否正确
      if (!response.ok && response.status === 401) {
        if (import.meta.env.DEV) {
          console.error('Chat API认证失败，请检查API Key是否正确:', {
            apiKey: currentApiKey ? `${currentApiKey.substring(0, 15)}...` : '未配置',
            fullApiKey: currentApiKey, // 显示完整API Key用于调试
            endpoint: apiEndpoint,
            baseUrl: currentBaseUrl,
          });
        }
      }

      if (!response.ok) {
        let errorMessage = 'AI优化请求失败';
        let errorDetails: any = null;

        try {
          const errorData = await response.json();
          errorDetails = errorData;
          errorMessage =
            errorData?.message ||
            errorData?.error ||
            errorData?.detail ||
            errorMessage;
        } catch {
          const errorText = await response.text();
          if (errorText) {
            errorMessage = errorText;
          }
        }

        // 如果是401错误，提供更详细的错误信息和解决方案
        if (response.status === 401) {
          if (import.meta.env.DEV) {
            console.error('Dify API 401错误详情:', {
              endpoint: apiEndpoint,
              apiKey: currentApiKey ? `${currentApiKey.substring(0, 15)}...` : '未配置',
              fullApiKey: currentApiKey, // 仅在开发环境显示完整API Key用于调试
              mode: currentAppMode,
              baseUrl: currentBaseUrl,
              errorDetails,
            });
          }

          // 401错误：认证失败
          const apiKeyPreview = currentApiKey
            ? `${currentApiKey.substring(0, 15)}...`
            : '未配置';
          const errorMsg = `认证失败 (401): ${errorMessage}。\n\n请检查：\n1. Dify API Key (${apiKeyPreview}) 是否正确\n2. API Key 是否已启用并具有访问权限\n3. Dify Base URL (${currentBaseUrl}) 是否正确\n4. 应用是否已发布`;
          throw new Error(errorMsg);
        }

        throw new Error(errorMessage);
      }

      const data = await response.json();

      // 解析API的响应（参考后端parseDifyResult逻辑）
      let optimizedText = '';

      if (useChatAPI) {
        // chat API返回格式：data.answer 或 data.text
        optimizedText =
          data.answer ||
          data.text ||
          data.output ||
          data.content ||
          '';
      } else if (DIFY_APP_MODE === 'workflow' && DIFY_WORKFLOW_ID) {
        // workflow API返回格式：data.outputs 或 data.data.outputs
        const output = data.outputs || data.data?.outputs || data;

        // 尝试从output中提取文本
        optimizedText =
          output.text ||
          output.answer ||
          output.output ||
          output.initial_reply ||
          output.content ||
          '';

        // 如果output是数组，查找文本类型的输出
        if (!optimizedText && Array.isArray(output)) {
          const textOutput = output.find((item: any) => {
            if (typeof item === 'string') return true;
            if (item?.type === 'text' && typeof item?.text === 'string') {
              return true;
            }
            return false;
          });
          if (typeof textOutput === 'string') {
            optimizedText = textOutput.trim();
          } else if (textOutput?.text) {
            optimizedText = String(textOutput.text).trim();
          }
        }

        // 如果output是对象，尝试从各种字段获取
        if (!optimizedText && typeof output === 'object' && !Array.isArray(output)) {
          optimizedText = output.text || output.answer || output.output || '';
        }
      } else {
        // 默认chat API格式
        optimizedText =
          data.text ||
          data.answer ||
          data.output ||
          data.content ||
          '';
      }

      if (!optimizedText || !optimizedText.trim()) {
        throw new Error('AI未返回优化后的文本');
      }

      setMessageInput(optimizedText);
      aiOptimizedRef.current = true;
      message.success('AI优化完成，已写入输入框');
    } catch (error: any) {
      setMessageInput(lastManualInputRef.current);
      message.error(error?.message || 'AI优化失败，请稍后重试');
    } finally {
      setAiOptimizing(false);
    }
  }, [
    authUser?.id,
    authUser?.username,
    currentSession,
    messageInput,
    ticketInfo,
    ticketIssueTypes,
    updateSession,
  ]);

  const getDurationText = (startTime?: string) => {
    if (!startTime) return '-';
    const duration = dayjs().diff(dayjs(startTime), 'minute');
    if (duration < 60) return `${duration}分钟`;
    const hours = Math.floor(duration / 60);
    const minutes = duration % 60;
    return `${hours}小时${minutes}分钟`;
  };

  const getSessionDuration = (session: Session) =>
    getDurationText(session.startedAt || session.queuedAt || session.createdAt);

  const getWaitingDuration = (session: Session) =>
    getDurationText(session.queuedAt || session.createdAt);

  const getQueueSummary = (session: Session) => {
    const position = session.queuePosition ?? null;
    const estimated =
      session.estimatedWaitTime ??
      (position && position > 0 ? Math.max(position * 5, 3) : null);
    if (position && estimated) {
      return `第 ${position} 位 · 约 ${estimated} 分钟`;
    }
    if (position) {
      return `第 ${position} 位 · 排队中`;
    }
    return `等待 ${getWaitingDuration(session)}`;
  };

  const getAssignedLabel = (session: Session) =>
    session.agent
      ? `分配：${session.agent.realName || session.agent.username}`
      : '等待系统分配';

  const canJoinQueuedSession = (session: Session) => {
    if (session.status !== 'QUEUED' && session.status !== 'PENDING') {
      return false;
    }
    // 如果会话还没有分配客服（agentId 为 null），任何客服或管理员都可以接入
    if (!session.agentId) {
      return authUser?.role === 'AGENT' || authUser?.role === 'ADMIN';
    }
    // 如果已经分配了客服，只有被分配的客服或管理员可以接入
    const assignedToCurrent = session.agentId === authUser?.id;
    if (authUser?.role === 'AGENT') {
      // 客服只能接入分配给自己的会话
      return assignedToCurrent;
    }
    if (authUser?.role === 'ADMIN') {
      // 管理员可以接入任何会话
      return true;
    }
    return false;
  };

  const currentMessages =
    (currentSession && sessionMessages[currentSession.id]) || [];

  // 确保消息按时间排序（升序，最早的在前面）
  const sortedMessages = [...currentMessages].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );

  // 合并所有消息，统一按时间排序显示
  const allMessages = sortedMessages;
  const isAdmin = authUser?.role === 'ADMIN';
  const isAgentRole = authUser?.role === 'AGENT';

  const sessionTimeline = useMemo(() => {
    if (!currentSession) return [];
    const events: Array<{
      key: string;
      label: string;
      timestamp?: string;
      description?: string;
    }> = [];
    if (currentSession.ticket?.createdAt) {
      events.push({
        key: 'ticket-created',
        label: '工单提交',
        timestamp: currentSession.ticket.createdAt,
      });
    }
    if (currentSession.createdAt) {
      events.push({
        key: 'session-created',
        label: '会话创建',
        timestamp: currentSession.createdAt,
      });
    }
    if (currentSession.transferAt) {
      events.push({
        key: 'session-transfer',
        label: '已申请人工服务',
        timestamp: currentSession.transferAt,
        description: currentSession.transferReason || '用户请求人工协助',
      });
    }
    if (currentSession.queuedAt) {
      events.push({
        key: 'session-queued',
        label: '进入排队',
        timestamp: currentSession.queuedAt,
      });
    }
    if (currentSession.startedAt) {
      events.push({
        key: 'session-started',
        label: '客服已接入',
        timestamp: currentSession.startedAt,
        description:
          currentSession.agent?.realName || currentSession.agent?.username,
      });
    }
    if (currentSession.closedAt) {
      events.push({
        key: 'session-closed',
        label: '会话结束',
        timestamp: currentSession.closedAt,
      });
    }
    return events;
  }, [currentSession]);

  return (
    <div className="workbench-page">
      <div className="workbench-layout">
        <section
          className="workbench-list-panel"
          ref={leftPanelRef}
          style={{ width: `${leftPanelWidth}px` }}
        >
          <div
            className="resize-handle resize-handle-right"
            onMouseDown={(e) => {
              e.preventDefault();
              isResizingLeft.current = true;
            }}
          />
          <header className="panel-header">
            <div>
              <div className="panel-title">
                会话 <span>共 {queuedSessions.length + activeSessions.length} 人</span>
              </div>
            </div>
            <Button
              type="primary"
              icon={<MessageOutlined />}
              onClick={loadSessions}
              loading={loadingSessions}
            >
              刷新列表
            </Button>
          </header>
          {sessionsError && <div className="session-error">{sessionsError}</div>}

          {isAdmin && (
            <div className="online-agents-panel">
              <div className="online-agents-header">
                在线客服 ({onlineAgents.length})
              </div>
              {onlineAgents.length === 0 ? (
                <div className="online-agents-empty">暂无客服在线</div>
              ) : (
                <div className="online-agents-list">
                  {onlineAgents.map((agent) => (
                    <div key={agent.id} className="online-agent-tag">
                      <span className="status-dot" />
                      <span className="agent-name">
                        {agent.realName || agent.username}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <div
            className={`session-group ${collapsedSections.queued ? 'collapsed' : ''}`}
          >
            <div className="group-header" onClick={() => toggleSection('queued')}>
              <div className="group-header-content">
                <div className="group-title">待接入队列 ({queuedSessions.length})</div>
                <div className="group-subtitle">系统按优先级自动排序</div>
              </div>
              <CaretRightOutlined
                className={`collapse-icon ${collapsedSections.queued ? '' : 'expanded'}`}
              />
            </div>
            {!collapsedSections.queued && (
              <div className="session-group-content">
                {loadingSessions && queuedSessions.length === 0 ? (
                  <div className="session-loading">
                    <Spin />
                  </div>
                ) : queuedSessions.length === 0 ? (
                  <div className="session-empty-container">
                    <Empty
                      image={Empty.PRESENTED_IMAGE_SIMPLE}
                      description={<span style={{ color: '#999' }}>暂无待接入会话</span>}
                    />
                  </div>
                ) : (
                  queuedSessions.map((session) => {
                    const statusMeta =
                      SESSION_STATUS_META[session.status] || SESSION_STATUS_META.PENDING;
                    const issueTypeNames =
                      session.ticket?.issueTypes?.map((it) => it.name) ?? [];
                    const assignedLabel = getAssignedLabel(session);
                    const queueSummary = getQueueSummary(session);
                    const joinable = canJoinQueuedSession(session);
                    const unreadCount = unreadCounts[session.id] || 0;
                    const hasUnread = unreadCount > 0;
                    return (
                      <div
                        key={session.id}
                        className={`session-card ${currentSession?.id === session.id ? 'active' : ''
                          } ${hasUnread ? 'session-card-unread' : ''}`}
                      >
                        <div
                          className="session-card-content"
                          onClick={() => handleOpenChat(session)}
                        >
                          <div className="session-meta">
                            <div className="session-name">
                              <span>{session.ticket?.playerIdOrName || '未知玩家'}</span>
                              {hasUnread && (
                                <Badge
                                  count={unreadCount}
                                  size="small"
                                  style={{ marginLeft: 10 }}
                                  overflowCount={99}
                                />
                              )}
                            </div>
                            <Tag color={statusMeta.color}>{statusMeta.label}</Tag>
                          </div>
                          <div className="session-desc">
                            <span>{session.ticket?.game?.name || '未知游戏'}</span>
                            <span>{session.ticket?.server?.name || '--'}</span>
                            <span>
                              {issueTypeNames.length > 0
                                ? issueTypeNames.join('、')
                                : '问题未分类'}
                            </span>
                          </div>
                          <div className="session-tags">
                            {(session as any).isVirtual ? (
                              <Tag color="red">工单</Tag>
                            ) : session.queuePosition ? (
                              <Tag color="orange">第 {session.queuePosition} 位</Tag>
                            ) : (
                              <Tag color="orange">排队中</Tag>
                            )}
                            <Tag color={session.agent ? 'blue' : 'default'}>
                              {session.agent
                                ? `分配给 ${session.agent.realName || session.agent.username}`
                                : '等待分配'}
                            </Tag>
                          </div>
                          <div className="session-extra">{queueSummary}</div>
                          <div className="session-extra">{assignedLabel}</div>
                        </div>
                        <div className="session-actions" onClick={(e) => e.stopPropagation()}>
                          {(session as any).isVirtual ? (
                            <Button
                              type="primary"
                              size="small"
                              icon={<UserAddOutlined />}
                              onClick={() => handleJoinSession(session)}
                            >
                              查看工单
                            </Button>
                          ) : joinable ? (
                            <Button
                              type="primary"
                              size="small"
                              icon={<UserAddOutlined />}
                              onClick={() => handleJoinSession(session)}
                            >
                              接入会话
                            </Button>
                          ) : (
                            <span className="session-assigned-hint">
                              仅可由分配对象接入
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </div>

          <div
            className={`session-group ${collapsedSections.active ? 'collapsed' : ''}`}
          >
            <div className="group-header" onClick={() => toggleSection('active')}>
              <div className="group-header-content">
                <div className="group-title">进行中会话 ({activeSessions.length})</div>
                <div className="group-subtitle">实时显示已接入的人工会话</div>
              </div>
              <CaretRightOutlined
                className={`collapse-icon ${collapsedSections.active ? '' : 'expanded'}`}
              />
            </div>
            {!collapsedSections.active && (
              <div className="session-group-content">
                {loadingSessions && activeSessions.length === 0 ? (
                  <div className="session-loading">
                    <Spin />
                  </div>
                ) : activeSessions.length === 0 ? (
                  <div className="session-empty-container">
                    <Empty
                      image={Empty.PRESENTED_IMAGE_SIMPLE}
                      description={<span style={{ color: '#999' }}>暂无进行中的会话</span>}
                    />
                  </div>
                ) : (
                  activeSessions.map((session) => {
                    const statusMeta =
                      SESSION_STATUS_META[session.status] || SESSION_STATUS_META.PENDING;
                    const unreadCount = unreadCounts[session.id] || 0;
                    const hasUnread = unreadCount > 0;
                    return (
                      <div
                        key={session.id}
                        className={`session-card ${currentSession?.id === session.id ? 'active' : ''
                          } ${hasUnread ? 'session-card-unread' : ''}`}
                        onClick={() => handleOpenChat(session)}
                      >
                        <div className="session-meta">
                          <div className="session-name">
                            <span>{session.ticket.playerIdOrName}</span>
                            {hasUnread && (
                              <Badge
                                count={unreadCount}
                                size="small"
                                style={{ marginLeft: 10 }}
                                overflowCount={99}
                              />
                            )}
                          </div>
                          <Tag color={statusMeta.color}>{statusMeta.label}</Tag>
                        </div>
                        <div className="session-desc">
                          <span>{session.ticket.game.name}</span>
                          <span>{session.ticket.server?.name || '--'}</span>
                          <span>
                            {session.ticket.issueTypes && session.ticket.issueTypes.length > 0
                              ? session.ticket.issueTypes.map((it: any) => it.name || it).join('、')
                              : session.ticket.description || '问题未分类'}
                          </span>
                        </div>
                        <div className="session-extra">
                          当前客服:{' '}
                          {session.agent?.realName ||
                            session.agent?.username ||
                            (session.agentId ? '未知客服' : '未指派')}
                        </div>
                        <div className="session-extra">
                          持续: {getSessionDuration(session)}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </div>
        </section>

        <section className="workbench-chat-panel">
          {currentSession ? (
            <>
              <div className="chat-panel-spin">
                <div className="chat-panel-body">
                  <div className="chat-panel-header">
                    <div>
                      <div className="panel-title">
                        {currentSession.ticket.playerIdOrName || '--'} ·{' '}
                        {currentSession.ticket.game.name || '--'}
                        {sessionStatusMeta && (
                          <Tag color={sessionStatusMeta.color} style={{ marginLeft: 8 }}>
                            {sessionStatusMeta.label}
                          </Tag>
                        )}
                      </div>
                      <div className="chat-context">
                        {currentSession.ticket.ticketNo} ·{' '}
                        {currentSession.ticket.game.name} ·{' '}
                        {currentSession.ticket.server?.name || '一区'} · 持续:{' '}
                        {getSessionDuration(currentSession)}
                        {sessionStatusMeta?.description
                          ? ` · ${sessionStatusMeta.description}`
                          : ''}
                      </div>
                    </div>
                    <Space>
                      {(() => {
                        const isJoined =
                          currentSession.status === 'IN_PROGRESS' &&
                          currentSession.agentId === authUser?.id;
                        const canJoin = canJoinQueuedSession(currentSession);

                        if (!isJoined && canJoin) {
                          return (
                            <Button
                              type="primary"
                              onClick={() => handleJoinSession(currentSession)}
                            >
                              接入会话
                            </Button>
                          );
                        }

                        if (isJoined) {
                          return (
                            <Button icon={<CloseOutlined />} danger onClick={handleCloseSession}>
                              结束会话
                            </Button>
                          );
                        }

                        return null;
                      })()}
                    </Space>
                  </div>

                  <div className="chat-history">
                    <div className="message-list-container">
                      {allMessages.length === 0 ? (
                        <div className="chat-empty">欢迎接管会话，输入框支持 AI 优化。</div>
                      ) : (
                        allMessages.map((msg) => {
                          const isPlayer = msg.senderType === 'PLAYER';
                          const isAgent = msg.senderType === 'AGENT';
                          const isAI = msg.senderType === 'AI';

                          const avatarClass = 'avatar-player-wechat';
                          const avatarIcon = <UserOutlined />;

                          return (
                            <div
                              key={msg.id}
                              className={`message-item-wechat ${isPlayer
                                ? 'message-player-wechat'
                                : isAI
                                  ? 'message-ai-wechat'
                                  : 'message-agent-wechat'
                                }`}
                            >
                              {/* 客服端：只显示玩家头像，不显示自己和AI的头像 */}
                              {isPlayer && (
                                <div className={`message-avatar-wechat ${avatarClass}`}>
                                  {avatarIcon}
                                </div>
                              )}
                              <div className="message-content-wrapper-wechat">
                                {isAI && (
                                  <span className="message-sender-name-wechat">
                                    AI助手
                                    {msg.metadata?.confidence
                                      ? ` (置信度:${msg.metadata.confidence}%)`
                                      : ''}
                                  </span>
                                )}
                                {isAgent && (
                                  <span className="message-sender-name-wechat">
                                    客服
                                    {currentSession.agent?.realName ||
                                      currentSession.agent?.username ||
                                      authUser?.realName ||
                                      authUser?.username ||
                                      ''}
                                  </span>
                                )}
                                <div
                                  className={`message-bubble-wechat ${isAgent
                                    ? 'bubble-agent-wechat'
                                    : isAI
                                      ? 'bubble-ai-wechat'
                                      : 'bubble-player-wechat'
                                    }`}
                                >
                                  {msg.messageType === 'IMAGE' ? (
                                    <Image
                                      src={resolveMediaUrl(msg.content)}
                                      alt="消息图片"
                                      width={200}
                                      style={{
                                        maxWidth: '200px',
                                        maxHeight: '300px',
                                        borderRadius: 4,
                                        display: 'block'
                                      }}
                                      preview={{
                                        mask: '预览',
                                      }}
                                    />
                                  ) : (
                                    <div className="message-text-wechat">
                                      {isFileUrl(msg.content) ? (
                                        <a
                                          href={resolveMediaUrl(msg.content)}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          style={{ color: '#1890ff', textDecoration: 'underline' }}
                                        >
                                          📎 {getFileName(msg.content)}
                                        </a>
                                      ) : (
                                        <>
                                          {/* 显示原文或译文 */}
                                          {translatedMessages[msg.id] && !showOriginal[msg.id] ? (
                                            <>
                                              <div className="translation-content">
                                                {translatedMessages[msg.id]}
                                              </div>
                                              <div
                                                className="translation-toggle"
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  setShowOriginal((prev) => ({
                                                    ...prev,
                                                    [msg.id]: true,
                                                  }));
                                                }}
                                                style={{
                                                  fontSize: '12px',
                                                  color: '#1890ff',
                                                  cursor: 'pointer',
                                                  marginTop: '4px'
                                                }}
                                              >
                                                查看原文
                                              </div>
                                            </>
                                          ) : (
                                            <>
                                              {msg.content}
                                              {translatedMessages[msg.id] && showOriginal[msg.id] && (
                                                <>
                                                  <div className="translation-result">
                                                    <div className="translation-divider" />
                                                    <div className="translation-content">
                                                      {translatedMessages[msg.id]}
                                                    </div>
                                                  </div>
                                                  <div
                                                    className="translation-toggle"
                                                    onClick={(e) => {
                                                      e.stopPropagation();
                                                      setShowOriginal((prev) => ({
                                                        ...prev,
                                                        [msg.id]: false,
                                                      }));
                                                    }}
                                                    style={{
                                                      fontSize: '12px',
                                                      color: '#1890ff',
                                                      cursor: 'pointer',
                                                      marginTop: '4px'
                                                    }}
                                                  >
                                                    查看译文
                                                  </div>
                                                </>
                                              )}
                                            </>
                                          )}
                                        </>
                                      )}
                                    </div>
                                  )}
                                  <div className="message-footer-row">
                                    <span className="message-time-wechat">
                                      {dayjs(msg.createdAt).format('HH:mm')}
                                    </span>
                                    {/* 翻译按钮：仅针对文本类型的玩家消息 */}
                                    {msg.messageType === 'TEXT' && isPlayer && (
                                      <span
                                        className="translate-action"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleTranslate(msg.id);
                                        }}
                                        title="翻译"
                                      >
                                        {translatingMessageIds.has(msg.id) ? (
                                          <Spin size="small" />
                                        ) : (
                                          <TranslationOutlined style={{ fontSize: '14px', marginLeft: '6px', cursor: 'pointer', color: '#666' }} />
                                        )}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>
                              {/* AI和客服消息不显示头像 */}
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="chat-empty-state">
              <div className="empty-message">请从左侧列表选择一个会话开始工作</div>
            </div>
          )}

          {currentSession && (() => {
            // 检查是否为虚拟会话（工单）
            const isVirtual = (currentSession as any).isVirtual || currentSession.id.startsWith('ticket-');

            // 检查会话是否已接入（状态为 IN_PROGRESS 且 agentId 匹配当前用户）
            // 对于虚拟会话，如果已加载消息（messagesLoaded标记），则认为可以发送
            const isJoined = isVirtual
              ? ((currentSession as any).messagesLoaded || (sessionMessages[currentSession.id]?.length ?? 0) > 0)
              : (currentSession.status === 'IN_PROGRESS' && currentSession.agentId === authUser?.id);

            return (
              <div className="chat-input-bar">
                {!isJoined && (currentSession.status === 'QUEUED' || isVirtual) && (
                  <div style={{
                    padding: '16px',
                    textAlign: 'center',
                    background: '#fff3cd',
                    border: '1px solid #ffc107',
                    borderRadius: '4px',
                    marginBottom: '8px'
                  }}>
                    <div style={{ marginBottom: '8px', color: '#856404' }}>
                      {isVirtual
                        ? '这是工单信息，点击"加载工单消息"查看并回复'
                        : '请先点击"接入会话"按钮才能开始聊天'}
                    </div>
                    <Button
                      type="primary"
                      onClick={() => handleJoinSession(currentSession)}
                    >
                      {isVirtual ? '加载工单消息' : '接入会话'}
                    </Button>
                  </div>
                )}
                <div className="input-toolbar">
                  <Upload
                    beforeUpload={(file) => {
                      handleFileUpload(file);
                      return false; // 阻止默认上传
                    }}
                    showUploadList={false}
                    accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt"
                  >
                    <Button
                      type="text"
                      icon={<PaperClipOutlined />}
                      title="附件"
                      disabled={!isJoined || uploadingFile}
                      loading={uploadingFile}
                    />
                  </Upload>
                  <Button
                    type="text"
                    icon={<ThunderboltOutlined />}
                    title="快捷回复"
                    disabled={!isJoined}
                    onClick={() => setQuickReplyDrawerOpen(true)}
                  />
                </div>
                <TextArea
                  value={messageInput}
                  onChange={(e) => handleInputChange(e.target.value)}
                  placeholder={isJoined ? "输入回复…（Shift+Enter 换行）" : (isVirtual ? "请先加载工单消息" : "请先接入会话后才能发送消息")}
                  autoSize={{ minRows: 1, maxRows: 4 }}
                  disabled={!isJoined}
                  style={{
                    resize: 'vertical',
                    maxHeight: '120px',
                    minHeight: '32px'
                  }}
                  onPressEnter={(e) => {
                    if (e.shiftKey) return;
                    e.preventDefault();
                    if (isJoined) {
                      handleSendMessage();
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.ctrlKey && (e.key === 'z' || e.key === 'Z')) {
                      e.preventDefault();
                      handleUndoAiOptimization();
                    }
                  }}
                />
                <div className="chat-actions">
                  <Space size="middle">
                    <Button
                      icon={<RobotOutlined />}
                      className="ai-optimize-btn"
                      onClick={handleAiOptimize}
                      disabled={!messageInput.trim() || aiOptimizing || !isJoined}
                      loading={aiOptimizing}
                      size="middle"
                    >
                      {aiOptimizing ? 'AI优化中…' : 'AI优化'}
                    </Button>
                    <Button
                      type="primary"
                      icon={<SendOutlined />}
                      onClick={handleSendMessage}
                      loading={sendingMessage}
                      disabled={!messageInput.trim() || !isJoined}
                      size="middle"
                    >
                      发送
                    </Button>
                  </Space>
                </div>
              </div>
            );
          })()}
        </section>

        <section
          className="workbench-info-panel"
          ref={rightPanelRef}
          style={{ width: `${rightPanelWidth}px` }}
        >
          <div
            className="resize-handle resize-handle-left"
            onMouseDown={(e) => {
              e.preventDefault();
              isResizingRight.current = true;
            }}
          />
          <div className="tab-content">
            {currentSession ? (
              <div className="ticket-card">
                <div className="ticket-title">工单详情</div>
                <div className="info-row">
                  <span>工单号</span>
                  <div className="info-value">
                    <Text copyable={{ text: currentSession.ticket.ticketNo }}>
                      {currentSession.ticket.ticketNo}
                    </Text>
                  </div>
                </div>
                <div className="info-row">
                  <span>游戏</span>
                  <strong>{currentSession.ticket.game.name}</strong>
                </div>
                <div className="info-row">
                  <span>区服</span>
                  <strong>{currentSession.ticket.server?.name || currentSession.ticket.serverName || '-'}</strong>
                </div>
                <div className="info-row">
                  <span>玩家ID/昵称</span>
                  <strong>{currentSession.ticket.playerIdOrName}</strong>
                </div>
                <div className="info-row">
                  <span>状态</span>
                  <div className="info-value">
                    {ticketStatusMeta ? (
                      <Tag color={ticketStatusMeta.color}>{ticketStatusMeta.label}</Tag>
                    ) : (
                      '-'
                    )}
                  </div>
                </div>
                <div className="info-row">
                  <span>会话状态</span>
                  <div className="info-value">
                    {sessionStatusMeta ? (
                      <Tag color={sessionStatusMeta.color}>{sessionStatusMeta.label}</Tag>
                    ) : (
                      '-'
                    )}
                  </div>
                </div>
                <div className="info-row">
                  <span>问题类型</span>
                  <div className="info-value">
                    {ticketIssueTypes.length > 0 ? (
                      <Space size={[4, 4]} wrap>
                        {ticketIssueTypes.map((issueTypeName: string, index: number) => (
                          <Tag key={index} color="blue">
                            {issueTypeName}
                          </Tag>
                        ))}
                      </Space>
                    ) : (
                      <span>-</span>
                    )}
                  </div>
                </div>
                <div className="info-row">
                  <span>创建时间</span>
                  <strong>{dayjs(currentSession.ticket.createdAt).format('YYYY-MM-DD HH:mm:ss')}</strong>
                </div>
                <div className="info-row">
                  <span>更新时间</span>
                  <strong>{dayjs(currentSession.ticket.updatedAt).format('YYYY-MM-DD HH:mm:ss')}</strong>
                </div>
                {currentSession.ticket.occurredAt && (
                  <div className="info-row">
                    <span>问题发生时间</span>
                    <strong>{dayjs(currentSession.ticket.occurredAt).format('YYYY-MM-DD HH:mm:ss')}</strong>
                  </div>
                )}
                <div className="info-row">
                  <span>充值订单号</span>
                  <strong>{currentSession.ticket.paymentOrderNo || '-'}</strong>
                </div>
                <div className="info-row">
                  <span>问题描述</span>
                  <p className="description-text">{currentSession.ticket.description}</p>
                </div>
                {attachmentList.length > 0 && (
                  <div className="info-row">
                    <span>附件</span>
                    <div className="attachments-preview">
                      {attachmentList.map((file) => (
                        <Image
                          key={file.id}
                          src={resolveMediaUrl(file.fileUrl)}
                          width={88}
                          height={88}
                          style={{ borderRadius: 12, objectFit: 'cover' }}
                          preview={{
                            mask: '预览',
                          }}
                        />
                      ))}
                    </div>
                  </div>
                )}
                {sessionTimeline.length > 0 && (
                  <div className="timeline-section">
                    <div className="timeline-title">状态跟踪</div>
                    <ul className="timeline-list">
                      {sessionTimeline.map((item) => (
                        <li key={item.key} className="timeline-item">
                          <div className="timeline-dot" />
                          <div className="timeline-content">
                            <div className="timeline-label">{item.label}</div>
                            <div className="timeline-time">
                              {formatDateTime(item.timestamp)}
                            </div>
                            {item.description && (
                              <div className="timeline-desc">{item.description}</div>
                            )}
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ) : (
              <div className="ticket-empty-state">
                <div className="empty-message">请选择一个会话查看工单详情</div>
              </div>
            )}
          </div>
        </section>
      </div>

      {/* 快捷回复抽屉 */}
      <QuickReplyDrawer
        open={quickReplyDrawerOpen}
        onClose={() => setQuickReplyDrawerOpen(false)}
        onSelect={(content) => {
          setMessageInput(content);
          setQuickReplyDrawerOpen(false);
        }}
      />
    </div>
  );
};

export default ActivePage;
