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
} from 'antd';
import {
  CustomerServiceOutlined,
  ClockCircleOutlined,
  UserOutlined,
  PhoneOutlined,
  ExclamationCircleOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { getQueuedSessions, joinSession } from '../../services/session.service';
import { useSessionStore } from '../../stores/sessionStore';
import { websocketService } from '../../services/websocket.service';
import type { Session } from '../../types';
import './QueuePage.css';

const { Title, Text } = Typography;
const { confirm } = Modal;

const QueuePage: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const { queuedSessions, setQueuedSessions, removeFromQueue, addToActive } = useSessionStore();

  // 加载排队会话
  const loadQueuedSessions = async () => {
    setLoading(true);
    try {
      const sessions = await getQueuedSessions();
      setQueuedSessions(sessions);
    } catch (error) {
      console.error('加载排队会话失败:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadQueuedSessions();
    
    // 每30秒刷新一次
    const interval = setInterval(loadQueuedSessions, 30000);
    
    return () => clearInterval(interval);
  }, []);

  // 接入会话
  const handleJoinSession = (session: Session) => {
    confirm({
      title: '确认接入会话',
      icon: <ExclamationCircleOutlined />,
      content: (
        <div>
          <p>您确定要接入以下会话吗？</p>
          <p><strong>工单号：</strong>{session.ticket.ticketNo}</p>
          <p><strong>玩家：</strong>{session.ticket.playerIdOrName}</p>
          <p><strong>游戏：</strong>{session.ticket.game.name}</p>
          <p><strong>问题：</strong>{session.ticket.description}</p>
        </div>
      ),
      onOk: async () => {
        try {
          const updatedSession = await joinSession(session.id);
          
          // 更新本地状态
          removeFromQueue(session.id);
          addToActive(updatedSession);
          
          // 加入WebSocket房间
          await websocketService.joinSession(session.id);
          
          message.success('成功接入会话');
        } catch (error) {
          console.error('接入会话失败:', error);
        }
      },
    });
  };

  // 获取优先级颜色
  const getPriorityColor = (score?: number) => {
    if (!score) return 'default';
    if (score >= 80) return 'red';
    if (score >= 60) return 'orange';
    if (score >= 40) return 'blue';
    return 'default';
  };

  // 获取等待时间显示
  const getWaitTimeDisplay = (queuedAt?: string) => {
    if (!queuedAt) return '-';
    const waitTime = dayjs().diff(dayjs(queuedAt), 'minute');
    if (waitTime < 1) return '刚刚';
    if (waitTime < 60) return `${waitTime}分钟`;
    return `${Math.floor(waitTime / 60)}小时${waitTime % 60}分钟`;
  };

  // 获取紧急程度标签
  const getUrgencyTag = (session: Session) => {
    if (session.aiUrgency === 'URGENT') {
      return <Tag color="red">紧急</Tag>;
    }
    return <Tag color="blue">普通</Tag>;
  };

  if (loading && queuedSessions.length === 0) {
    return (
      <div className="queue-loading">
        <Spin size="large" />
        <p>加载排队会话中...</p>
      </div>
    );
  }

  return (
    <div className="queue-container">
      <Card>
        <div className="queue-header">
          <Title level={3}>
            <CustomerServiceOutlined /> 待接入队列
            <Badge count={queuedSessions.length} style={{ marginLeft: 16 }} />
          </Title>
          
          <Button
            type="primary"
            onClick={loadQueuedSessions}
            loading={loading}
          >
            刷新队列
          </Button>
        </div>

        {queuedSessions.length === 0 ? (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="暂无排队会话"
          />
        ) : (
          <List
            className="queue-list"
            itemLayout="vertical"
            dataSource={queuedSessions.sort((a, b) => (b.priorityScore || 0) - (a.priorityScore || 0))}
            renderItem={(session, index) => (
              <List.Item
                key={session.id}
                className="queue-item"
                actions={[
                  <Button
                    type="primary"
                    icon={<PhoneOutlined />}
                    onClick={() => handleJoinSession(session)}
                  >
                    接入会话
                  </Button>
                ]}
              >
                <div className="queue-item-content">
                  <div className="queue-item-header">
                    <div className="queue-item-title">
                      <Badge count={index + 1} style={{ marginRight: 12 }} />
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
                    
                    <div className="queue-item-tags">
                      {getUrgencyTag(session)}
                      <Tag color={getPriorityColor(session.priorityScore)}>
                        优先级: {session.priorityScore?.toFixed(1) || 0}
                      </Tag>
                    </div>
                  </div>
                  
                  <div className="queue-item-description">
                    <Text>{session.ticket.description}</Text>
                  </div>
                  
                  <div className="queue-item-meta">
                    <Space split={<span>·</span>}>
                      <span>
                        <ClockCircleOutlined /> 
                        等待时间: {getWaitTimeDisplay(session.queuedAt)}
                      </span>
                      
                      {session.detectedIntent && (
                        <span>
                          意图: {session.detectedIntent}
                        </span>
                      )}
                      
                      <span>
                        创建时间: {dayjs(session.createdAt).format('MM-DD HH:mm')}
                      </span>
                    </Space>
                  </div>
                </div>
              </List.Item>
            )}
          />
        )}
      </Card>
    </div>
  );
};

export default QueuePage;
