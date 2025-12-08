/**
 * 步骤1：身份验证页面
 */
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Form, Select, Input, Button, Card, Modal, Typography, Space } from 'antd';
import { SearchOutlined } from '@ant-design/icons';
import { getEnabledGames, type Game } from '../../services/game.service';
import { getEnabledIssueTypes, type IssueType } from '../../services/issue-type.service';
import { useTicketStore } from '../../stores/ticketStore';
import { validateGameId, validatePlayerIdOrName } from '../../utils/validation';
import { useMessage } from '../../hooks/useMessage';
import { checkOpenTicketByIssueType, createTicket, getTicketByToken } from '../../services/ticket.service';
import { createSession, getActiveSessionByTicket } from '../../services/session.service';
import './index.css';

const { Option } = Select;
const { Title, Text } = Typography;

const IdentityCheckPage = () => {
  const navigate = useNavigate();
  const [form] = Form.useForm();
  const [games, setGames] = useState<Game[]>([]);
  const [issueTypes, setIssueTypes] = useState<IssueType[]>([]);
  const [loading, setLoading] = useState(false);
  const messageApi = useMessage();
  const { setIdentity, setIssueTypes: setStoreIssueTypes, setTicket } = useTicketStore();

  // 加载游戏列表和问题类型
  useEffect(() => {
    const loadData = async () => {
      try {
        const [gameList, issueTypeList] = await Promise.all([
          getEnabledGames(),
          getEnabledIssueTypes(),
        ]);
        
        // 确保 gameList 是数组
        if (Array.isArray(gameList)) {
          setGames(gameList);
        } else {
          console.warn('游戏列表格式不正确:', gameList);
          setGames([]);
        }

        // 设置问题类型
        if (Array.isArray(issueTypeList)) {
          setIssueTypes(issueTypeList);
        }
      } catch (error) {
        console.error('加载数据失败:', error);
        // 如果后端未运行，使用模拟数据
        setGames([
          {
            id: '1',
            name: '弹弹堂',
            enabled: true,
            servers: [
              { id: 'server-1', name: '一区', enabled: true },
              { id: 'server-2', name: '二区', enabled: true },
            ],
          },
          {
            id: '2',
            name: '神曲',
            enabled: true,
            servers: [{ id: 'server-3', name: '一区', enabled: true }],
          },
        ]);
        
        // 模拟问题类型数据
        setIssueTypes([
          { id: '1', name: '充值未到账', priorityWeight: 95, icon: '💰', sortOrder: 1 },
          { id: '2', name: '账号被盗', priorityWeight: 90, icon: '🔒', sortOrder: 2 },
          { id: '3', name: '游戏无法登录', priorityWeight: 85, icon: '🚫', sortOrder: 3 },
          { id: '4', name: '账号封禁申诉', priorityWeight: 80, icon: '🔓', sortOrder: 4 },
          { id: '5', name: '道具丢失', priorityWeight: 75, icon: '📦', sortOrder: 5 },
          { id: '6', name: '游戏闪退/卡顿', priorityWeight: 70, icon: '⚠️', sortOrder: 6 },
          { id: '7', name: '游戏BUG', priorityWeight: 65, icon: '🐛', sortOrder: 7 },
          { id: '8', name: '活动奖励问题', priorityWeight: 60, icon: '🎁', sortOrder: 8 },
          { id: '9', name: '实名认证问题', priorityWeight: 55, icon: '📝', sortOrder: 9 },
          { id: '10', name: '其他问题', priorityWeight: 50, icon: '📌', sortOrder: 10 },
          { id: '11', name: '好友/社交问题', priorityWeight: 40, icon: '👥', sortOrder: 11 },
          { id: '12', name: '游戏玩法咨询', priorityWeight: 30, icon: '❓', sortOrder: 12 },
        ]);
        
        messageApi.warning('后端服务未连接，使用模拟数据');
      }
    };
    loadData();
  }, [messageApi]);



  // 提交表单
  const handleSubmit = async (values: {
    gameId: string;
    serverName: string;
    playerIdOrName: string;
    issueTypeId: string;
  }) => {
    setLoading(true);
    try {
      // 保存身份信息和问题类型到 store
      setIdentity({
        gameId: values.gameId,
        serverId: undefined,
        serverName: values.serverName,
        playerIdOrName: values.playerIdOrName,
      });

      // 验证并保存选中的问题类型
      if (!values.issueTypeId || typeof values.issueTypeId !== 'string') {
        messageApi.error('问题类型选择无效，请重新选择');
        setLoading(false);
        return;
      }

      // 保存选中的问题类型（不再验证 UUID 格式，因为数据库中的 ID 可能是字符串格式）
      setStoreIssueTypes([values.issueTypeId]);

      // 获取选中的问题类型信息
      const selectedIssueType = issueTypes.find((type) => type.id === values.issueTypeId);
      const requiresDirectTransfer = selectedIssueType?.requireDirectTransfer || false;

      // 检查是否有相同问题类型的未完成工单（使用 serverName）
      const result = await checkOpenTicketByIssueType({
        gameId: values.gameId,
        serverId: values.serverName, // 使用 serverName 作为标识
        playerIdOrName: values.playerIdOrName,
        issueTypeId: values.issueTypeId,
      });

      if (result.hasOpenTicket && result.ticket) {
        // 保存工单信息到 store
        const ticketStore = useTicketStore.getState();
        if (ticketStore.setTicket && result.ticket.token) {
          ticketStore.setTicket(result.ticket.id, result.ticket.ticketNo, result.ticket.token);
        }
        
        // 显示选择对话框：继续处理现有工单还是反馈新问题
        Modal.confirm({
          title: '您有未解决的工单',
          content: (
            <div style={{ marginTop: '16px' }}>
              <Text>检测到您有一个未完成的工单（工单号：{result.ticket.ticketNo}），请选择：</Text>
            </div>
          ),
          okText: '继续处理',
          cancelText: '反馈新问题',
          onOk: () => {
            // 继续处理现有工单
            navigate(`/ticket/${result.ticket!.token}`);
          },
          onCancel: () => {
            // 反馈新问题，根据问题类型决定流程
            if (requiresDirectTransfer) {
              // 直接转人工：创建工单并进入排队
              handleDirectTransfer(values);
            } else {
              // 正常流程：跳转到合并表单页面（包含身份信息和问题描述）
              // 将表单数据保存到 store，然后跳转
              setIdentity({
                gameId: values.gameId,
                serverId: undefined,
                serverName: values.serverName,
                playerIdOrName: values.playerIdOrName,
              });
              setStoreIssueTypes([values.issueTypeId]);
              navigate('/submit-ticket');
            }
          },
        });
        return;
      }

      // 没有未完成工单，根据问题类型决定流程
      if (requiresDirectTransfer) {
        // 直接转人工：创建工单并进入排队
        await handleDirectTransfer(values);
      } else {
        // 正常流程：跳转到合并表单页面（包含身份信息和问题描述）
        // 将表单数据保存到 store，然后跳转
        setIdentity({
          gameId: values.gameId,
          serverId: undefined,
          serverName: values.serverName,
          playerIdOrName: values.playerIdOrName,
        });
        setStoreIssueTypes([values.issueTypeId]);
        navigate('/submit-ticket');
      }
    } catch (error: unknown) {
      console.error('身份验证失败:', error);
      messageApi.error('身份验证失败，请重试');
    } finally {
      setLoading(false);
    }
  };

  // 处理直接转人工的逻辑：直接创建工单并进入工单聊天页面
  const handleDirectTransfer = async (values: {
    gameId: string;
    serverName: string;
    playerIdOrName: string;
    issueTypeId: string;
  }) => {
    try {
      // 获取问题类型名称
      const issueType = issueTypes.find((type) => type.id === values.issueTypeId);
      const issueTypeName = issueType?.name || '未知问题类型';

      // 创建工单（使用默认描述）
      const ticketData = {
        gameId: values.gameId,
        serverName: values.serverName,
        playerIdOrName: values.playerIdOrName,
        description: `问题类型：${issueTypeName}`,
        issueTypeIds: [values.issueTypeId],
      };

      const ticket = await createTicket(ticketData);
      let resolvedTicketId =
        ticket.id || (ticket as { ticketId?: string }).ticketId;

      if (!resolvedTicketId && ticket.token) {
        try {
          const detail = await getTicketByToken(ticket.token);
          resolvedTicketId = detail.id;
        } catch (detailError) {
          console.error('根据 token 获取工单详情失败:', detailError);
        }
      }

      if (!resolvedTicketId) {
        throw new Error('工单创建成功但未返回 ID');
      }

      if (!ticket.token) {
        throw new Error('工单创建成功但未返回 token');
      }

      // 保存工单信息到 store
      setTicket(resolvedTicketId, ticket.ticketNo, ticket.token);

      // 检查是否有在线客服
      const hasOnlineAgents = (ticket as any).hasOnlineAgents;
      const sessionCreated = (ticket as any).sessionCreated;

      if (!hasOnlineAgents) {
        // 没有在线客服，显示提示信息
        Modal.info({
          title: '已收到您的反馈',
          content: (
            <div>
              <p style={{ marginBottom: 12 }}>
                已经接到您的反馈，我们会尽快处理，目前暂时没有人工客服在线。
              </p>
              {ticket.ticketNo && (
                <p style={{ marginBottom: 12, fontWeight: 'bold', fontSize: '16px' }}>
                  工单号：{ticket.ticketNo}
                </p>
              )}
              <p style={{ marginTop: 8, color: '#666' }}>
                客服上线后会优先处理您的工单，请耐心等待。您可以通过工单号查看处理进度。
              </p>
            </div>
          ),
          okText: '知道了',
          onOk: () => {
            // 跳转到工单页面
            navigate(`/ticket/${ticket.token}`);
          },
        });
        return;
      }

      // 有在线客服，检查是否已创建会话
      if (sessionCreated) {
        // 优先使用后端返回的会话ID
        const returnedSessionId = (ticket as any).sessionId;
        
        if (returnedSessionId) {
          // 后端已返回会话ID，直接跳转到排队页面
          console.log('使用后端返回的会话ID，跳转到排队页面:', returnedSessionId);
          navigate(`/queue/${returnedSessionId}`);
        } else {
          // 如果后端没有返回会话ID，等待后查询
          await new Promise(resolve => setTimeout(resolve, 1000));
          
          // 尝试多次查询会话（最多3次，每次间隔500ms）
          let session = null;
          for (let i = 0; i < 3; i++) {
            try {
              session = await getActiveSessionByTicket(resolvedTicketId);
              if (session) {
                break;
              }
              // 如果查询不到，等待后重试
              if (i < 2) {
                await new Promise(resolve => setTimeout(resolve, 500));
              }
            } catch (error) {
              console.error(`查询会话失败 (尝试 ${i + 1}/3):`, error);
            }
          }
          
          if (session) {
            // 后端已创建会话，跳转到排队页面
            console.log('找到会话，跳转到排队页面:', session.id);
            navigate(`/queue/${session.id}`);
          } else {
            // 如果查询不到会话，尝试创建会话
            console.warn('未找到已创建的会话，尝试创建新会话');
            try {
              const newSession = await createSession({ ticketId: resolvedTicketId });
              // 跳转到排队页面
              navigate(`/queue/${newSession.id}`);
            } catch (error: any) {
              console.error('创建会话失败:', error);
              // 如果创建会话失败，跳转到工单聊天页面
              navigate(`/ticket/${ticket.token}`);
            }
          }
        }
      } else {
        // 如果后端没有创建会话，尝试创建会话
        try {
          const session = await createSession({ ticketId: resolvedTicketId });
          // 跳转到排队页面
          navigate(`/queue/${session.id}`);
        } catch (error: any) {
          console.error('创建会话失败:', error);
          // 如果创建会话失败，跳转到工单聊天页面
          navigate(`/ticket/${ticket.token}`);
        }
      }
    } catch (error: unknown) {
      console.error('创建工单失败:', error);
      messageApi.error('创建工单失败，请重试');
      setLoading(false);
    }
  };

  return (
    <div className="page-container">
      <Card 
        title={
          <div style={{ textAlign: 'center' }}>
            <Title level={3} style={{ margin: 0, color: '#1a202c' }}>
              身份验证
            </Title>
            <Text type="secondary" style={{ fontSize: 14, marginTop: 8, display: 'block' }}>
              请填写以下信息以开始反馈
            </Text>
          </div>
        }
        className="page-card"
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
              {Array.isArray(games) &&
                games.map((game) => (
                  <Option key={game.id} value={game.id}>
                    {game.name}
                  </Option>
                ))}
            </Select>
          </Form.Item>

          <Form.Item
            label="输入区服"
            name="serverName"
            rules={[
              { required: true, message: '请输入区服名称' },
              { max: 50, message: '区服名称不能超过50个字符' },
            ]}
          >
            <Input 
              placeholder="请输入区服名称，例如：一区、二区" 
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

          <Form.Item
            label="问题类型"
            name="issueTypeId"
            rules={[{ required: true, message: '请选择问题类型' }]}
          >
            <Select
              placeholder="请选择问题类型"
              size="large"
              showSearch
              filterOption={(input, option) =>
                (option?.label as string ?? '').toLowerCase().includes(input.toLowerCase())
              }
              onChange={() => {
                // 问题类型选择处理
              }}
            >
              {issueTypes.map((type) => (
                <Option key={type.id} value={type.id} label={type.name}>
                  {type.icon} {type.name}
                </Option>
              ))}
            </Select>
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

          <Form.Item style={{ marginBottom: 0, textAlign: 'center' }}>
            <Button
              type="link"
              icon={<SearchOutlined />}
              onClick={() => navigate('/ticket-query')}
              style={{ padding: 0 }}
            >
              查询我的工单
            </Button>
          </Form.Item>
        </Form>
      </Card>
    </div>
  );
};

export default IdentityCheckPage;
