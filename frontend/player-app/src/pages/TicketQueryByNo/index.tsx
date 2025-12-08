/**
 * 根据工单号查询页面（默认查询页面）
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Form, Input, Button, Card, Typography, Space, Tag, message, Divider } from 'antd';
import { SearchOutlined, CopyOutlined, MessageOutlined, ReloadOutlined } from '@ant-design/icons';
import { getTicketByTicketNo, type TicketDetail } from '../../services/ticket.service';
import dayjs from 'dayjs';
import './index.css';

const { Title, Text } = Typography;

const TicketQueryByNoPage = () => {
  const navigate = useNavigate();
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [ticket, setTicket] = useState<TicketDetail | null>(null);
  const [searched, setSearched] = useState(false);

  // 处理查询
  const handleQuery = async (values: { ticketNo: string }) => {
    setLoading(true);
    setSearched(true);
    try {
      const result = await getTicketByTicketNo(values.ticketNo.trim());
      setTicket(result);
      if (result.status === 'RESOLVED') {
        message.info('该工单已解决');
      }
    } catch (error: any) {
      console.error('查询工单失败:', error);
      message.error(error?.response?.data?.message || '工单不存在或查询失败');
      setTicket(null);
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
      RESOLVED: { color: 'green', text: '已解决' },
    };
    const statusInfo = statusMap[status] || { color: 'default', text: status };
    return <Tag color={statusInfo.color}>{statusInfo.text}</Tag>;
  };

  // 重置查询
  const handleReset = () => {
    form.resetFields();
    setTicket(null);
    setSearched(false);
  };

  return (
    <div className="ticket-query-by-no-page">
      <Card className="ticket-query-card">
        <div className="ticket-query-header">
          <Title level={3}>查询我的工单</Title>
          <Text type="secondary">输入工单号快速查询工单信息</Text>
        </div>

        <Form
          form={form}
          layout="vertical"
          onFinish={handleQuery}
          className="ticket-query-form"
        >
          <Form.Item
            name="ticketNo"
            label="工单号"
            rules={[
              { required: true, message: '请输入工单号' },
              { min: 3, message: '工单号至少3个字符' },
            ]}
          >
            <Input
              placeholder="请输入工单号，例如：T-20250101-001"
              size="large"
              allowClear
            />
          </Form.Item>

          <Form.Item>
            <Space>
              <Button
                type="primary"
                htmlType="submit"
                size="large"
                loading={loading}
                icon={<SearchOutlined />}
              >
                查询工单
              </Button>
              {searched && (
                <Button
                  size="large"
                  icon={<ReloadOutlined />}
                  onClick={handleReset}
                >
                  重新查询
                </Button>
              )}
            </Space>
          </Form.Item>
        </Form>

        <Divider>
          <Button
            type="link"
            onClick={() => navigate('/ticket-query-by-info')}
            style={{ padding: 0 }}
          >
            忘记工单号？根据游戏/区服/ID查询
          </Button>
        </Divider>

        {searched && (
          <div className="ticket-query-results">
            {ticket ? (
              <Card className="ticket-detail-card">
                <div className="ticket-detail-header">
                  <Space>
                    <Text strong style={{ fontSize: 18 }}>工单号：{ticket.ticketNo}</Text>
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
                    {ticket.status !== 'RESOLVED' && ticket.token && (
                      <Button
                        type="primary"
                        size="small"
                        icon={<MessageOutlined />}
                        onClick={() => handleViewChat(ticket.token)}
                      >
                        查看对话
                      </Button>
                    )}
                  </Space>
                </div>

                <div className="ticket-detail-body">
                  <div className="ticket-detail-info">
                    <Text type="secondary">游戏：</Text>
                    <Text>{ticket.game?.name || '未知'}</Text>
                  </div>
                  <div className="ticket-detail-info">
                    <Text type="secondary">区服：</Text>
                    <Text>{(ticket.server?.name || (ticket as any).serverName) || '未知'}</Text>
                  </div>
                  <div className="ticket-detail-info">
                    <Text type="secondary">玩家ID/昵称：</Text>
                    <Text>{ticket.playerIdOrName}</Text>
                  </div>
                  {(ticket as any).ticketIssueTypes && (ticket as any).ticketIssueTypes.length > 0 && (
                    <div className="ticket-detail-info">
                      <Text type="secondary">问题类型：</Text>
                      <Space size="small">
                        {(ticket as any).ticketIssueTypes.map((tt: any) => (
                          <Tag key={tt.issueType?.id || tt.issueTypeId}>
                            {tt.issueType?.name || '未知'}
                          </Tag>
                        ))}
                      </Space>
                    </div>
                  )}
                  {ticket.description && (
                    <div className="ticket-detail-info">
                      <Text type="secondary">问题描述：</Text>
                      <Text>{ticket.description}</Text>
                    </div>
                  )}
                  <div className="ticket-detail-info">
                    <Text type="secondary">创建时间：</Text>
                    <Text>{dayjs(ticket.createdAt).format('YYYY-MM-DD HH:mm:ss')}</Text>
                  </div>
                  {ticket.updatedAt && (
                    <div className="ticket-detail-info">
                      <Text type="secondary">更新时间：</Text>
                      <Text>{dayjs(ticket.updatedAt).format('YYYY-MM-DD HH:mm:ss')}</Text>
                    </div>
                  )}
                </div>
              </Card>
            ) : (
              <Card className="ticket-empty-card">
                <Text type="secondary">未找到该工单，请检查工单号是否正确</Text>
              </Card>
            )}
          </div>
        )}
      </Card>
    </div>
  );
};

export default TicketQueryByNoPage;

