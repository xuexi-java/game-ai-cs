/**
 * 步骤3：前置信息采集表单页
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
} from 'antd';
import { UploadOutlined } from '@ant-design/icons';
import type { UploadFile } from 'antd/es/upload/interface';
import dayjs from 'dayjs';
import { createTicket, getTicketByToken } from '../../services/ticket.service';
import { uploadTicketAttachment } from '../../services/upload.service';
import { useTicketStore } from '../../stores/ticketStore';
import { createSession } from '../../services/session.service';
import { useMessage } from '../../hooks/useMessage';
import {
  validateDescription,
  validatePaymentOrderNo,
  validateFileSize,
  validateFileType,
} from '../../utils/validation';
import './index.css';

const { TextArea } = Input;
const { Title, Text } = Typography;

const text = {
  pageTitle: '问题反馈表单',
  descriptionLabel: '问题描述',
  descriptionPlaceholder: '请详细描述您遇到的问题...',
  occurredAtLabel: '问题发生时间',
  occurredAtPlaceholder: '请选择问题发生时间（可选）',
  attachmentsLabel: '问题截图',
  uploadText: '上传',
  uploadHint: '支持 JPG、PNG、GIF 格式，最多可上传 9 张图片',
  paymentOrderLabel: '最近一次充值订单号',
  paymentOrderPlaceholder: '请输入充值订单号（可选，用于核对）',
  submitText: '提交并开始咨询',
  submitError: '提交反馈失败，请重试',
};

const IntakeFormPage = () => {
  const navigate = useNavigate();
  const [form] = Form.useForm();
  const [fileList, setFileList] = useState<UploadFile[]>([]);
  const [loading, setLoading] = useState(false);
  const messageApi = useMessage();
  const { gameId, serverId, serverName, playerIdOrName, issueTypeIds, ticketToken, setTicket } =
    useTicketStore();
  const hasIdentity = Boolean(gameId && playerIdOrName && issueTypeIds.length > 0);

  useEffect(() => {
    if (!hasIdentity) {
      navigate('/identity-check', { replace: true });
    }
  }, [hasIdentity, navigate]);

  // 未完成身份校验时跳转回去
  if (!hasIdentity) {
    return null;
  }

  // 提交表单
  const handleSubmit = async (values: {
    description: string;
    occurredAt?: dayjs.Dayjs;
    paymentOrderNo?: string;
  }) => {
    setLoading(true);
    try {
      // 验证问题类型
      if (!issueTypeIds || issueTypeIds.length === 0) {
        messageApi.error('请先选择问题类型');
        setLoading(false);
        return;
      }

      // 过滤并验证 issueTypeIds（只验证是否为非空字符串）
      const validIssueTypeIds = issueTypeIds.filter((id) => {
        if (!id || typeof id !== 'string' || id.trim() === '') {
          console.warn('无效的问题类型 ID:', id);
          return false;
        }
        return true;
      });

      if (validIssueTypeIds.length === 0) {
        messageApi.error('问题类型 ID 无效，请重新选择问题类型');
        setLoading(false);
        return;
      }

      const ticketData = {
        gameId: gameId!,
        serverId: serverId ?? undefined,
        serverName: serverName ?? undefined,
        playerIdOrName: playerIdOrName!,
        description: values.description,
        occurredAt: values.occurredAt?.toISOString(),
        paymentOrderNo: values.paymentOrderNo,
        issueTypeIds: validIssueTypeIds, // 使用验证后的有效 ID 数组
        // 注意：attachments 不在创建工单时发送，而是在创建后单独上传
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

      setTicket(resolvedTicketId, ticket.ticketNo, ticket.token);

      if (fileList.length > 0) {
        const uploadPromises = fileList.map((file) => {
          if (file.originFileObj) {
            return uploadTicketAttachment(file.originFileObj!, {
              ticketId: resolvedTicketId,
              ticketToken: ticket.token || ticketToken || undefined,
            });
          }
          return Promise.resolve(null);
        });
        await Promise.all(uploadPromises);
      }

      const session = await createSession({ ticketId: resolvedTicketId });
      navigate(`/chat/${session.id}`);
    } catch (error: unknown) {
      console.error('提交表单失败:', error);
      const apiError = error as {
        response?: { data?: { message?: string } };
      };
      messageApi.error(apiError.response?.data?.message || text.submitError);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page-container">
      <Card className="page-card">
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <Title level={3} style={{ margin: 0, color: '#1a202c', letterSpacing: '-0.3px' }}>
            {text.pageTitle}
          </Title>
          <Text type="secondary" style={{ fontSize: 14, marginTop: 8, display: 'block' }}>
            请详细描述您遇到的问题，以便我们更好地为您服务
          </Text>
        </div>

        <Form
          form={form}
          layout="vertical"
          onFinish={handleSubmit}
          autoComplete="off"
          className="enhanced-form"
        >
          <Form.Item
            label={text.descriptionLabel}
            name="description"
            rules={[{ validator: validateDescription }]}
          >
            <TextArea
              rows={6}
              placeholder={text.descriptionPlaceholder}
              maxLength={2000}
              showCount
            />
          </Form.Item>

          <Form.Item label={text.occurredAtLabel} name="occurredAt">
            <DatePicker
              showTime
              style={{ width: '100%' }}
              placeholder={text.occurredAtPlaceholder}
            />
          </Form.Item>

          <Form.Item label={text.attachmentsLabel}>
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
                  <div style={{ marginTop: 8 }}>{text.uploadText}</div>
                </div>
              )}
            </Upload>
            <div className="upload-hint">
              {text.uploadHint}
            </div>
          </Form.Item>

          <Form.Item
            label={text.paymentOrderLabel}
            name="paymentOrderNo"
            rules={[{ validator: validatePaymentOrderNo }]}
          >
            <Input placeholder={text.paymentOrderPlaceholder} />
          </Form.Item>

          <Form.Item>
            <Button
              type="primary"
              htmlType="submit"
              block
              size="large"
              loading={loading}
            >
              {text.submitText}
            </Button>
          </Form.Item>
        </Form>
        </Card>
    </div>
  );
};

export default IntakeFormPage;
