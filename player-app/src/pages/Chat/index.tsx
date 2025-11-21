/**
 * 步骤4：AI 引导聊天页面 - V3.0 移动端优先设计
 */
import { useEffect, useState, useRef, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Input, Button, Spin, Modal, Rate } from 'antd';
import { SendOutlined, CustomerServiceOutlined, PoweroffOutlined, CloseOutlined } from '@ant-design/icons';
import { io } from 'socket.io-client';
import { getSession, transferToAgent, closeSession, submitRating } from '../../services/session.service';
import type { TransferToAgentPayload } from '../../services/session.service';
import { sendPlayerMessage } from '../../services/message.service';
import { uploadTicketAttachment } from '../../services/upload.service';
import { useSessionStore } from '../../stores/sessionStore';
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
  const { session, messages, setSession, addMessage, removeMessage, updateSession } =
    useSessionStore();
  const messageApi = useMessage();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const socketRef = useRef<any>(null);
  const previewUrlsRef = useRef<Set<string>>(new Set());
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
      console.log('WebSocket 连接成功');
      setWsConnected(true);
      socket.emit('join-session', sessionId);
    });

    socket.on('connect_error', (error) => {
      console.error('WebSocket 连接错误:', error);
      setWsConnected(false);
    });

    socket.on('disconnect', (reason) => {
      console.log('WebSocket 断开连接:', reason);
      setWsConnected(false);
    });

    socket.on('message', (data: any) => {
      console.log('收到消息:', data);
      // 兼容两种格式：直接是消息对象，或者 { sessionId, message } 格式
      const messageData = data.message || data;
      addMessage(messageData);
      // 如果收到AI消息，清除正在回复状态
      if (messageData.senderType === 'AI') {
        setAiTyping(false);
      }
    });

    socket.on('session-update', (sessionData) => {
      console.log('会话更新:', sessionData);
      updateSession(sessionData);
      if (sessionData.status === 'QUEUED') {
        navigate(`/queue/${sessionId}`);
      }
    });

    socket.on('error', (error) => {
      console.error('WebSocket 错误:', error);
    });

    return () => {
      console.log('清理 WebSocket 连接');
      // 移除所有事件监听器
      socket.removeAllListeners();
      // 断开连接
      socket.disconnect();
      // 清空引用
      socketRef.current = null;
      setWsConnected(false);
    };
  }, [sessionId, addMessage, updateSession, navigate]);


  const handleSend = async () => {
    if (!inputValue.trim() || !sessionId) return;

    const content = inputValue.trim();
    setInputValue('');
    setSending(true);

    try {
      // 先添加玩家消息到界面（乐观更新）
      const playerMessage = {
        id: `temp-${Date.now()}`,
        sessionId,
        senderType: 'PLAYER' as const,
        messageType: 'TEXT' as const,
        content,
        createdAt: new Date().toISOString(),
      };
      addMessage(playerMessage);

      // 设置AI正在回复状态
      setAiTyping(true);

      const response = await sendPlayerMessage(sessionId, content);

      // 移除临时消息
      removeMessage(playerMessage.id);

      if (response?.playerMessage) {
        addMessage(response.playerMessage);
      }
      if (response?.aiMessage) {
        addMessage(response.aiMessage);
        // AI回复后清除正在回复状态
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
      removeMessage(playerMessage.id);
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

  const submitTransferRequest = async (payload: TransferToAgentPayload) => {
    if (!sessionId) return;
    setTransferring(true);
    try {
      const result = await transferToAgent(sessionId, payload);

      // 处理没有在线客服的情况 (result.queued === false)
      if (result.queued === false && result.message) {
        Modal.info({
          title: '当前无客服在线',
          content: result.message,
          okText: '知道了',
        });
        // 注意：这里不 return，让 finally 块执行以重置 transferring 状态
      }

      if (result.queued) {
        messageApi.success('已为您转接人工客服，请稍候');
        updateSession({ 
          status: 'QUEUED',
          allowManualTransfer: false,
        });
        // 延迟一下再跳转，确保状态更新
        setTimeout(() => {
          navigate(`/queue/${sessionId}`);
        }, 500);
      } else {
        messageApi.info(result.message || '您的问题已升级为加急工单');
        // 即使没有排队，也更新会话状态
        if (result.ticketNo) {
          updateSession({ 
            status: 'CLOSED',
            allowManualTransfer: false,
          });
        }
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
    
    console.log('[转人工] 开始转人工请求', {
      sessionId,
      issueTypeId,
      urgency: 'URGENT',
    });
    
    submitTransferRequest({
      urgency: 'URGENT', // 默认紧急
      issueTypeId: issueTypeId || undefined,
      reason: undefined, // 可选，不强制填写
    });
  };

  // 移除 handleSubmitTransferForm，不再需要表单提交

  const [queuePosition, setQueuePosition] = useState<number | null>(null);
  const [ratingModalVisible, setRatingModalVisible] = useState(false);
  const [rating, setRating] = useState(0);
  const [ratingComment, setRatingComment] = useState('');
  const queueIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const [pendingUploads, setPendingUploads] = useState<PendingUpload[]>([]);
  const [showAllQuickActions, setShowAllQuickActions] = useState(false);

  const canTransfer =
    session && session.status !== 'CLOSED' && session.allowManualTransfer !== false;
  const isInputDisabled = sending || uploading || transferring || session?.status === 'CLOSED';
  const showTransferButton = Boolean(canTransfer && session?.status !== 'QUEUED' && session?.status !== 'IN_PROGRESS');
  const isAgentMode = session?.agentId || session?.status === 'IN_PROGRESS';
  const isQueued = session?.status === 'QUEUED';
  const issueTypeOptions = session?.ticket?.issueTypes || [];

  // 处理转人工后的排队逻辑
  useEffect(() => {
    if (isQueued && session?.queuedAt) {
      // 模拟排队位置（实际应从后端获取）
      setQueuePosition(3);
      queueIntervalRef.current = setInterval(() => {
        setQueuePosition((prev) => {
          if (prev === null || prev <= 1) {
            if (queueIntervalRef.current) {
              clearInterval(queueIntervalRef.current);
            }
            return 0;
          }
          return prev - 1;
        });
      }, 2000);
    } else {
      if (queueIntervalRef.current) {
        clearInterval(queueIntervalRef.current);
        queueIntervalRef.current = null;
      }
      setQueuePosition(null);
    }

    return () => {
      if (queueIntervalRef.current) {
        clearInterval(queueIntervalRef.current);
      }
    };
  }, [isQueued, session?.queuedAt]);

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
      isQueued && queuePosition !== null
        ? [
            {
              id: `queue-info-${queuePosition}`,
              sessionId: sessionId || 'queue',
              senderType: 'SYSTEM' as const,
              messageType: 'SYSTEM_NOTICE' as const,
              content: `已为您排队，当前位于第 ${queuePosition} 位，请耐心等待。`,
              createdAt: new Date().toISOString(),
            },
          ]
        : [];

    return [...messages, ...pendingMessages, ...queueMessages];
  }, [messages, pendingUploads, isQueued, queuePosition, sessionId]);

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
            <Button
              type="text"
              icon={<CloseOutlined />}
              onClick={handleCloseChat}
              className="header-close-btn"
            />
          </div>
        </header>

        {/* Queue Banner */}
        {isQueued && queuePosition !== null && (
          <div className="queue-banner-v3">
            <div className="queue-banner-content">
              <Spin size="small" />
              <span>正在转接人工客服...</span>
            </div>
            <span className="queue-position">第 {queuePosition} 位</span>
          </div>
        )}

        {/* Chat Body */}
        <main className="chat-body-v3">
          <div className="chat-messages-wrapper">
            <MessageList
              messages={enhancedMessages}
              aiTyping={aiTyping}
              onRetryUpload={handleRetryUpload}
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
            {isAgentMode && (
              <Button
                size="small"
                icon={<PoweroffOutlined />}
                className="end-btn-v3"
                onClick={handleCloseChat}
                disabled={transferring}
              >
                结束
              </Button>
            )}
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
