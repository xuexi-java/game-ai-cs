/**
 * 步骤3：前置信息采集表单页
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Form,
  Input,
  Button,
  Card,
  Upload,
  DatePicker,
  message,
  Typography,
} from 'antd';
import { UploadOutlined } from '@ant-design/icons';
import type { UploadFile } from 'antd/es/upload/interface';
import dayjs from 'dayjs';
import { createTicket } from '../../services/ticket.service';
import { uploadTicketAttachment } from '../../services/upload.service';
import { useTicketStore } from '../../stores/ticketStore';
import { createSession } from '../../services/session.service';
import {
  validateDescription,
  validatePaymentOrderNo,
  validateFileSize,
  validateFileType,
} from '../../utils/validation';

const { TextArea } = Input;
const { Title } = Typography;

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
  const { gameId, serverId, playerIdOrName, setTicket } = useTicketStore();

  // 未完成身份校验时跳转回去
  if (!gameId || !serverId || !playerIdOrName) {
    navigate('/identity-check');
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
      const ticketData = {
        gameId: gameId!,
        serverId: serverId!,
        playerIdOrName: playerIdOrName!,
        description: values.description,
        occurredAt: values.occurredAt?.toISOString(),
        paymentOrderNo: values.paymentOrderNo,
        attachments: [],
      };

      const ticket = await createTicket(ticketData);
      setTicket(ticket.id, ticket.ticketNo, ticket.token);

      if (fileList.length > 0) {
        const uploadPromises = fileList.map((file) => {
          if (file.originFileObj) {
            return uploadTicketAttachment(file.originFileObj, ticket.id);
          }
          return Promise.resolve(null);
        });
        await Promise.all(uploadPromises);
      }

      const session = await createSession({ ticketId: ticket.id });
      navigate(`/chat/${session.id}`);
    } catch (error: any) {
      console.error('提交表单失败:', error);
      message.error(error.response?.data?.message || text.submitError);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page-container">
      <div style={{ maxWidth: 800, width: '100%' }}>
        <Card className="page-card fade-in-up">
          <Title level={3} style={{ textAlign: 'center', marginBottom: '24px' }}>
            {text.pageTitle}
          </Title>

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

            <Form.Item label={text.attachmentsLabel} name="attachments">
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
                  } catch (error: any) {
                    message.error(error.message);
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
              <div style={{ color: '#999', fontSize: '12px', marginTop: '8px' }}>
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
    </div>
  );
};

export default IntakeFormPage;
