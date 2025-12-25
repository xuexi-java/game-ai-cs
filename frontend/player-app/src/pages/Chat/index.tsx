/**
 * 步骤4：AI 引导聊天页面 - V3.0 移动端优先设计
 */
import { useEffect, useState, useRef, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Input, Button, Spin, Modal, Rate, Tag } from 'antd';
import { SendOutlined, CustomerServiceOutlined, PoweroffOutlined, CloseOutlined, HomeOutlined, CopyOutlined } from '@ant-design/icons';
import { io } from 'socket.io-client';
import { getSession, transferToAgent, closeSession, submitRating } from '../../services/session.service';
import type { TransferToAgentPayload } from '../../services/session.service';
import { sendPlayerMessage } from '../../services/message.service';
import { uploadTicketAttachment } from '../../services/upload.service';
import { getTicketByTicketNo, getTicketMessagesByTicketNo, type TicketMessage } from '../../services/ticket.service';
import { useSessionStore } from '../../stores/sessionStore';
import { useTicketStore } from '../../stores/ticketStore';
import dayjs from 'dayjs';
import { API_BASE_URL, WS_URL } from '../../config/api';
import MessageList from '../../components/Chat/MessageList';
import EmojiPicker from '../../components/Chat/EmojiPicker';
import FileUpload from '../../components/Chat/FileUpload';
import NetworkStatus from '../../components/NetworkStatus';
import { useMessage } from '../../hooks/useMessage';
import './index.css';

const { TextArea } = Input;

type PendingUploadStatus = 'UPLOADING' | 'FAILED';

interface PendingUpload {
  id: string;
  file: File;
  previewUrl: string;
  status: PendingUploadStatus;
  createdAt: string;
}

