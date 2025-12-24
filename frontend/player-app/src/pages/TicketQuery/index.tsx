/**
 * 根据游戏/区服/ID查询工单页面
 */
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Form, Select, Input, Button, Card, List, Empty, Typography, Tag, Space, message, Divider } from 'antd';
import { CopyOutlined, MessageOutlined, SearchOutlined } from '@ant-design/icons';
import { getEnabledGames, type Game } from '../../services/game.service';
import { queryOpenTickets, type QueryOpenTicketsResponse } from '../../services/ticket.service';
import dayjs from 'dayjs';
import './index.css';

const { Option } = Select;
const { Title, Text } = Typography;

const TicketQueryPage = () => {
  const navigate = useNavigate();
  const [form] = Form.useForm();
  const [games, setGames] = useState<Game[]>([]);
  const [loading, setLoading] = useState(false);
  const [tickets, setTickets] = useState<QueryOpenTicketsResponse[]>([]);
  const [searched, setSearched] = useState(false);

  // 加载游戏列表
  useEffect(() => {
    const loadGames = async () => {
      try {
        const gameList = await getEnabledGames();
        if (Array.isArray(gameList)) {
          setGames(gameList);
        } else {
          setGames([]);
        }
      } catch (error) {
        console.error('加载游戏列表失败:', error);
        message.error('加载游戏列表失败');
      }
    };
    loadGames();
  }, []);

  // 处理查询
  const handleQuery = async (values: {
    gameId: string;
    serverName: string;
    playerIdOrName: string;
  }) => {
    setLoading(true);
    setSearched(true);
    try {
      const result = await queryOpenTickets({
        gameId: values.gameId,
        serverName: values.serverName,
        playerIdOrName: values.playerIdOrName,
      });
      setTickets(result || []);
      if (!result || result.length === 0) {
        message.info('未找到未完成的工单');
      }
    } catch (error: any) {
      console.error('查询工单失败:', error);
      message.error(error?.response?.data?.message || '查询工单失败');
      setTickets([]);
    } finally {
      setLoading(false);
    }
  };

  // 复制工单号
  const handleCopyTicketNo = (ticketNo: string) => {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(ticketNo)
        .then(() => message.success('工单号已复制到剪贴板'))
        .catch(() => message.error('复制失败，请手动复制'));
    } else {
      // 降级方案
      const textArea = document.createElement('textarea');
      textArea.value = ticketNo;
      document.body.appendChild(textArea);
      textArea.select();
      try {
        document.execCommand('copy');
        message.success('工单号已复制到剪贴板');
      } catch {
        message.error('复制失败，请手动复制');
      }
      document.body.removeChild(textArea);
    }
  };

  // 跳转到对话页面
  const handleViewChat = (token: string) => {
    navigate(`/ticket/${token}`);
  };

  // 获取状态标签
  const getStatusTag = (status: string) => {
    const statusMap: Record<string, { color: string; text: string }> = {
      WAITING: { color: 'orange', text: '待处理' },
      IN_PROGRESS: { color: 'blue', text: '处理中' },
    };
    const statusInfo = statusMap[status] || { color: 'default', text: status };
    return <Tag color={statusInfo.color}>{statusInfo.text}</Tag>;
  };

  return (
    <div className="ticket-query-page">
      <Card className="ticket-query-card">
        <div className="ticket-query-header">
          <Title level={3}>根据游戏/区服/ID查询</Title>
          <Text type="secondary">输入游戏、区服和玩家ID，查询所有未完成的工单</Text>
        </div>

        <Form
          form={form}
          layout="vertical"
          onFinish={handleQuery}
          className="ticket-query-form"
        >
          <Form.Item
            name="gameId"
            label="选择游戏"
            rules={[{ required: true, message: '请选择游戏' }]}
          >
            <Select
              placeholder="请选择游戏"
              size="large"
              showSearch
              filterOption={(input, option) =>
                String(option?.label || '').toLowerCase().includes(input.toLowerCase())
              }
            >
              {games.map((game) => (
                <Option key={game.id} value={game.id}>
                  {game.name}
                </Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item
            name="serverName"
            label="区服"
            rules={[{ required: true, message: '请输入区服' }]}
          >
            <Input
              placeholder="请输入区服名称"
              size="large"
            />
          </Form.Item>

          <Form.Item
            name="playerIdOrName"
            label="玩家ID/昵称"
            rules={[{ required: true, message: '请输入玩家ID或昵称' }]}
          >
            <Input
              placeholder="请输入玩家ID或昵称"
              size="large"
            />
          </Form.Item>

          <Form.Item>
            <Button
              type="primary"
              htmlType="submit"
              size="large"
              loading={loading}
              icon={<SearchOutlined />}
              block
            >
              查询工单
            </Button>
          </Form.Item>
        </Form>

        <Divider>
          <Button
            type="link"
            onClick={() => navigate('/ticket-query')}
            style={{ padding: 0 }}
          >
            有工单号？直接根据工单号查询
          </Button>
        </Divider>

        {searched && (
          <div className="ticket-query-results">
            {tickets.length > 0 ? (
              <List
                dataSource={tickets}
                renderItem={(ticket) => (
                  <List.Item className="ticket-item">
                    <div className="ticket-item-content">
                      <div className="ticket-item-header">
                        <Space>
                          <Text strong>工单号：{ticket.ticketNo}</Text>
                          {getStatusTag(ticket.status)}
                        </Space>
                        <Space>
                          <Button
                            type="text"
                            size="small"
                            icon={<CopyOutlined />}
                            onClick={() => handleCopyTicketNo(ticket.ticketNo)}
                          >
                            复制
                          </Button>
                          <Button
                            type="primary"
                            size="small"
                            icon={<MessageOutlined />}
                            onClick={() => handleViewChat(ticket.token)}
                          >
                            查看对话
                          </Button>
                        </Space>
                      </div>
                      <div className="ticket-item-body">
                        <div className="ticket-item-info">
                          <Text type="secondary">游戏：</Text>
                          <Text>{ticket.game.name}</Text>
                        </div>
                        <div className="ticket-item-info">
                          <Text type="secondary">区服：</Text>
                          <Text>{ticket.server?.name || ticket.serverName || '未知'}</Text>
                        </div>
                        {ticket.issueTypes.length > 0 && (
                          <div className="ticket-item-info">
                            <Text type="secondary">问题类型：</Text>
                            <Space size="small">
                              {ticket.issueTypes.map((type) => (
                                <Tag key={type.id}>{type.name}</Tag>
                              ))}
                            </Space>
                          </div>
                        )}
                        <div className="ticket-item-info">
                          <Text type="secondary">问题描述：</Text>
                          <Text>{ticket.description || '无'}</Text>
                        </div>
                        <div className="ticket-item-info">
                          <Text type="secondary">创建时间：</Text>
                          <Text>{dayjs(ticket.createdAt).format('YYYY-MM-DD HH:mm:ss')}</Text>
                        </div>
                      </div>
                    </div>
                  </List.Item>
                )}
              />
            ) : (
              <Empty
                description="未找到未完成的工单"
                image={Empty.PRESENTED_IMAGE_SIMPLE}
              />
            )}
          </div>
        )}
      </Card>
    </div>
  );
};

export default TicketQueryPage;

