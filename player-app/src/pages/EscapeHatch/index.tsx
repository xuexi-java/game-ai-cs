/**
 * 步骤2：逃生舱页面
 */
import { useNavigate, useLocation } from 'react-router-dom';
import { Card, Button, Space, Typography } from 'antd';
import { useTicketStore } from '../../stores/ticketStore';

const { Title, Paragraph } = Typography;

const EscapeHatchPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { setTicket } = useTicketStore();
  
  const ticket = location.state?.ticket as {
    id: string;
    ticketNo: string;
    token: string;
  } | undefined;

  if (!ticket) {
    // 如果没有工单信息，跳转到身份验证页面
    navigate('/identity-check');
    return null;
  }

  const handleContinueTicket = () => {
    // 保存工单信息
    setTicket(ticket.id, ticket.ticketNo, ticket.token);
    // 跳转到工单聊天页面
    navigate(`/ticket/${ticket.token}`);
  };

  const handleNewTicket = () => {
    // 跳转到前置表单页面
    navigate('/intake-form');
  };

  return (
    <div className="page-container">
      <Card 
        className="page-card fade-in-up"
      >
        <div style={{ textAlign: 'center', marginBottom: '24px' }}>
          <Title level={3}>检测到您有未关闭的工单</Title>
          <Paragraph>
            工单编号：<strong>{ticket.ticketNo}</strong>
          </Paragraph>
        </div>

        <Space direction="vertical" size="large" style={{ width: '100%' }} className="enhanced-form">
          <Button 
            type="primary" 
            block 
            size="large"
            onClick={handleContinueTicket}
          >
            继续处理此工单 (#{ticket.ticketNo})
          </Button>

          <Button 
            block 
            size="large"
            onClick={handleNewTicket}
          >
            我有新问题要提交
          </Button>
        </Space>
      </Card>
    </div>
  );
};

export default EscapeHatchPage;

