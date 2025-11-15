import { useState, useEffect } from 'react';
import {
  Card,
  List,
  Button,
  Tag,
  Space,
  Typography,
  Badge,
  Empty,
  Spin,
  message,
  Modal,
  Avatar,
  Input,
  Divider,
} from 'antd';
import {
  MessageOutlined,
  UserOutlined,
  SendOutlined,
  CloseOutlined,
  HistoryOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { getSessionMessages } from '../../services/message.service';
import { closeSession } from '../../services/session.service';
import { useSessionStore } from '../../stores/sessionStore';
import { websocketService } from '../../services/websocket.service';
import type { Session } from '../../types';
import './ActivePage.css';

const { Title, Text } = Typography;
const { TextArea } = Input;
const { confirm } = Modal;

const ActivePage: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [chatModalVisible, setChatModalVisible] = useState(false);
  const [messageInput, setMessageInput] = useState('');
  const [sendingMessage, setSendingMessage] = useState(false);
  
  const {
    activeSessions,
    setActiveSessions,
    currentSession,
    setCurrentSession,
    sessionMessages,
    setSessionMessages,
    updateSession,
  } = useSessionStore();

  // 模拟加载活跃会话（实际应该从API获取）
  const loadActiveSessions = async () => {
    setLoading(true);
    try {
      // 这里应该调用API获取当前用户的活跃会话
      // const sessions = await getActiveSessions();
      // setActiveSessions(sessions);
      
      // 暂时使用空数组
      setActiveSessions([]);
    } catch (error) {
      console.error('加载活跃会话失败:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadActiveSessions();
  }, []);

  // 打开聊天窗口
  const handleOpenChat = async (session: Session) => {
    setCurrentSession(session);
    setChatModalVisible(true);
    
    try {
      // 加载会话消息
      const messages = await getSessionMessages(session.id);
      setSessionMessages(session.id, messages);
      
      // 加入WebSocket房间
      await websocketService.joinSession(session.id);
    } catch (error) {
      console.error('加载会话消息失败:', error);
    }
  };

  // 发送消息
  const handleSendMessage = async () => {
    if (!currentSession || !messageInput.trim()) return;
    
    setSendingMessage(true);
    try {
      // 通过WebSocket发送消息
      const result = await websocketService.sendAgentMessage(
        currentSession.id,
        messageInput.trim()
      );
      
      if (result.success) {
        setMessageInput('');
        message.success('消息发送成功');
      } else {
        message.error(result.error || '消息发送失败');
      }
    } catch (error) {
      console.error('发送消息失败:', error);
      message.error('消息发送失败');
    } finally {
      setSendingMessage(false);
    }
  };

  // 结束会话
  const handleCloseSession = (session: Session) => {
    confirm({
      title: '确认结束会话',
      content: `您确定要结束与 ${session.ticket.playerIdOrName} 的会话吗？`,
      onOk: async () => {
        try {
          await closeSession(session.id);
          
          // 更新本地状态
          updateSession(session.id, { status: 'CLOSED' });
          
          // 离开WebSocket房间
          await websocketService.leaveSession(session.id);
          
          message.success('会话已结束');
          
          // 如果当前聊天窗口显示的是这个会话，关闭窗口
          if (currentSession?.id === session.id) {
            setChatModalVisible(false);
            setCurrentSession(null);
          }
        } catch (error) {
          console.error('结束会话失败:', error);
        }
      },
    });
  };

  // 获取会话持续时间
  const getSessionDuration = (session: Session) => {
    const startTime = session.queuedAt || session.createdAt;
    const duration = dayjs().diff(dayjs(startTime), 'minute');
    if (duration < 60) return `${duration}分钟`;
    return `${Math.floor(duration / 60)}小时${duration % 60}分钟`;
  };

  // 渲染消息列表
  const renderMessages = () => {
    const messages = currentSession ? sessionMessages[currentSession.id] || [] : [];
    
    return (
      <div className="chat-messages">
        {messages.map((message) => (
          <div
            key={message.id}
            className={`message-item ${
              message.senderType === 'AGENT' ? 'message-agent' : 
              message.senderType === 'PLAYER' ? 'message-player' : 
              'message-system'
            }`}
          >
            <div className="message-content">
              <div className="message-header">
                <span className="message-sender">
                  {message.senderType === 'AGENT' ? '客服' : 
                   message.senderType === 'PLAYER' ? '玩家' : 
                   '系统'}
                </span>
                <span className="message-time">
                  {dayjs(message.createdAt).format('HH:mm')}
                </span>
              </div>
              <div className="message-text">{message.content}</div>
            </div>
          </div>
        ))}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="active-loading">
        <Spin size="large" />
        <p>加载活跃会话中...</p>
      </div>
    );
  }

  return (
    <div className="active-container">
      <Card>
        <div className="active-header">
          <Title level={3}>
            <MessageOutlined /> 活跃会话
            <Badge count={activeSessions.length} style={{ marginLeft: 16 }} />
          </Title>
          
          <Button
            type="primary"
            onClick={loadActiveSessions}
            loading={loading}
          >
            刷新列表
          </Button>
        </div>

        {activeSessions.length === 0 ? (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="暂无活跃会话"
          />
        ) : (
          <List
            className="active-list"
            itemLayout="vertical"
            dataSource={activeSessions}
            renderItem={(session) => (
              <List.Item
                key={session.id}
                className="active-item"
                actions={[
                  <Button
                    type="primary"
                    icon={<MessageOutlined />}
                    onClick={() => handleOpenChat(session)}
                  >
                    打开聊天
                  </Button>,
                  <Button
                    danger
                    icon={<CloseOutlined />}
                    onClick={() => handleCloseSession(session)}
                  >
                    结束会话
                  </Button>
                ]}
              >
                <div className="active-item-content">
                  <div className="active-item-header">
                    <div className="active-item-title">
                      <Avatar icon={<UserOutlined />} style={{ marginRight: 12 }} />
                      <div>
                        <Title level={5} style={{ margin: 0 }}>
                          {session.ticket.ticketNo}
                        </Title>
                        <Text type="secondary">
                          {session.ticket.playerIdOrName} · {session.ticket.game.name}
                          {session.ticket.server && ` · ${session.ticket.server.name}`}
                        </Text>
                      </div>
                    </div>
                    
                    <div className="active-item-tags">
                      <Tag color="green">进行中</Tag>
                      <Tag color="blue">
                        持续: {getSessionDuration(session)}
                      </Tag>
                    </div>
                  </div>
                  
                  <div className="active-item-description">
                    <Text>{session.ticket.description}</Text>
                  </div>
                  
                  <div className="active-item-meta">
                    <Space split={<span>·</span>}>
                      <span>
                        <HistoryOutlined /> 
                        开始时间: {dayjs(session.queuedAt || session.createdAt).format('MM-DD HH:mm')}
                      </span>
                      
                      {session.detectedIntent && (
                        <span>意图: {session.detectedIntent}</span>
                      )}
                    </Space>
                  </div>
                </div>
              </List.Item>
            )}
          />
        )}
      </Card>

      {/* 聊天窗口 */}
      <Modal
        title={
          currentSession && (
            <div className="chat-modal-title">
              <UserOutlined style={{ marginRight: 8 }} />
              {currentSession.ticket.ticketNo} - {currentSession.ticket.playerIdOrName}
            </div>
          )
        }
        open={chatModalVisible}
        onCancel={() => {
          setChatModalVisible(false);
          setCurrentSession(null);
        }}
        footer={null}
        width={800}
        className="chat-modal"
      >
        <div className="chat-container">
          {renderMessages()}
          
          <Divider />
          
          <div className="chat-input">
            <TextArea
              value={messageInput}
              onChange={(e) => setMessageInput(e.target.value)}
              placeholder="输入回复消息..."
              rows={3}
              onPressEnter={(e) => {
                if (e.ctrlKey || e.metaKey) {
                  handleSendMessage();
                }
              }}
            />
            <div className="chat-input-actions">
              <Text type="secondary" style={{ fontSize: '12px' }}>
                Ctrl+Enter 发送
              </Text>
              <Button
                type="primary"
                icon={<SendOutlined />}
                onClick={handleSendMessage}
                loading={sendingMessage}
                disabled={!messageInput.trim()}
              >
                发送
              </Button>
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default ActivePage;