const ChatPage = () => {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const [inputValue, setInputValue] = useState('');
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [transferring, setTransferring] = useState(false);
  // 移除转人工弹窗相关状态
  const [wsConnected, setWsConnected] = useState(false);
  const [aiTyping, setAiTyping] = useState(false);
  const [wsRateLimited, setWsRateLimited] = useState(false);
  const { session, messages, setSession, addMessage, updateMessage, updateSession } =
    useSessionStore();
  const messageApi = useMessage();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const socketRef = useRef<any>(null);
  const previewUrlsRef = useRef<Set<string>>(new Set());
  const wsRateLimitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wsRateLimitedRef = useRef(false);

  // 翻译语言设置 - 记住用户选择的目标语言
  const [preferredTranslationLang, setPreferredTranslationLang] = useState<string>('en'); // 默认英语

  // 加载会话和消息
  useEffect(() => {
    if (!sessionId) return;

    const loadSession = async () => {
      try {
        const sessionData = await getSession(sessionId);
        // 确保消息按时间排序
        if (sessionData.messages && Array.isArray(sessionData.messages)) {
          sessionData.messages = sessionData.messages.sort(
            (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
          );
        }
        setSession(sessionData);
        // setSession 已经会设置 messages，不需要重复添加
      } catch (error) {
        console.error('加载会话失败:', error);
        messageApi.error('加载会话失败');
      }
    };

    loadSession();
  }, [sessionId, setSession, addMessage, messageApi]);

  // 软键盘检测和处理
  useEffect(() => {
    if (typeof window !== 'undefined' && 'visualViewport' in window) {
      const viewport = window.visualViewport;
      const container = document.querySelector('.chat-container-v3');

      const handleViewportChange = () => {
        if (container) {
          const heightDiff = window.innerHeight - viewport.height;
          // 如果高度差大于 150px，认为软键盘已弹出
          if (heightDiff > 150) {
            container.classList.add('keyboard-open');
            // 滚动到底部
            setTimeout(() => {
              messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
            }, 100);
          } else {
            container.classList.remove('keyboard-open');
          }
        }
      };

      viewport.addEventListener('resize', handleViewportChange);
      viewport.addEventListener('scroll', handleViewportChange);

      return () => {
        viewport.removeEventListener('resize', handleViewportChange);
        viewport.removeEventListener('scroll', handleViewportChange);
      };
    }
  }, []);

  // 连接 WebSocket
  useEffect(() => {
    if (!sessionId) return;

    const socket = io(WS_URL, {
      transports: ['websocket', 'polling'], // 支持降级到 polling
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 5,
      timeout: 20000,
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      setWsConnected(true);
      socket.emit('join-session', { sessionId });

      // 设置心跳检测
      const heartbeatInterval = setInterval(() => {
        if (socket.connected) {
          socket.emit('ping');
        }
      }, 20000); // 每20秒发送一次心跳

      // 监听 pong 响应
      socket.on('pong', () => {
        // 心跳正常
      });

      // 清理心跳定时器
      socket.on('disconnect', () => {
        clearInterval(heartbeatInterval);
      });
    });

    socket.on('connect_error', (error) => {
      console.error('WebSocket 连接错误:', error);
      setWsConnected(false);
    });

    socket.on('disconnect', (reason) => {
      setWsConnected(false);
    });

    socket.on('message', (data: any) => {
      // 兼容两种格式：直接是消息对象，或者 { sessionId, message } 格式
      const messageData = data.message || data;
      addMessage(messageData);
      // 如果收到AI消息，清除正在回复状态
      if (messageData.senderType === 'AI') {
        setAiTyping(false);
      }
    });

    socket.on('session-update', (sessionData) => {
      updateSession(sessionData);
      // 当客服接入时，停止AI对话，切换到人工客服模式
      if (sessionData.status === 'IN_PROGRESS' && sessionData.agentId) {
        // 客服已接入，禁用AI对话
        setAiTyping(false);
        // 清除排队状态
        setQueuePosition(null);
        setEstimatedWait(null);
        messageApi.success('客服已接入，现在可以与客服直接对话');
      }
      // 当会话关闭时，提示用户
      if (sessionData.status === 'CLOSED') {
        setAiTyping(false);
        // 清除排队状态
        setQueuePosition(null);
        setEstimatedWait(null);
        messageApi.info('会话已结束');
      }
    });

    // 监听工单状态更新
    socket.on('ticket-update', (ticketData: any) => {
      // 重新加载会话以获取最新状态
      if (sessionId) {
        getSession(sessionId).then((updatedSession) => {
          setSession(updatedSession);
        }).catch((error) => {
          console.error('重新加载会话失败:', error);
        });
      }
    });

    socket.on('error', (error) => {
      if (error?.code === 429001) {
        if (!wsRateLimitedRef.current) {
          messageApi.warning('发送过快，请稍后再试');
        }
        triggerWsRateLimit();
        return;
      }
      console.error('WebSocket 错误:', error);
    });

    return () => {
      // 移除所有事件监听器
      socket.removeAllListeners();
      // 断开连接
      socket.disconnect();
      // 清空引用
      socketRef.current = null;
      setWsConnected(false);
    };
  }, [sessionId, addMessage, updateSession, navigate]);

  useEffect(() => {
    return () => {
      if (wsRateLimitTimerRef.current) {
        clearTimeout(wsRateLimitTimerRef.current);
        wsRateLimitTimerRef.current = null;
      }
    };
  }, []);

  const triggerWsRateLimit = (cooldownMs = 3000) => {
    if (wsRateLimitTimerRef.current) {
      clearTimeout(wsRateLimitTimerRef.current);
    }
    wsRateLimitedRef.current = true;
    setWsRateLimited(true);
    wsRateLimitTimerRef.current = setTimeout(() => {
      wsRateLimitedRef.current = false;
      setWsRateLimited(false);
      wsRateLimitTimerRef.current = null;
    }, cooldownMs);
  };

  const handleSend = async () => {
    if (!inputValue.trim() || !sessionId) return;
    if (wsRateLimitedRef.current) {
      messageApi.warning('发送过快，请稍后再试');
      return;
    }

    const content = inputValue.trim();
    setInputValue('');
    setSending(true);

    try {
      // 设置AI正在回复状态（仅在AI模式下，客服接入后不显示AI正在回复）
      const isAgentJoined = session?.status === 'IN_PROGRESS' && session?.agentId;
      if (!isAgentJoined) {
        setAiTyping(true);
      }

      // 发送消息（后端会根据会话状态决定是否触发AI回复）
      const response = await sendPlayerMessage(sessionId, content);

      if (response?.playerMessage) {
        addMessage(response.playerMessage);
      } else {
        // 兜底：后端未返回消息时，也保证界面能显示玩家发送的内容
        addMessage({
          id: `local-${Date.now()}`,
          sessionId,
          senderType: 'PLAYER',
          messageType: 'TEXT',
          content,
          createdAt: new Date().toISOString(),
        });
      }

      // 如果客服已接入，不会收到AI回复
      if (response?.aiMessage && !isAgentJoined) {
        addMessage(response.aiMessage);
        setAiTyping(false);
      } else if (isAgentJoined) {
        // 客服已接入，消息已发送给客服，清除AI状态
        setAiTyping(false);
      } else {
        // 如果没有立即收到AI回复，等待WebSocket消息
        // 状态会在收到AI消息时清除
      }

      if (response?.difyStatus) {
        updateSession({ difyStatus: String(response.difyStatus) });
      }
    } catch (error) {
      console.error('发送消息失败:', error);
      messageApi.error('发送消息失败');
      setAiTyping(false);
    } finally {
      setSending(false);
    }
  };

  const handleEmojiSelect = (emoji: string) => {
    setInputValue((prev) => prev + emoji);
  };

  const handleQuickReplySelect = (reply: string) => {
    setInputValue(reply);
  };

  const registerPreviewUrl = (url: string) => {
    previewUrlsRef.current.add(url);
  };

  const releasePreviewUrl = (url: string) => {
    if (previewUrlsRef.current.has(url)) {
      URL.revokeObjectURL(url);
      previewUrlsRef.current.delete(url);
    }
  };

  const uploadPendingFile = async (pending: PendingUpload) => {
    if (!sessionId || !session?.ticket?.id) return;

    setUploading(true);
    try {
      const uploadResult = await uploadTicketAttachment(pending.file, {
        ticketId: session.ticket.id,
      });
      await sendPlayerMessage(sessionId, uploadResult.fileUrl, 'IMAGE');
      setPendingUploads((prev) => prev.filter((item) => item.id !== pending.id));
      releasePreviewUrl(pending.previewUrl);
      messageApi.success('图片发送成功');
    } catch (error) {
      console.error('文件上传失败:', error);
      setPendingUploads((prev) =>
        prev.map((item) =>
          item.id === pending.id ? { ...item, status: 'FAILED' } : item
        )
      );
      messageApi.error('文件上传失败');
    } finally {
      setUploading(false);
    }
  };

  const handleFileSelect = async (file: File) => {
    if (!sessionId || !session?.ticket?.id) return;

    const previewUrl = URL.createObjectURL(file);
    const pending: PendingUpload = {
      id: `pending-upload-${Date.now()}`,
      file,
      previewUrl,
      status: 'UPLOADING',
      createdAt: new Date().toISOString(),
    };
    registerPreviewUrl(previewUrl);
    setPendingUploads((prev) => [...prev, pending]);
    await uploadPendingFile(pending);
  };

  const handleRetryUpload = async (pendingId: string) => {
    const pending = pendingUploads.find((item) => item.id === pendingId);
    if (!pending) return;
    setPendingUploads((prev) =>
      prev.map((item) =>
        item.id === pendingId ? { ...item, status: 'UPLOADING' } : item
      )
    );
    await uploadPendingFile(pending);
  };

  // 复制工单号函数
  const handleCopyTicketNo = (ticketNo: string) => {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(ticketNo)
        .then(() => messageApi.success('工单号已复制到剪贴板'))
        .catch(() => messageApi.error('复制失败，请手动复制'));
    } else {
      // 降级方案：使用 document.execCommand
      const textArea = document.createElement('textarea');
      textArea.value = ticketNo;
      document.body.appendChild(textArea);
      textArea.select();
      try {
        document.execCommand('copy');
        messageApi.success('工单号已复制到剪贴板');
      } catch {
        messageApi.error('复制失败，请手动复制');
      }
      document.body.removeChild(textArea);
    }
  };

  const submitTransferRequest = async (payload: TransferToAgentPayload) => {
    if (!sessionId) return;
    setTransferring(true);
    try {
      const result = await transferToAgent(sessionId, payload);

      // 处理没有在线客服的情况：转为加急工单
      if (result.convertedToTicket && result.ticketNo) {
        // 加载工单信息和消息
        try {
          const [ticket, messages] = await Promise.all([
            getTicketByTicketNo(result.ticketNo),
            getTicketMessagesByTicketNo(result.ticketNo),
          ]);

          // 获取工单状态显示
          const getStatusText = (status: string) => {
            const statusMap: Record<string, { text: string; color: string }> = {
              WAITING: { text: '待人工', color: 'orange' },
              IN_PROGRESS: { text: '处理中', color: 'blue' },
              RESOLVED: { text: '已解决', color: 'green' },
            };
            return statusMap[status] || { text: '未知', color: 'default' };
          };

          const statusInfo = getStatusText(ticket.status);
          const agentMessages = messages.filter((msg: TicketMessage) => msg.senderId && msg.sender);

          Modal.info({
            title: '已收到您的反馈',
            width: 600,
            content: (
              <div style={{ maxHeight: '60vh', overflowY: 'auto' }}>
                <p style={{ marginBottom: 12 }}>
                  已经接到您的反馈，我们会尽快处理，目前暂时没有人工客服在线。
                </p>
                {result.ticketNo && (
                  <div style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontWeight: 'bold', fontSize: '16px' }}>
                      工单号：{result.ticketNo}
                    </span>
                    <Button
                      type="text"
                      size="small"
                      icon={<CopyOutlined />}
                      onClick={() => handleCopyTicketNo(result.ticketNo!)}
                    >
                      复制
                    </Button>
                  </div>
                )}

                {/* 工单状态 */}
                <div style={{ marginBottom: 16, padding: '12px', background: '#f5f5f5', borderRadius: '4px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: 8 }}>
                    <span style={{ fontWeight: 500 }}>工单状态：</span>
                    <span style={{
                      color: statusInfo.color === 'orange' ? '#fa8c16' :
                        statusInfo.color === 'blue' ? '#1890ff' :
                          statusInfo.color === 'green' ? '#52c41a' : '#666',
                      fontWeight: 500
                    }}>
                      {statusInfo.text}
                    </span>
                  </div>
                  {ticket.description && (
                    <div style={{ marginTop: 8 }}>
                      <span style={{ fontWeight: 500 }}>问题描述：</span>
                      <div style={{ marginTop: 4, color: '#666' }}>{ticket.description}</div>
                    </div>
                  )}
                </div>

                {/* 客服留言 */}
                {agentMessages.length > 0 ? (
                  <div style={{ marginTop: 16 }}>
                    <div style={{ fontWeight: 500, marginBottom: 8, fontSize: '14px' }}>
                      客服留言 ({agentMessages.length}条)：
                    </div>
                    <div style={{
                      maxHeight: '200px',
                      overflowY: 'auto',
                      border: '1px solid #e8e8e8',
                      borderRadius: '4px',
                      padding: '12px',
                      background: '#fafafa'
                    }}>
                      {agentMessages.map((msg: TicketMessage) => (
                        <div key={msg.id} style={{ marginBottom: 12, paddingBottom: 12, borderBottom: '1px solid #e8e8e8' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                            <span style={{ fontWeight: 500, color: '#1890ff' }}>
                              {msg.sender?.realName || msg.sender?.username || '客服'}
                            </span>
                            <span style={{ color: '#999', fontSize: '12px' }}>
                              {new Date(msg.createdAt).toLocaleString('zh-CN')}
                            </span>
                          </div>
                          <div style={{ color: '#333', lineHeight: '1.6' }}>
                            {msg.content}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div style={{
                    marginTop: 16,
                    padding: '12px',
                    background: '#fff7e6',
                    borderRadius: '4px',
                    border: '1px solid #ffe58f',
                    color: '#666'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span>💬</span>
                      <span>再次提交区服和游戏ID再次验证时即可查看反馈。</span>
                    </div>
                  </div>
                )}
              </div>
            ),
            okText: '知道了',
          });
        } catch (error) {
          console.error('加载工单信息失败:', error);
          // 如果加载失败，显示简化版弹窗
          Modal.info({
            title: '已收到您的反馈',
            content: (
              <div>
                <p>已经接到您的反馈，我们会尽快处理，目前暂时没有人工客服在线。</p>
                {result.ticketNo && (
                  <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontWeight: 'bold' }}>
                      工单号：{result.ticketNo}
                    </span>
                    <Button
                      type="text"
                      size="small"
                      icon={<CopyOutlined />}
                      onClick={() => handleCopyTicketNo(result.ticketNo!)}
                    >
                      复制
                    </Button>
                  </div>
                )}
                <p style={{ marginTop: 8, color: '#666' }}>
                  客服上线后会优先处理您的工单，请耐心等待。
                </p>
              </div>
            ),
            okText: '知道了',
          });
        }

        // 更新会话状态为已关闭
        updateSession({
          status: 'CLOSED',
          allowManualTransfer: false,
          queuePosition: null,
          estimatedWaitTime: null,
        });
        setQueuePosition(null);
        setEstimatedWait(null);
        return;
      }

      // 有在线客服：正常进入排队
      if (result.queued) {
        messageApi.success('已为您转接人工客服，请稍候');
        updateSession({
          status: 'QUEUED',
          allowManualTransfer: false,
          queuePosition: result.queuePosition ?? queuePosition ?? null,
          estimatedWaitTime: result.estimatedWaitTime ?? estimatedWait ?? null,
          queuedAt: new Date().toISOString(),
        });
        setQueuePosition(result.queuePosition ?? queuePosition ?? null);
        setEstimatedWait(result.estimatedWaitTime ?? estimatedWait ?? null);
        // 不跳转页面，在聊天界面显示排队状态
        // 玩家可以继续查看聊天历史，等待客服接入
      } else {
        // 其他情况（理论上不应该到这里）
        messageApi.info(result.message || '转人工处理中');
      }
    } catch (error: any) {
      console.error('转人工失败:', error);
      const errorMessage = error?.response?.data?.message || error?.message || '转人工失败，请重试';
      // 如果是"没有在线客服"的特殊情况（不排队）
      if (errorMessage.includes('客服上班时间表内咨询')) {
        Modal.info({
          title: '当前无客服在线',
          content: errorMessage,
          okText: '知道了',
        });
      } else {
        messageApi.error(errorMessage);
      }
    } finally {
      setTransferring(false);
    }
  };

  const handleTransferToAgent = () => {
    if (!sessionId) {
      messageApi.warning('会话ID不存在，无法转人工');
      return;
    }

    // 检查是否已经可以转人工
    if (!canTransfer) {
      messageApi.warning('当前无法转人工，会话可能已结束或正在处理中');
      return;
    }

    // 检查是否正在转人工中
    if (transferring) {
      messageApi.info('正在转人工中，请稍候...');
      return;
    }

    // 直接提交转人工请求，不显示弹窗
    // 使用工单已有的问题类型，如果没有则使用默认值
    const issueTypeId = session?.ticket?.issueTypes?.[0]?.id;

    submitTransferRequest({
      urgency: 'URGENT', // 默认紧急
      issueTypeId: issueTypeId || undefined,
      reason: undefined, // 可选，不强制填写
    });
  };

  // 移除 handleSubmitTransferForm，不再需要表单提交

  const [queuePosition, setQueuePosition] = useState<number | null>(null);
  const [estimatedWait, setEstimatedWait] = useState<number | null>(null);
  const [ratingModalVisible, setRatingModalVisible] = useState(false);
  const [rating, setRating] = useState(0);
  const [ratingComment, setRatingComment] = useState('');
  const queueIntervalRef = useRef<number | null>(null);
  const [pendingUploads, setPendingUploads] = useState<PendingUpload[]>([]);
  const [showAllQuickActions, setShowAllQuickActions] = useState(false);

  const canTransfer =
    session && session.status !== 'CLOSED' && session.allowManualTransfer !== false;
  const isInputDisabled =
    sending ||
    uploading ||
    transferring ||
    wsRateLimited ||
    session?.status === 'CLOSED' ||
    session?.ticket?.status === 'RESOLVED';
  const showTransferButton = Boolean(
    canTransfer &&
    session?.status !== 'QUEUED' &&
    session?.status !== 'IN_PROGRESS' &&
    session?.status !== 'CLOSED' // 已关闭的会话不能转人工
  );
  const isAgentMode = session?.agentId || session?.status === 'IN_PROGRESS';
  // 如果状态是 QUEUED，说明正在排队（即使 queuePosition 可能暂时为 null）
  const isQueued = session?.status === 'QUEUED';
  // 如果状态是 PENDING，说明正在 AI 对话阶段
  const isAIChatting = session?.status === 'PENDING';
  // 显示结束会话按钮的条件：AI对话中、排队中、或客服已接入
  const showEndSessionButton = isAIChatting || isQueued || isAgentMode;
  const issueTypeOptions = session?.ticket?.issueTypes || [];

  // 获取工单状态显示
  const getTicketStatusInfo = () => {
    if (!session?.ticket) return null;
    const status = session.ticket.status;
    const statusMap: Record<string, { text: string; color: string }> = {
      WAITING: { text: '待人工', color: 'orange' },
      IN_PROGRESS: { text: '处理中', color: 'blue' },
      RESOLVED: { text: '已解决', color: 'green' },
    };
    return statusMap[status] || null;
  };

  const ticketStatusInfo = getTicketStatusInfo();

  // 根据最新会话信息同步排队状态
  useEffect(() => {
    if (session?.queuePosition !== undefined) {
      setQueuePosition(
        session.queuePosition === null || session.queuePosition === undefined
          ? null
          : session.queuePosition
      );
    }
    if (session?.estimatedWaitTime !== undefined) {
      setEstimatedWait(
        session.estimatedWaitTime === null || session.estimatedWaitTime === undefined
          ? null
          : session.estimatedWaitTime
      );
    }
  }, [session?.queuePosition, session?.estimatedWaitTime]);

  // 处理转人工后的排队逻辑（无后端排队数据时启用本地模拟）
  useEffect(() => {
    const shouldSimulate =
      isQueued &&
      session?.queuedAt &&
      (session.queuePosition === undefined || session.queuePosition === null);

    if (shouldSimulate) {
      setQueuePosition((prev) => prev ?? 3);
      queueIntervalRef.current = setInterval(() => {
        setQueuePosition((prev) => {
          if (prev === null || prev <= 1) {
            if (queueIntervalRef.current) {
              clearInterval(queueIntervalRef.current);
            }
            return 1;
          }
          return prev - 1;
        });
      }, 5000);
    } else if (queueIntervalRef.current) {
      clearInterval(queueIntervalRef.current);
      queueIntervalRef.current = null;
    }

    return () => {
      if (queueIntervalRef.current) {
        clearInterval(queueIntervalRef.current);
        queueIntervalRef.current = null;
      }
    };
  }, [isQueued, session?.queuedAt, session?.queuePosition]);

  const handleCloseChat = async () => {
    if (!sessionId) return;
    setTransferring(true);
    try {
      await closeSession(sessionId);
      messageApi.success('会话已结束');
      setRatingModalVisible(true);
    } catch (error) {
      console.error('结束会话失败:', error);
      messageApi.error('结束会话失败');
      setTransferring(false);
    }
  };

  const handleSubmitRating = async () => {
    if (rating === 0) {
      messageApi.warning('请选择评分');
      return;
    }

    if (!sessionId) return;

    try {
      await submitRating({
        sessionId,
        rating,
        tags: [],
        comment: ratingComment
      });
      messageApi.success(`感谢您的评价：${rating} 星`);
      setRatingModalVisible(false);
      setRating(0);
      setRatingComment('');
      navigate('/');
    } catch (error) {
      console.error('提交评分失败:', error);
      messageApi.error('提交评分失败，请重试');
    }
  };

  const handleSkipRating = () => {
    setRatingModalVisible(false);
    navigate('/');
  };

  // 获取快速操作按钮（从消息的 metadata 中提取）
  const quickActions = useMemo(() => {
    const lastAIMessage = [...messages].reverse().find((m) => m.senderType === 'AI');
    if (lastAIMessage?.metadata?.suggestedOptions) {
      return (lastAIMessage.metadata as any).suggestedOptions as string[];
    }
    // 默认快速操作
    if (session?.status === 'PENDING' && !isAgentMode) {
      return ['查询订单', '申请退款', '转人工'];
    }
    return [];
  }, [messages, session?.status, isAgentMode]);

  const actionableQuickActions = useMemo(() => {
    return quickActions.filter((action) => (action === '转人工' ? Boolean(canTransfer) : true));
  }, [quickActions, canTransfer]);

  const hasExtraQuickActions = actionableQuickActions.length > 3;
  const displayedQuickActions =
    hasExtraQuickActions && !showAllQuickActions
      ? actionableQuickActions.slice(0, 3)
      : actionableQuickActions;

  useEffect(() => {
    if (!hasExtraQuickActions && showAllQuickActions) {
      setShowAllQuickActions(false);
    }
  }, [hasExtraQuickActions, showAllQuickActions]);

  const displayQueuePositionValue =
    queuePosition ?? session?.queuePosition ?? null;
  const displayEstimatedWaitValue =
    estimatedWait ??
    session?.estimatedWaitTime ??
    (displayQueuePositionValue ? Math.max(displayQueuePositionValue * 3, 3) : null);

  const enhancedMessages = useMemo(() => {
    const pendingMessages = pendingUploads.map((upload) => ({
      id: upload.id,
      sessionId: sessionId || upload.id,
      senderType: 'PLAYER' as const,
      messageType: 'IMAGE' as const,
      content: upload.previewUrl,
      createdAt: upload.createdAt,
      metadata: {
        uploadStatus: upload.status,
        pendingUploadId: upload.id,
        isLocalPreview: true,
      },
    }));

    const queueMessages =
      isQueued && displayQueuePositionValue !== null
        ? [
          {
            id: `queue-info-${displayQueuePositionValue}`,
            sessionId: sessionId || 'queue',
            senderType: 'SYSTEM' as const,
            messageType: 'SYSTEM_NOTICE' as const,
            content: `已为您排队，当前位于第 ${displayQueuePositionValue} 位${displayEstimatedWaitValue
              ? `，预计等待约 ${Math.max(displayEstimatedWaitValue, 1)} 分钟`
              : ''
              }。请保持在线，客服稍后将接入。`,
            createdAt: new Date().toISOString(),
          },
        ]
        : [];

    return [...messages, ...pendingMessages, ...queueMessages];
  }, [
    messages,
    pendingUploads,
    isQueued,
    displayQueuePositionValue,
    displayEstimatedWaitValue,
    sessionId,
  ]);

  // 滚动到底部（考虑本地占位消息）
  useEffect(() => {
    if (enhancedMessages.length === 0) return;
    const timer = setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
    return () => clearTimeout(timer);
  }, [enhancedMessages.length]);

  useEffect(() => {
    return () => {
      previewUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
      previewUrlsRef.current.clear();
    };
  }, []);

  // 监听页面关闭/刷新事件，自动结束会话
  useEffect(() => {
    if (!sessionId) return;

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      // 只有在客服已接入或排队中时才需要结束会话
      if (session?.status === 'IN_PROGRESS' || session?.status === 'QUEUED') {
        // 使用 sendBeacon 发送请求，确保在页面关闭时也能发送
        try {
          // sendBeacon 需要发送正确的请求格式
          const url = `${API_BASE_URL}/sessions/${sessionId}/close-player`;
          const success = navigator.sendBeacon(url, '');
          if (!success) {
            // 如果 sendBeacon 失败，尝试使用 fetch（同步）
            fetch(url, {
              method: 'PATCH',
              keepalive: true,
              headers: {
                'Content-Type': 'application/json',
              },
            }).catch(() => {
              // 忽略错误，因为页面正在关闭
            });
          }
        } catch (error) {
          console.error('发送结束会话请求失败:', error);
        }
      }
    };

    // 监听页面卸载事件
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [sessionId, session?.status]);

  if (!session) {
    return (
      <div className="chat-loading-container">
        <Spin size="large" />
        <div className="chat-loading-text">加载会话中...</div>
      </div>
    );
  }

  return (
    <>
      <NetworkStatus wsConnected={wsConnected} />
      <div className="chat-container-v3">
        {/* Header */}
        <header className={`chat-header-v3 ${isAgentMode ? 'header-agent' : 'header-ai'}`}>
          <div className="header-left">
            <div className="header-avatar-wrapper">
              <div className={`header-avatar ${isAgentMode ? 'avatar-agent' : 'avatar-ai'}`}>
                {isAgentMode ? <CustomerServiceOutlined /> : <span>AI</span>}
              </div>
              <span className="status-dot online"></span>
            </div>
            <div className="header-info">
              <h1 className="header-name">
                {isAgentMode
                  ? session.agent?.realName || session.agent?.username || '客服'
                  : 'AI 助手'}
              </h1>
              <p className="header-status">
                {isAgentMode ? '为您服务中' : '在线'}
              </p>
            </div>
          </div>
          <div className="header-actions">
            {session?.ticket && (
              <>
                <Button
                  type="text"
                  icon={<HomeOutlined />}
                  onClick={() => navigate('/')}
                  className="header-home-btn"
                >
                  返回主页
                </Button>
                {ticketStatusInfo && (
                  <Tag color={ticketStatusInfo.color} className="header-status-tag">
                    {ticketStatusInfo.text}
                  </Tag>
                )}
              </>
            )}
            <Button
              type="text"
              icon={<CloseOutlined />}
              onClick={handleCloseChat}
              className="header-close-btn"
            />
          </div>
        </header>

        {/* Queue Banner */}
        {isQueued && (
          <div className="queue-banner-v3">
            <div className="queue-banner-content">
              <Spin size="small" />
              <span>正在为您转接人工客服...</span>
            </div>
            {displayQueuePositionValue !== null && displayQueuePositionValue > 0 ? (
              <span className="queue-position">
                当前排队位置: 第 {displayQueuePositionValue} 位
                {displayEstimatedWaitValue && displayEstimatedWaitValue > 0
                  ? ` · 预计等待时间: 约 ${Math.max(displayEstimatedWaitValue, 1)} 分钟`
                  : ''}
              </span>
            ) : (
              <span className="queue-position">
                正在排队中，请稍候...
              </span>
            )}
          </div>
        )}

        {/* Chat Body */}
        <main className="chat-body-v3">
          <div className="chat-messages-wrapper">
            <MessageList
              messages={enhancedMessages}
              aiTyping={aiTyping}
              onRetryUpload={handleRetryUpload}
              onMessageUpdate={(updatedMessage) => {
                updateMessage(updatedMessage.id, updatedMessage);
              }}
              preferredTargetLang={preferredTranslationLang}
              isTicketChat={false}
            />
            <div ref={messagesEndRef} />
          </div>
        </main>

        {/* Footer */}
        <footer className="chat-footer-v3">
          {/* Quick Actions */}
          {actionableQuickActions.length > 0 && !isAgentMode && !isQueued && (
            <div className="quick-actions-v3">
              {displayedQuickActions.map((action, index) => (
                <button
                  key={index}
                  className="quick-action-btn"
                  onClick={() => {
                    if (action === '转人工') {
                      handleTransferToAgent();
                    } else {
                      setInputValue(action);
                    }
                  }}
                >
                  {action}
                </button>
              ))}
              {hasExtraQuickActions && (
                <button
                  className="quick-action-btn quick-action-more"
                  onClick={() => setShowAllQuickActions((prev) => !prev)}
                >
                  {showAllQuickActions ? '收起' : '更多'}
                </button>
              )}
            </div>
          )}

          {/* Toolbar */}
          <div className="chat-toolbar-v3">
            <div className="toolbar-left-v3">
              <FileUpload onFileSelect={handleFileSelect} />
              <EmojiPicker onEmojiSelect={handleEmojiSelect} />
            </div>
            <div className="toolbar-right-v3">
              {showTransferButton && (
                <Button
                  size="small"
                  icon={<CustomerServiceOutlined />}
                  className="transfer-btn-v3"
                  onClick={handleTransferToAgent}
                  loading={transferring}
                  disabled={transferring}
                >
                  转人工
                </Button>
              )}
              {/* AI对话中、排队中或客服已接入时显示结束按钮 */}
              {showEndSessionButton && (
                <Button
                  size="small"
                  icon={<PoweroffOutlined />}
                  className="end-btn-v3"
                  onClick={handleCloseChat}
                  disabled={transferring || session?.status === 'CLOSED'}
                >
                  结束会话
                </Button>
              )}
            </div>
          </div>

          {/* Input Area */}
          <div className="chat-input-wrapper-v3">
            <TextArea
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onPressEnter={(e) => {
                if (!e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder="请输入..."
              autoSize={{ minRows: 1, maxRows: 4 }}
              disabled={isInputDisabled}
              className="chat-input-v3"
            />
            <Button
              type="primary"
              icon={<SendOutlined />}
              onClick={handleSend}
              loading={sending}
              disabled={!inputValue.trim() || isInputDisabled}
              className="send-btn-v3"
            />
          </div>

          {/* Disabled Overlay */}
          {session?.status === 'CLOSED' && (
            <div className="footer-disabled-overlay">
              <span>会话已结束</span>
            </div>
          )}
        </footer>

        {/* 转人工弹窗已移除，直接提交转人工请求 */}

        {/* Rating Modal */}
        <Modal
          open={ratingModalVisible}
          onCancel={handleSkipRating}
          footer={null}
          closable={false}
          className="rating-modal-v3"
          width="100%"
          style={{ maxWidth: '100%', top: 'auto', bottom: 0, padding: 0 }}
        >
          <div className="rating-content-v3">
            <div className="rating-handle"></div>
            <h3 className="rating-title">服务评价</h3>
            <p className="rating-subtitle">
              请对客服 <span className="agent-name">{session.agent?.realName || session.agent?.username || '007'}</span> 的服务打分
            </p>
            <div className="rating-stars-v3">
              <Rate
                value={rating}
                onChange={setRating}
                allowClear
                style={{ fontSize: 32 }}
              />
            </div>
            <TextArea
              value={ratingComment}
              onChange={(e) => setRatingComment(e.target.value)}
              placeholder="请输入您的评价（可选）"
              rows={3}
              className="rating-comment-v3"
            />
            <div className="rating-actions-v3">
              <Button
                type="primary"
                onClick={handleSubmitRating}
                className="rating-submit-btn"
                disabled={rating === 0}
              >
                提交
              </Button>
              <Button onClick={handleSkipRating} className="rating-skip-btn">
                暂不评价
              </Button>
            </div>
          </div>
        </Modal>
      </div>
    </>
  );
};

export default ChatPage;
