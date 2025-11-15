/**
 * 步骤1：身份验证页面
 */
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Form, Select, Input, Button, Card, message } from 'antd';
import { getEnabledGames, type Game } from '../../services/game.service';
import { checkOpenTicket } from '../../services/ticket.service';
import { useTicketStore } from '../../stores/ticketStore';
import { validateGameId, validateServerId, validatePlayerIdOrName } from '../../utils/validation';

const { Option } = Select;

const IdentityCheckPage = () => {
  const navigate = useNavigate();
  const [form] = Form.useForm();
  const [games, setGames] = useState<Game[]>([]);
  const [loading, setLoading] = useState(false);
  const { setIdentity } = useTicketStore();

  // 加载游戏列表
  useEffect(() => {
    const loadGames = async () => {
      try {
        const gameList = await getEnabledGames();
        setGames(gameList);
      } catch (error) {
        console.error('加载游戏列表失败:', error);
        // 如果后端未运行，使用模拟数据
        setGames([
          { id: '1', name: '弹弹堂', enabled: true },
          { id: '2', name: '神曲', enabled: true },
        ]);
        message.warning('后端服务未连接，使用模拟数据');
      }
    };
    loadGames();
  }, []);

  // 提交表单
  const handleSubmit = async (values: {
    gameId: string;
    serverId: string;
    playerIdOrName: string;
  }) => {
    setLoading(true);
    try {
      // 保存身份信息
      setIdentity(values.gameId, values.serverId, values.playerIdOrName);

      // 检查是否有未关闭的工单
      const result = await checkOpenTicket({
        gameId: values.gameId,
        serverId: values.serverId,
        playerIdOrName: values.playerIdOrName,
      });

      if (result.hasOpenTicket && result.ticket) {
        // 有未关闭的工单，跳转到逃生舱页面
        navigate('/escape-hatch', {
          state: {
            ticket: result.ticket,
          },
        });
      } else {
        // 没有未关闭的工单，跳转到前置表单页面
        navigate('/intake-form');
      }
    } catch (error: any) {
      console.error('身份验证失败:', error);
      // 如果后端未运行，直接跳转到前置表单
      if (error.code === 'ERR_NETWORK' || error.message?.includes('Network')) {
        message.warning('后端服务未连接，将跳过工单检查');
        navigate('/intake-form');
      } else {
        message.error(error.response?.data?.message || '身份验证失败，请重试');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page-container">
      <Card 
        title="身份验证" 
        className="page-card fade-in-up"
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleSubmit}
          autoComplete="off"
          className="enhanced-form"
        >
          <Form.Item
            label="选择游戏"
            name="gameId"
            rules={[{ validator: validateGameId }]}
          >
            <Select 
              placeholder="请选择游戏"
              size="large"
              showSearch
              filterOption={(input, option) =>
                (option?.children as unknown as string)?.toLowerCase().includes(input.toLowerCase())
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
            label="区服"
            name="serverId"
            rules={[{ validator: validateServerId }]}
          >
            <Input 
              placeholder="请输入区服名称或ID" 
              size="large"
            />
          </Form.Item>

          <Form.Item
            label="角色ID或昵称"
            name="playerIdOrName"
            rules={[{ validator: validatePlayerIdOrName }]}
          >
            <Input 
              placeholder="请输入角色ID或昵称" 
              size="large"
            />
          </Form.Item>

          <Form.Item>
            <Button 
              type="primary" 
              htmlType="submit" 
              block 
              size="large"
              loading={loading}
            >
              下一步
            </Button>
          </Form.Item>
        </Form>
      </Card>
    </div>
  );
};

export default IdentityCheckPage;
