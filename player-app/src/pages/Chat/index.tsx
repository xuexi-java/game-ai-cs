/**
 * 步骤4：AI引导聊天页面
 */
import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Input, Button, Typography, message, Spin } from 'antd';
import { SendOutlined } from '@ant-design/icons';
import { io } from 'socket.io-client';
import { getSession, transferToAgent } from '../../services/session.service';
import { sendPlayerMessage } from '../../services/message.service';
import { useSessionStore } from '../../stores/sessionStore';
import { WS_URL } from '../../config/api';
import MessageList from '../../components/Chat/MessageList';
import EmojiPicker from '../../components/Chat/EmojiPicker';
import FileUpload from '../../components/Chat/FileUpload';
import QuickReplies from '../../components/Chat/QuickReplies';
import NetworkStatus from '../../components/NetworkStatus';
import './index.css';

const { TextArea } = Input;

const ChatPage = () => {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const [inputValue, setInputValue] = useState('');
  const [loading, setLoading] = useState(false);
  const [wsConnected, setWsConnected] = useState(false);
  const { session, messages, setSession, addMessage, updateSession } = useSessionStore();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // 加载会话信息
  useEffect(() => {
    if (!sessionId) return;

    const loadSession = async () => {
      try {
        const sessionData = await getSession(sessionId);
        setSession(sessionData);
      } catch (error) {
        console.error('加载会话失败:', error);
        message.error('加载会话失败');
      }
    };

    loadSession();
  }, [sessionId, setSession]);

  // 连接 WebSocket
  useEffect(() => {
    if (!sessionId) return;

    const newSocket = io(WS_URL, {
      transports: ['websocket'],
    });

    newSocket.on('connect', () => {
      console.log('WebSocket 连接成功');
      setWsConnected(true);
      newSocket.emit('join-session', sessionId);
    });

    newSocket.on('disconnect', () => {
      console.log('WebSocket 连接断开');
      setWsConnected(false);
    });

    newSocket.on('message', (messageData) => {
      addMessage(messageData);
    });

    newSocket.on('session-updated', (sessionData) => {
      updateSession(sessionData);
      if (sessionData.status === 'QUEUED') {
        navigate(`/queue/${sessionId}`);
      }
    });

    return () => {
      newSocket.disconnect();
    };
  }, [sessionId, addMessage, updateSession, navigate]);

  // 滚动到底部
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // 发送消息
  const handleSend = async () => {
    if (!inputValue.trim() || !sessionId) return;

    const content = inputValue.trim();
    setInputValue('');
    setLoading(true);

    try {
      await sendPlayerMessage({
        sessionId,
        content,
      });
      // WebSocket 会收到新消息
    } catch (error) {
      console.error('发送消息失败:', error);
      message.error('发送消息失败');
    } finally {
      setLoading(false);
    }
  };

  // 处理表情选择
  const handleEmojiSelect = (emoji: string) => {
    setInputValue(prev => prev + emoji);
  };

  // 处理快捷回复选择
  const handleQuickReplySelect = (reply: string) => {
    setInputValue(reply);
  };

  // 处理文件选择
  const handleFileSelect = async (file: File) => {
    if (!sessionId) return;

    setLoading(true);
    try {
      // TODO: 实现文件上传逻辑
      message.success(`文件 ${file.name} 选择成功，上传功能待实现`);
    } catch (error) {
      console.error('文件上传失败:', error);
      message.error('文件上传失败');
    } finally {
      setLoading(false);
    }
  };

  // 转人工客服
  const handleTransferToAgent = async () => {
    if (!sessionId) return;

    setLoading(true);
    try {
      const updatedSession = await transferToAgent(sessionId);
      updateSession(updatedSession);
      navigate(`/queue/${sessionId}`);
    } catch (error) {
      console.error('转人工失败:', error);
      message.error('转人工失败，请重试');
    } finally {
      setLoading(false);
    }
  };

  if (!session) {
    return (
      <div className="loading-container">
        <Spin size="large" />
        <div className="loading-text">加载会话中...</div>
      </div>
    );
  }

  return (
    <>
      <NetworkStatus wsConnected={wsConnected} />
      <div className="chat-container">
        <div className="chat-header">
        <Typography.Title level={4} style={{ margin: 0, color: 'white' }}>
          客服咨询 - {session.ticket.ticketNo}
        </Typography.Title>
        <div className={`status-badge ${session.status.toLowerCase().replace('_', '-')}`}>
          {session.status === 'PENDING' ? '等待中' : 
           session.status === 'IN_PROGRESS' ? '进行中' : 
           session.status === 'QUEUED' ? '排队中' : '已关闭'}
        </div>
      </div>
      <div className="chat-content">
        <div style={{ flex: 1, overflowY: 'auto', marginBottom: '16px' }}>
          <MessageList messages={messages} />
          <div ref={messagesEndRef} />
        </div>

      </div>
      
      <div className="chat-input-area">
        <QuickReplies onReplySelect={handleQuickReplySelect} />
        <div style={{ position: 'relative' }}>
          <TextArea
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onPressEnter={(e) => {
              if (!e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder="输入消息...（Shift+Enter 换行）"
            autoSize={{ minRows: 1, maxRows: 4 }}
            disabled={loading}
            style={{ 
              borderRadius: '8px',
              paddingRight: '80px'
            }}
          />
          <div style={{
            position: 'absolute',
            right: '8px',
            bottom: '8px',
            display: 'flex',
            gap: '4px',
            alignItems: 'center'
          }}>
            <EmojiPicker onEmojiSelect={handleEmojiSelect} />
            <FileUpload onFileSelect={handleFileSelect} />
            <Button
              type="primary"
              icon={<SendOutlined />}
              onClick={handleSend}
              loading={loading}
              disabled={!inputValue.trim()}
              size="small"
              style={{ 
                borderRadius: '6px',
                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                border: 'none'
              }}
            />
          </div>
        </div>

        {session.status === 'PENDING' && (
          <div style={{ marginTop: '16px', textAlign: 'center' }}>
            <Button
              type="primary"
              onClick={handleTransferToAgent}
              loading={loading}
              style={{ 
                borderRadius: '8px',
                background: 'linear-gradient(135deg, #52c41a 0%, #389e0d 100%)',
                border: 'none'
              }}
            >
              转人工客服
            </Button>
          </div>
        )}
      </div>
      </div>
    </>
  );
};

export default ChatPage;
