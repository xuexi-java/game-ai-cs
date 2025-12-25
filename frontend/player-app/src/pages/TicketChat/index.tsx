/**
 * 工单异步聊天页面 - 与 Chat 页面保持一致的设计
 */
import { useEffect, useState, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { Input, Button, Spin, message as antdMessage, Tag, Modal } from 'antd';
import { SendOutlined, UserOutlined, CheckCircleOutlined } from '@ant-design/icons';
import { io, Socket } from 'socket.io-client';
import {
  getTicketByToken,
  getTicketMessagesByToken,
  sendTicketMessageByToken,
  updateTicketStatus,
  type TicketMessage,
} from '../../services/ticket.service';
import { getSessionMessages } from '../../services/message.service';
import { closeSession, getActiveSessionByTicket } from '../../services/session.service';
import type { Message, TicketDetail } from '../../types';
import MessageList from '../../components/Chat/MessageList';
import { WS_URL, API_BASE_URL } from '../../config/api';
import '../Chat/index.css'; // 使用 Chat 页面的样式

const { TextArea } = Input;

const TicketChatPage = () => {
  const { token } = useParams<{ token: string }>();
  const [ticket, setTicket] = useState<TicketDetail | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [wsConnected, setWsConnected] = useState(false);
  const [playerLanguage, setPlayerLanguage] = useState<string | undefined>(undefined);
  const [showResolveModal, setShowResolveModal] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [showExitModal, setShowExitModal] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const socketRef = useRef<Socket | null>(null);
  const tempMessageIdRef = useRef<string | null>(null); // 跟踪临时消息 ID
  const resolvedMessageShownRef = useRef(false); // 跟踪是否已显示"工单已解决"消息

  // 将 TicketMessage 转换为 Message 类型
  const convertTicketMessageToMessage = (ticketMsg: TicketMessage): Message => {
    const isPlayer = !ticketMsg.senderId; // 没有 senderId 表示是玩家消息
    return {
      id: ticketMsg.id,
      sessionId: ticketMsg.ticketId,
      senderType: isPlayer ? 'PLAYER' : 'AGENT',
      messageType: 'TEXT',
      content: ticketMsg.content,
      metadata: (ticketMsg as any).metadata || {}, // 包含翻译信息等metadata
      createdAt: ticketMsg.createdAt,
    };
  };

  // 获取工单状态显示文本
  const getStatusText = (status: string) => {
    const statusMap: Record<string, { text: string; color: string }> = {
      WAITING: { text: '待人工', color: 'orange' },
      IN_PROGRESS: { text: '处理中', color: 'processing' },
      RESOLVED: { text: '已解决', color: 'success' },
    };
    return statusMap[status] || { text: '未知', color: 'default' };
  };

  // 加载工单和消息
  useEffect(() => {
    if (!token) return;

    const loadData = async () => {
      setLoading(true);
      try {
        // 加载工单数据
        const ticketData = await getTicketByToken(token);
        setTicket(ticketData);

        // ✅ 修复：优先使用会话消息，避免重复
        let finalMessages: Message[] = [];
        
        if (ticketData.sessions && ticketData.sessions.length > 0) {
          const session = ticketData.sessions[0];
          
          // 提取玩家语言
          if (session.metadata && typeof session.metadata === 'object') {
            const metadata = session.metadata as any;
            if (metadata.playerLanguage) {
              setPlayerLanguage(metadata.playerLanguage);
            }
          }
          
          // 优先使用会话消息
          if (session.messages && Array.isArray(session.messages) && session.messages.length > 0) {
            // 将会话消息转换为 Message 格式
            finalMessages = session.messages.map((msg: any) => ({
              id: msg.id,
              sessionId: session.id,
              senderType: msg.senderType,
              messageType: msg.messageType || 'TEXT',
              content: msg.content,
              metadata: msg.metadata || {},
              createdAt: msg.createdAt,
            }));
          } else {
            // 如果后端没有返回消息，主动调用 API 获取会话消息
            try {
              const apiMessages = await getSessionMessages(session.id);
              if (apiMessages && apiMessages.length > 0) {
                finalMessages = apiMessages.map((msg: any) => ({
                  id: msg.id,
                  sessionId: session.id,
                  senderType: msg.senderType,
                  messageType: msg.messageType || 'TEXT',
                  content: msg.content,
                  metadata: msg.metadata || {},
                  createdAt: msg.createdAt,
                }));
              }
            } catch (error) {
              console.error('[工单聊天] 获取会话消息失败:', error);
            }
          }
        }

        // 如果没有会话消息，才加载工单消息
        if (finalMessages.length === 0) {
          const ticketMessages = await getTicketMessagesByToken(token);
          finalMessages = ticketMessages.map(convertTicketMessageToMessage);
        }
        
        // 按时间排序
        finalMessages.sort(
          (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        );
        
        setMessages(finalMessages);
      } catch (error: any) {
        console.error('加载数据失败:', error);
        antdMessage.error(error?.response?.data?.message || '加载数据失败，请刷新重试');
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [token]);

  // 连接 WebSocket 接收实时消息
  useEffect(() => {
    if (!ticket?.id) return;

    const socket = io(WS_URL, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 5,
      timeout: 20000,
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      setWsConnected(true);
      // 加入工单房间
      socket.emit('join-ticket', { ticketId: ticket.id });
    });

    socket.on('connect_error', (error) => {
      console.error('WebSocket 连接错误:', error);
      setWsConnected(false);
    });

    socket.on('disconnect', (reason) => {
      setWsConnected(false);
    });

    // 接收工单消息
    socket.on('ticket-message', (ticketMsg: TicketMessage) => {
      const convertedMessage = convertTicketMessageToMessage(ticketMsg);

      setMessages((prev) => {
        // 检查是否已存在该消息（避免重复）- 使用 ID 和内容双重检查
        const existsById = prev.some((msg) => msg.id === convertedMessage.id);
        if (existsById) {
          return prev;
        }

        // 如果有临时消息，尝试替换它（通过内容匹配）
        if (tempMessageIdRef.current) {
          const tempIndex = prev.findIndex((msg) => msg.id === tempMessageIdRef.current);
          if (tempIndex !== -1) {
            const tempMsg = prev[tempIndex];
            // 如果临时消息的内容和发送者类型匹配，则替换
            if (
              tempMsg.content === convertedMessage.content &&
              tempMsg.senderType === convertedMessage.senderType
            ) {
              tempMessageIdRef.current = null;
              return prev.map((msg, index) =>
                index === tempIndex ? convertedMessage : msg
              );
            }
          }
        }

        // 检查是否有相同内容的消息（避免重复添加）
        const existsByContent = prev.some(
          (msg) =>
            msg.content === convertedMessage.content &&
            msg.senderType === convertedMessage.senderType &&
            Math.abs(new Date(msg.createdAt).getTime() - new Date(convertedMessage.createdAt).getTime()) < 5000 // 5秒内的相同消息视为重复
        );
        if (existsByContent) {
          return prev;
        }

        // 添加新消息
        return [...prev, convertedMessage];
      });
    });

    // 监听工单状态更新
    socket.on('ticket-update', (data: Partial<TicketDetail>) => {
      setTicket((prev) => {
        if (!prev) return null;
        return { ...prev, ...data };
      });
    });

    // 监听会话状态更新（如果工单关联了会话）
    socket.on('session-update', (sessionData: any) => {
      if (sessionData.status === 'CLOSED') {
        setTicket((prev) => (prev ? { ...prev, status: 'RESOLVED' } : null));
      }
    });

    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    };
  }, [ticket?.id]);

  // 监听工单状态变化，显示提示消息
  useEffect(() => {
    if (ticket?.status === 'RESOLVED' && !resolvedMessageShownRef.current) {
      resolvedMessageShownRef.current = true;
      antdMessage.info('工单已解决');
    } else if (ticket?.status !== 'RESOLVED') {
      // 如果状态不是已解决，重置标记（允许再次显示）
      resolvedMessageShownRef.current = false;
    }
  }, [ticket?.status]);

  // 自动滚动到底部
  useEffect(() => {
    if (messages.length > 0) {
      const timer = setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [messages]);

  const handleExitClick = () => {
    // 显示退出确认 Modal
    setShowExitModal(true);
  };

  const handleConfirmExit = async () => {
    if (!ticket?.id) return;

    try {
      // 直接断开 WebSocket 并返回主页，不关闭工单
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
      
      antdMessage.info('返回主页');
      setTimeout(() => {
        window.location.href = '/identity-check';
      }, 500);
    } catch (error) {
      console.error('返回主页失败:', error);
      antdMessage.error('操作失败');
    } finally {
      setShowExitModal(false);
    }
  };

  const handleResolveTicket = async () => {
    if (!ticket?.id) return;

    setResolving(true);
    try {
      // 1. 先尝试从工单数据中获取会话ID
      let sessionId = ticket.sessions?.[0]?.id;

      // 2. 如果没有找到，通过 API 查询活跃会话
      if (!sessionId) {
        try {
          const activeSession = await getActiveSessionByTicket(ticket.id);
          sessionId = activeSession?.id;
        } catch (error) {
          // 查询失败，将直接更新工单状态
        }
      }

      // 3. 如果有活跃会话，调用 close-player 接口（会同时关闭会话和更新工单）
      if (sessionId) {
        await closeSession(sessionId);
        antdMessage.success('工单已关闭');
        
        // 断开 WebSocket 连接并返回主页
        if (socketRef.current) {
          socketRef.current.disconnect();
          socketRef.current = null;
        }
        
        setTimeout(() => {
          window.location.href = '/identity-check';
        }, 1000);
      } else {
        // 4. 如果没有活跃会话（客服不在线），直接更新工单状态
        await updateTicketStatus(ticket.id, 'RESOLVED');
        antdMessage.success('工单已关闭');
        
        // 断开 WebSocket 连接并返回主页
        if (socketRef.current) {
          socketRef.current.disconnect();
          socketRef.current = null;
        }
        
        setTimeout(() => {
          window.location.href = '/identity-check';
        }, 1000);
      }

      setShowResolveModal(false);
    } catch (error: any) {
      console.error('关闭工单失败:', error);
      antdMessage.error(error?.message || error?.response?.data?.message || '关闭失败，请重试');
    } finally {
      setResolving(false);
    }
  };

  const handleSend = async () => {
    const content = inputValue.trim();
    if (!content || !token) {
      return;
    }

    setSending(true);
    try {
      // 先乐观更新 UI
      const tempId = `temp-${Date.now()}`;
      tempMessageIdRef.current = tempId;
      const tempMessage: Message = {
        id: tempId,
        sessionId: ticket?.id ?? 'temp',
        senderType: 'PLAYER',
        messageType: 'TEXT',
        content,
        createdAt: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, tempMessage]);
      setInputValue('');

      // 发送消息到服务器
      const sentMessage = await sendTicketMessageByToken(token, content);

      // 替换临时消息为真实消息（如果还没有被 WebSocket 替换）
      setMessages((prev) => {
        const tempIndex = prev.findIndex((msg) => msg.id === tempId);
        if (tempIndex !== -1) {
          // 检查是否已经有真实消息了（可能 WebSocket 已经推送了）
          const realMessageExists = prev.some(
            (msg) =>
              msg.id === sentMessage.id ||
              (msg.content === sentMessage.content &&
                msg.senderType === 'PLAYER' &&
                !msg.id.startsWith('temp-'))
          );

          if (realMessageExists) {
            // 如果已经有真实消息，移除临时消息
            tempMessageIdRef.current = null;
            return prev.filter((msg) => msg.id !== tempId);
          } else {
            // 否则替换临时消息
            tempMessageIdRef.current = null;
            return prev.map((msg) =>
              msg.id === tempId
                ? convertTicketMessageToMessage(sentMessage)
                : msg
            );
          }
        }
        return prev;
      });
    } catch (error: any) {
      console.error('发送消息失败:', error);
      antdMessage.error(error?.response?.data?.message || '发送消息失败，请重试');

      // 移除临时消息
      setMessages((prev) => prev.filter((msg) => msg.id !== tempMessageIdRef.current));
      tempMessageIdRef.current = null;

      // 恢复输入框内容
      setInputValue(content);
    } finally {
      setSending(false);
    }
  };

  if (loading || !ticket) {
    return (
      <div className="chat-loading-container">
        <Spin size="large" />
        <div className="chat-loading-text">加载中...</div>
      </div>
    );
  }

  const statusInfo = getStatusText(ticket.status);
  const isResolved = ticket.status === 'RESOLVED';

  return (
    <div className="chat-container-v3">
      {/* Header */}
      <header className="chat-header-v3 header-agent">
        <div className="header-left">
          <div className="header-avatar-wrapper">
            <div className="header-avatar avatar-player">
              <UserOutlined />
            </div>
            {wsConnected && <span className="status-dot online"></span>}
          </div>
          <div className="header-info">
            <h1 className="header-name">工单 #{ticket.ticketNo}</h1>
            <p className="header-status">
              {ticket.game?.name}
              {ticket.server && ` · ${ticket.server.name}`}
            </p>
          </div>
        </div>
        <div className="header-actions">
          {ticket.status !== 'RESOLVED' && (
            <Button
              type="primary"
              icon={<CheckCircleOutlined />}
              onClick={() => setShowResolveModal(true)}
              style={{ marginRight: 8 }}
            >
              问题已解决
            </Button>
          )}
          <Button
            type="default"
            onClick={handleExitClick}
            style={{ marginRight: 8 }}
          >
            返回主页
          </Button>
          <Tag color={statusInfo.color}>{statusInfo.text}</Tag>
        </div>
      </header>

      {/* Chat Body */}
      <main className="chat-body-v3">
        <div className="chat-messages-wrapper">
          {messages.length === 0 && !loading ? (
            <div className="message-list-empty" style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '40px 20px',
              textAlign: 'center',
              color: '#666'
            }}>
              <div style={{ fontSize: '16px', marginBottom: '12px', fontWeight: 500 }}>
                您的反馈已经记录
              </div>
              <div style={{ fontSize: '14px', lineHeight: '1.6', maxWidth: '400px' }}>
                想要查询客服的留言，只需要再次输入您的ID、区服和问题类型即可查看。
              </div>
            </div>
          ) : (
            <>
              <MessageList
                messages={messages}
                isTicketChat={true}
                playerLanguage={playerLanguage}
                onMessageUpdate={(updatedMessage) => {
                  setMessages((prev) =>
                    prev.map((msg) =>
                      msg.id === updatedMessage.id ? updatedMessage : msg
                    )
                  );
                }}
              />
              <div ref={messagesEndRef} />
            </>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="chat-footer-v3">
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
            placeholder={isResolved ? '工单已解决，无法继续发送消息' : '输入消息...（Shift+Enter 换行）'}
            autoSize={{ minRows: 1, maxRows: 4 }}
            disabled={sending || isResolved}
            className="chat-input-v3"
          />
          <Button
            type="primary"
            icon={<SendOutlined />}
            onClick={handleSend}
            loading={sending}
            disabled={!inputValue.trim() || sending || isResolved}
            className="send-btn-v3"
          />
        </div>
      </footer>

      {/* 确认关闭工单 Modal */}
      <Modal
        title="确认关闭工单"
        open={showResolveModal}
        onOk={handleResolveTicket}
        onCancel={() => setShowResolveModal(false)}
        confirmLoading={resolving}
        okText="确认关闭"
        cancelText="取消"
      >
        <p>确认您的问题已经解决了吗？</p>
        <p style={{ color: '#666', fontSize: '14px' }}>
          关闭后，工单将标记为已解决状态，您将无法继续发送消息。
        </p>
      </Modal>

      {/* 退出确认 Modal */}
      <Modal
        title="返回主页"
        open={showExitModal}
        onOk={handleConfirmExit}
        onCancel={() => setShowExitModal(false)}
        okText="确认"
        cancelText="取消"
      >
        <p>确认要返回主页吗？</p>
        <p style={{ color: '#666', fontSize: '14px' }}>
          您的工单将保持开启状态，客服可能会继续回复您的问题。
        </p>
      </Modal>
    </div>
  );
};

export default TicketChatPage;
