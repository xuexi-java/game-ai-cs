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
} from 'antd';
import {
  MessageOutlined,
  SendOutlined,
  CloseOutlined,
  PaperClipOutlined,
  SmileOutlined,
  FolderOutlined,
  CopyOutlined,
  RobotOutlined,
  UserAddOutlined,
  UserOutlined,
  CustomerServiceOutlined,
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
  closeSession,
} from '../../services/session.service';
import { websocketService } from '../../services/websocket.service';

const { TextArea } = Input;
const { Text } = Typography;
const API_ORIGIN = API_BASE_URL.replace(/\/api\/v1\/?$/, '');

const resolveMediaUrl = (url?: string) => {
  if (!url) return '';
  if (/^https?:\/\//i.test(url)) {
    return url;
  }
  const normalized = url.startsWith('/') ? url : `/${url}`;
  return `${API_ORIGIN}${normalized}`;
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
  NEW: { label: '新建', color: 'blue' },
  WAITING: { label: '等待玩家', color: 'orange' },
  IN_PROGRESS: { label: '处理中', color: 'processing' },
  RESOLVED: { label: '已解决', color: 'green' },
  CLOSED: { label: '已关闭', color: 'default' },
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
  const lastManualInputRef = useRef('');
  const aiOptimizedRef = useRef(false);
  const currentSessionRef = useRef<Session | null>(null);
  
  // 布局调整相关状态
  const [leftPanelWidth, setLeftPanelWidth] = useState(320);
  const [rightPanelWidth, setRightPanelWidth] = useState(360);
  const isResizingLeft = useRef(false);
  const isResizingRight = useRef(false);
  const leftPanelRef = useRef<HTMLDivElement>(null);
  const rightPanelRef = useRef<HTMLDivElement>(null);

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

  const ticketIssueTypes = ticketInfo?.issueTypes?.map((it) => it.name) ?? fallbackIssueTypes;

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
        // 总是重新加载消息，确保获取最新的完整消息列表
        try {
          const detail = await getSessionById(next.id);
          setCurrentSession(detail);
          currentSessionRef.current = detail;
          // 确保消息按时间排序
          const sortedMessages = (detail.messages ?? []).sort(
            (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
          );
          setSessionMessages(next.id, sortedMessages);
        } catch (error) {
          console.error('加载会话详情失败', error);
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
    loadSessions();
  }, [loadSessions]);

  useEffect(() => {
    currentSessionRef.current = currentSession || null;
  }, [currentSession]);

  const handleOpenChat = useCallback(
    async (session: Session) => {
      setCurrentSession(session);
      currentSessionRef.current = session;
      // 总是重新加载消息，确保获取最新的完整消息列表
      try {
        const detail = await getSessionById(session.id);
        setCurrentSession(detail);
        currentSessionRef.current = detail;
        // 确保消息按时间排序
        const sortedMessages = (detail.messages ?? []).sort(
          (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        );
        setSessionMessages(session.id, sortedMessages);
        
        // 如果会话已接入，加入WebSocket房间以接收实时消息
        if (detail.status === 'IN_PROGRESS' && detail.agentId === authUser?.id) {
          await websocketService.joinSession(session.id);
        }
      } catch (error) {
        console.error('加载会话详情失败', error);
        message.error('加载会话详情失败');
      }
    },
    [setCurrentSession, setSessionMessages, authUser?.id],
  );

  const handleInputChange = (value: string) => {
    setMessageInput(value);
    if (!aiOptimizedRef.current) {
      lastManualInputRef.current = value;
    }
  };

  const handleSendMessage = async () => {
    if (!currentSession || !messageInput.trim()) return;

    // 检查会话是否已接入（状态为 IN_PROGRESS 且 agentId 匹配当前用户）
    const isJoined = 
      currentSession.status === 'IN_PROGRESS' && 
      currentSession.agentId === authUser?.id;

    if (!isJoined) {
      message.warning('请先接入会话后才能发送消息');
      return;
    }

    const content = messageInput.trim();
    setMessageInput('');
    setSendingMessage(true);

    try {
      // 先添加临时消息（乐观更新）
      const tempMessage: Message = {
        id: `temp-${Date.now()}`,
        sessionId: currentSession.id,
        senderType: 'AGENT',
        messageType: 'TEXT',
        content,
        createdAt: new Date().toISOString(),
        metadata: {},
      };
      setSessionMessages(currentSession.id, [
        ...(sessionMessages[currentSession.id] || []),
        tempMessage,
      ]);

      // 通过WebSocket发送消息
      const result = await websocketService.sendAgentMessage(currentSession.id, content);

      if (!result.success) {
        // 发送失败，移除临时消息
        const currentMessages = sessionMessages[currentSession.id] || [];
        setSessionMessages(currentSession.id, currentMessages.filter(m => m.id !== tempMessage.id));
        message.error(result.error || '发送消息失败');
      }
      // 如果成功，WebSocket会收到服务器返回的真实消息，临时消息会被替换
    } catch (error: any) {
      console.error('发送消息失败:', error);
      // 移除临时消息
      const currentMessages = sessionMessages[currentSession.id] || [];
      setSessionMessages(currentSession.id, currentMessages.filter(m => m.id !== tempMessage.id));
      message.error('发送消息失败，请重试');
    } finally {
      setSendingMessage(false);
      aiOptimizedRef.current = false;
      lastManualInputRef.current = '';
    }
  };

  const handleJoinSession = async (session: Session) => {
    if (!session || !session.id) {
      message.error('会话信息无效');
      return;
    }

    try {
      const updatedSession = await joinSession(session.id);
      message.success('接入会话成功');
      
      // 加入WebSocket会话房间
      await websocketService.joinSession(session.id);
      
      // 刷新会话列表
      await loadSessions();
      // 如果当前选中的是这个会话，更新当前会话
      if (currentSession?.id === session.id) {
        const detail = await getSessionById(session.id);
        setCurrentSession(detail);
        currentSessionRef.current = detail;
        const sortedMessages = (detail.messages ?? []).sort(
          (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        );
        setSessionMessages(session.id, sortedMessages);
      }
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
    if (!DIFY_API_KEY || !DIFY_BASE_URL) {
      message.error('Dify 配置缺失，无法执行AI优化');
      return;
    }
    if (DIFY_APP_MODE === 'workflow' && !DIFY_WORKFLOW_ID) {
      message.error('未配置 Dify Workflow ID，无法执行AI优化');
      return;
    }

    const difyUser = authUser?.id || authUser?.username || 'agent';
    const conversationId =
      currentSession?.difyConversationId || currentSession?.id || undefined;

    const difyInputs: Record<string, string> = {};
    if (ticketInfo?.ticketNo) difyInputs.ticketNo = ticketInfo.ticketNo;
    if (ticketInfo?.game?.name) difyInputs.game = ticketInfo.game.name;
    if (ticketInfo?.playerIdOrName)
      difyInputs.player = ticketInfo.playerIdOrName;
    if (ticketIssueTypes.length > 0) {
      difyInputs.issueTypes = ticketIssueTypes.join('、');
    }
    difyInputs.text = content;

    lastManualInputRef.current = messageInput;
    setAiOptimizing(true);
    try {
      const normalizedBase = DIFY_BASE_URL.replace(/\/$/, '');
      const headers = {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: `Bearer ${DIFY_API_KEY}`,
      };

      let apiEndpoint = `${normalizedBase}/chat-messages`;
      let payload: Record<string, any> = {
        inputs: difyInputs,
        query: content,
        response_mode: 'streaming',
        user: difyUser,
        conversation_id: conversationId || '',
        files: [],
      };

      if (DIFY_APP_MODE === 'workflow') {
        apiEndpoint = `${normalizedBase}/workflows/run`;
        payload = {
          workflow_id: DIFY_WORKFLOW_ID,
          inputs: difyInputs,
          response_mode: 'streaming',
          user: difyUser,
        };
      }

      const response = await fetch(apiEndpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        let errorMessage = 'AI优化请求失败';
        try {
          const errorData = await response.json();
          errorMessage =
            errorData?.message ||
            errorData?.error ||
            errorData?.detail ||
            errorMessage;
        } catch {
          const errorText = await response.text();
          if (errorText) errorMessage = errorText;
        }
        throw new Error(errorMessage);
      }

      const data = await response.json();

      let optimizedText =
        (typeof data.answer === 'string' && data.answer.trim()) ||
        (typeof data.output_text === 'string' && data.output_text.trim()) ||
        '';

      if (!optimizedText && Array.isArray(data.outputs)) {
        const textOutput = data.outputs.find((item: any) => {
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

      if (!optimizedText) {
        throw new Error('AI未返回优化后的文本');
      }

      if (data.conversation_id && currentSession) {
        updateSession(currentSession.id, {
          difyConversationId: data.conversation_id,
          difyStatus: data.status ? String(data.status) : undefined,
        });
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

  const currentMessages =
    (currentSession && sessionMessages[currentSession.id]) || [];

  // 确保消息按时间排序（升序，最早的在前面）
  const sortedMessages = [...currentMessages].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );

  // 合并所有消息，统一按时间排序显示
  const allMessages = sortedMessages;

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

          <div className="session-group">
            <div className="group-header">待接入队列 ({queuedSessions.length})</div>
            <div className="session-group-content">
              {loadingSessions && queuedSessions.length === 0 ? (
                <div className="session-loading">
                  <Spin />
                </div>
              ) : queuedSessions.length === 0 ? (
                <div className="session-empty">
                  暂无待接入会话，等待玩家请求转人工
                </div>
              ) : (
                queuedSessions.map((session) => {
                  const statusMeta =
                    SESSION_STATUS_META[session.status] || SESSION_STATUS_META.PENDING;
                  const issueTypeNames =
                    session.ticket?.issueTypes?.map((it) => it.name) ?? [];
                  return (
                    <div
                      key={session.id}
                      className={`session-card ${
                        currentSession?.id === session.id ? 'active' : ''
                      }`}
                    >
                      <div
                        className="session-card-content"
                        onClick={() => handleOpenChat(session)}
                      >
                        <div className="session-meta">
                          <div className="session-name">
                            {session.ticket?.playerIdOrName || '未知玩家'}
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
                        <div className="session-extra">
                          {statusMeta.description || ''} · 等待{' '}
                          {getWaitingDuration(session)}
                        </div>
                      </div>
                      <div className="session-actions" onClick={(e) => e.stopPropagation()}>
                        <Button
                          type="primary"
                          size="small"
                          icon={<UserAddOutlined />}
                          onClick={() => handleJoinSession(session)}
                        >
                          接入会话
                        </Button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          <div className="session-group">
            <div className="group-header">进行中会话 ({activeSessions.length})</div>
            <div className="session-group-content">
              {loadingSessions && activeSessions.length === 0 ? (
                <div className="session-loading">
                  <Spin />
                </div>
              ) : activeSessions.length === 0 ? (
                <div className="session-empty">
                  暂无进行中的会话，等待客服接入
                </div>
              ) : (
                activeSessions.map((session) => {
                  const statusMeta =
                    SESSION_STATUS_META[session.status] || SESSION_STATUS_META.PENDING;
                  return (
                    <div
                      key={session.id}
                      className={`session-card ${
                        currentSession?.id === session.id ? 'active' : ''
                      }`}
                      onClick={() => handleOpenChat(session)}
                    >
                      <div className="session-meta">
                        <div className="session-name">
                          {session.ticket.playerIdOrName}
                        </div>
                        <Tag color={statusMeta.color}>{statusMeta.label}</Tag>
                      </div>
                      <div className="session-desc">
                        <span>{session.ticket.game.name}</span>
                        <span>{session.ticket.server?.name || '未分配'}</span>
                        <span>{session.ticket.description}</span>
                      </div>
                      <div className="session-extra">
                        持续: {getSessionDuration(session)}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </section>

        <section className="workbench-chat-panel">
          {currentSession ? (
            <>
              <Spin spinning={loadingSessions}>
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
                    // 检查会话是否已接入（状态为 IN_PROGRESS 且 agentId 匹配当前用户）
                    const isJoined = 
                      currentSession.status === 'IN_PROGRESS' && 
                      currentSession.agentId === authUser?.id;
                    
                    // 检查是否可以接入会话
                    // 管理员：可以接入分配给管理员或未分配的会话
                    // 客服：只能接入分配给自己的会话
                    const canJoin = currentSession.status === 'QUEUED' && (
                      authUser?.role === 'ADMIN' || 
                      (authUser?.role === 'AGENT' && currentSession.agentId === authUser?.id)
                    );
                    
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
                        
                        // 客服消息显示在右边（类似玩家消息）
                        const isRightAligned = isAgent;
                        
                        return (
                          <div
                            key={msg.id}
                            className={`message-item-wechat ${
                              isRightAligned 
                                ? 'message-agent-wechat' 
                                : isPlayer 
                                  ? 'message-player-wechat' 
                                  : 'message-ai-wechat'
                            }`}
                          >
                            {!isRightAligned && (
                              <>
                                {isAI && (
                                  <div className="message-avatar-wechat avatar-ai-wechat">
                                    <RobotOutlined />
                                  </div>
                                )}
                                {isPlayer && (
                                  <div className="message-avatar-wechat avatar-player-wechat">
                                    <UserOutlined />
                                  </div>
                                )}
                              </>
                            )}
                            <div className="message-content-wrapper-wechat">
                              {!isRightAligned && !isPlayer && (
                                <span className="message-sender-name-wechat">
                                  {isAI ? `AI助手${msg.metadata?.confidence ? `(置信度:${msg.metadata.confidence}%)` : ''}` : ''}
                                </span>
                              )}
                              {isRightAligned && (
                                <span className="message-sender-name-wechat">
                                  客服{currentSession.agent?.realName || currentSession.agent?.username || authUser?.realName || authUser?.username || ''}
                                </span>
                              )}
                              <div className={`message-bubble-wechat ${
                                isRightAligned 
                                  ? 'bubble-agent-wechat' 
                                  : isPlayer 
                                    ? 'bubble-player-wechat' 
                                    : 'bubble-ai-wechat'
                              }`}>
                                <div className="message-text-wechat">{msg.content}</div>
                                <span className="message-time-wechat">{dayjs(msg.createdAt).format('HH:mm')}</span>
                              </div>
                            </div>
                            {isRightAligned && (
                              <div className="message-avatar-wechat avatar-agent-wechat">
                                <CustomerServiceOutlined />
                              </div>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              </Spin>
            </>
          ) : (
            <div className="chat-empty-state">
              <div className="empty-message">请从左侧列表选择一个会话开始工作</div>
            </div>
          )}

          {currentSession && (() => {
            // 检查会话是否已接入（状态为 IN_PROGRESS 且 agentId 匹配当前用户）
            const isJoined = 
              currentSession.status === 'IN_PROGRESS' && 
              currentSession.agentId === authUser?.id;
            
            return (
              <div className="chat-input-bar">
                {!isJoined && currentSession.status === 'QUEUED' && (
                  <div style={{ 
                    padding: '16px', 
                    textAlign: 'center', 
                    background: '#fff3cd', 
                    border: '1px solid #ffc107',
                    borderRadius: '4px',
                    marginBottom: '8px'
                  }}>
                    <div style={{ marginBottom: '8px', color: '#856404' }}>
                      请先点击"接入会话"按钮才能开始聊天
                    </div>
                    <Button 
                      type="primary" 
                      onClick={() => handleJoinSession(currentSession)}
                    >
                      接入会话
                    </Button>
                  </div>
                )}
                <div className="input-toolbar">
                  <Button 
                    type="text" 
                    icon={<PaperClipOutlined />} 
                    title="附件"
                    disabled={!isJoined}
                  />
                  <Button 
                    type="text" 
                    icon={<SmileOutlined />} 
                    title="表情"
                    disabled={!isJoined}
                  />
                  <Button 
                    type="text" 
                    icon={<FolderOutlined />} 
                    title="快捷回复"
                    disabled={!isJoined}
                  />
                </div>
                <TextArea
                  value={messageInput}
                  onChange={(e) => handleInputChange(e.target.value)}
                  placeholder={isJoined ? "输入回复…（Shift+Enter 换行）" : "请先接入会话后才能发送消息"}
                  autoSize={{ minRows: 2, maxRows: 12 }}
                  disabled={!isJoined}
                  style={{ 
                    resize: 'vertical',
                    minHeight: '60px',
                    maxHeight: '300px'
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
                  <Space>
                    <Button
                      icon={<RobotOutlined />}
                      className="ai-optimize-btn"
                      onClick={handleAiOptimize}
                      disabled={!messageInput.trim() || aiOptimizing || !isJoined}
                      loading={aiOptimizing}
                    >
                      {aiOptimizing ? 'AI优化中…' : 'AI优化'}
                    </Button>
                    <Button
                      type="primary"
                      icon={<SendOutlined />}
                      onClick={handleSendMessage}
                      loading={sendingMessage}
                      disabled={!messageInput.trim() || !isJoined}
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
                        {currentSession.ticket.issueTypes?.map((issueType: any) => (
                          <Tag key={issueType.id} color="blue">
                            {issueType.name}
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
    </div>
  );
};

export default ActivePage;
