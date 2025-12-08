/**
 * 提交工单页面（合并身份验证和问题描述表单）
 */
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Form,
  Input,
  Button,
  Card,
  Upload,
  DatePicker,
  Typography,
  Select,
  Divider,
  Modal,
} from 'antd';
import { UploadOutlined, SearchOutlined, CopyOutlined } from '@ant-design/icons';
import type { UploadFile } from 'antd/es/upload/interface';
import dayjs from 'dayjs';
import { getEnabledGames, type Game } from '../../services/game.service';
import { getEnabledIssueTypes, type IssueType } from '../../services/issue-type.service';
import { createTicket, getTicketByToken, checkOpenTicketByIssueType } from '../../services/ticket.service';
import { uploadTicketAttachment } from '../../services/upload.service';
import { createSession, getActiveSessionByTicket } from '../../services/session.service';
import { useMessage } from '../../hooks/useMessage';
import { useTicketStore } from '../../stores/ticketStore';
import {
  validateDescription,
  validatePaymentOrderNo,
  validateFileSize,
  validateFileType,
  validateGameId,
  validatePlayerIdOrName,
} from '../../utils/validation';
import './index.css';

const { TextArea } = Input;
const { Option } = Select;
const { Title, Text } = Typography;

const SubmitTicketPage = () => {
  const navigate = useNavigate();
  const [form] = Form.useForm();
  const [games, setGames] = useState<Game[]>([]);
  const [issueTypes, setIssueTypes] = useState<IssueType[]>([]);
  const [fileList, setFileList] = useState<UploadFile[]>([]);
  const [loading, setLoading] = useState(false);
  const messageApi = useMessage();
  const { gameId, serverName, playerIdOrName, issueTypeIds, setTicket } = useTicketStore();

  // 加载游戏列表和问题类型
  useEffect(() => {
    const loadData = async () => {
      try {
        const [gameList, issueTypeList] = await Promise.all([
          getEnabledGames(),
          getEnabledIssueTypes(),
        ]);
        
        if (Array.isArray(gameList)) {
          setGames(gameList);
        } else {
          setGames([]);
        }

        if (Array.isArray(issueTypeList)) {
          setIssueTypes(issueTypeList);
        }
      } catch (error) {
        console.error('加载数据失败:', error);
        // 只在开发环境或严重错误时显示提示，避免用户困惑
        // 静默失败，让用户继续使用表单（可能部分数据加载成功）
      }
    };
    loadData();
  }, [messageApi]);

  // 如果 store 中有已保存的身份信息，预填充表单
  useEffect(() => {
    if (gameId && playerIdOrName && issueTypeIds && issueTypeIds.length > 0) {
      form.setFieldsValue({
        gameId,
        serverName,
        playerIdOrName,
        issueTypeId: issueTypeIds[0], // 使用第一个问题类型
      });
    }
  }, [gameId, serverName, playerIdOrName, issueTypeIds, form]);

  // 复制工单号函数
  const handleCopyTicketNo = (ticketNo: string) => {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(ticketNo)
        .then(() => messageApi.success('工单号已复制到剪贴板'))
        .catch(() => messageApi.error('复制失败，请手动复制'));
    } else {
      // 降级方案：使用 document.execCommand
      const textArea = document.createElement('textarea');
      textArea.value = ticketNo;
      document.body.appendChild(textArea);
      textArea.select();
      try {
        document.execCommand('copy');
        messageApi.success('工单号已复制到剪贴板');
      } catch {
        messageApi.error('复制失败，请手动复制');
      }
      document.body.removeChild(textArea);
    }
  };

  // 提交表单
  const handleSubmit = async (values: {
    gameId: string;
    serverName: string;
    playerIdOrName: string;
    issueTypeId: string;
    description: string;
    occurredAt?: dayjs.Dayjs;
    paymentOrderNo?: string;
  }) => {
    setLoading(true);
    try {
      // 验证问题类型
      if (!values.issueTypeId || typeof values.issueTypeId !== 'string') {
        messageApi.error('问题类型选择无效，请重新选择');
        setLoading(false);
        return;
      }

      const issueTypeIds = [values.issueTypeId];

      // 获取选中的问题类型信息
      const selectedIssueType = issueTypes.find((type) => type.id === values.issueTypeId);
      const requiresDirectTransfer = selectedIssueType?.requireDirectTransfer || false;

      // 检查是否有相同问题类型的未完成工单
      const checkResult = await checkOpenTicketByIssueType({
        gameId: values.gameId,
        serverId: values.serverName, // 使用 serverName 作为标识
        playerIdOrName: values.playerIdOrName,
        issueTypeId: values.issueTypeId,
      });

      if (checkResult.hasOpenTicket && checkResult.ticket) {
        // 如果已有未完成工单，静默跳转，不显示提示（避免用户困惑）
        // 移除 messageApi.info，直接跳转
        navigate(`/ticket/${checkResult.ticket.token}`);
        return;
      }

      // 创建工单
      const ticketData = {
        gameId: values.gameId,
        serverName: values.serverName,
        playerIdOrName: values.playerIdOrName,
        description: values.description,
        occurredAt: values.occurredAt?.toISOString(),
        paymentOrderNo: values.paymentOrderNo,
        issueTypeIds: issueTypeIds,
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

      // 保存工单信息到 store
      if (ticket.token) {
        setTicket(resolvedTicketId, ticket.ticketNo, ticket.token);
      }

      // 上传附件
      if (fileList.length > 0) {
        const uploadPromises = fileList.map((file) => {
          if (file.originFileObj) {
            return uploadTicketAttachment(file.originFileObj!, {
              ticketId: resolvedTicketId,
              ticketToken: ticket.token || undefined,
            });
          }
          return Promise.resolve(null);
        });
        await Promise.all(uploadPromises);
      }

      // 根据是否直接转人工决定跳转逻辑
      if (requiresDirectTransfer) {
        // 直接转人工：检查是否有在线客服
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
                  <div style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontWeight: 'bold', fontSize: '16px' }}>
                      工单号：{ticket.ticketNo}
                    </span>
                    <Button
                      type="text"
                      size="small"
                      icon={<CopyOutlined />}
                      onClick={() => handleCopyTicketNo(ticket.ticketNo!)}
                    >
                      复制
                    </Button>
                  </div>
                )}
                <p style={{ marginTop: 8, color: '#666' }}>
                  客服上线后会优先处理您的工单，请耐心等待。您可以通过工单号查看处理进度。
                </p>
              </div>
            ),
            okText: '知道了',
            onOk: () => {
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
      } else {
        // 非直接转人工：进入AI聊天流程
        const session = await createSession({ ticketId: resolvedTicketId });
        navigate(`/chat/${session.id}`);
      }
    } catch (error: unknown) {
      console.error('提交表单失败:', error);
      const apiError = error as {
        response?: { data?: { message?: string } };
      };
      messageApi.error(apiError.response?.data?.message || '提交反馈失败，请重试');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="submit-ticket-page">
      <Card className="submit-ticket-card">
        <div className="submit-ticket-header">
          <Title level={3}>提交工单</Title>
          <Text type="secondary">请填写以下信息，我们会尽快为您处理</Text>
        </div>

        <Form
          form={form}
          layout="vertical"
          onFinish={handleSubmit}
          autoComplete="off"
          className="submit-ticket-form"
        >
          {/* 身份信息区域 */}
          <div className="form-section">
            <Title level={5}>身份信息</Title>
            <Form.Item
              name="gameId"
              label="选择游戏"
              rules={[{ validator: validateGameId }]}
            >
              <Select
                placeholder="请选择游戏"
                size="large"
                showSearch
                filterOption={(input, option) =>
                  (option?.children as string)?.toLowerCase().includes(input.toLowerCase())
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
              rules={[{ validator: validatePlayerIdOrName }]}
            >
              <Input
                placeholder="请输入玩家ID或昵称"
                size="large"
              />
            </Form.Item>

            <Form.Item
              name="issueTypeId"
              label="问题类型"
              rules={[{ required: true, message: '请选择问题类型' }]}
            >
              <Select
                placeholder="请选择问题类型"
                size="large"
                showSearch
                filterOption={(input, option) =>
                  (option?.children as string)?.toLowerCase().includes(input.toLowerCase())
                }
              >
                {issueTypes.map((type) => (
                  <Option key={type.id} value={type.id}>
                    {type.name}
                  </Option>
                ))}
              </Select>
            </Form.Item>
          </div>

          <Divider />

          {/* 问题描述区域 */}
          <div className="form-section">
            <Title level={5}>问题描述</Title>
            <Form.Item
              label="问题描述"
              name="description"
              rules={[{ validator: validateDescription }]}
            >
              <TextArea
                rows={6}
                placeholder="请详细描述您遇到的问题..."
                maxLength={2000}
                showCount
              />
            </Form.Item>

            <Form.Item label="问题发生时间" name="occurredAt">
              <DatePicker
                showTime
                style={{ width: '100%' }}
                size="large"
                placeholder="请选择问题发生时间（可选）"
              />
            </Form.Item>

            <Form.Item label="问题截图">
              <Upload
                listType="picture-card"
                fileList={fileList}
                onChange={({ fileList: newFileList }) => {
                  setFileList(newFileList.slice(0, 9));
                }}
                beforeUpload={(file) => {
                  const allowedTypes = ['image/jpeg', 'image/png', 'image/gif'];
                  try {
                    validateFileType(file, allowedTypes);
                    validateFileSize(file, 10);
                    return false;
                  } catch (error: unknown) {
                    if (error instanceof Error) {
                      messageApi.error(error.message);
                    } else {
                      messageApi.error('文件校验失败，请重试');
                    }
                    return Upload.LIST_IGNORE;
                  }
                }}
                accept="image/jpeg,image/png,image/gif"
                maxCount={9}
              >
                {fileList.length < 9 && (
                  <div>
                    <UploadOutlined />
                    <div style={{ marginTop: 8 }}>上传</div>
                  </div>
                )}
              </Upload>
              <div className="upload-hint">
                支持 JPG、PNG、GIF 格式，最多可上传 9 张图片
              </div>
            </Form.Item>

            <Form.Item
              label="最近一次充值订单号"
              name="paymentOrderNo"
              rules={[{ validator: validatePaymentOrderNo }]}
            >
              <Input
                placeholder="请输入充值订单号（可选，用于核对）"
                size="large"
              />
            </Form.Item>
          </div>

          {/* 操作区域 */}
          <Form.Item>
            <Button
              type="primary"
              htmlType="submit"
              block
              size="large"
              loading={loading}
            >
              提交并开始咨询
            </Button>
          </Form.Item>

          <Form.Item style={{ marginBottom: 0, textAlign: 'center' }}>
            <Button
              type="link"
              icon={<SearchOutlined />}
              onClick={() => navigate('/ticket-query')}
            >
              查询我的工单
            </Button>
          </Form.Item>
        </Form>
      </Card>
    </div>
  );
};

export default SubmitTicketPage;

