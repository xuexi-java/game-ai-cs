import { useEffect, useState, useRef } from 'react';
import {
  Card,
  Form,
  Input,
  Button,
  Avatar,
  Typography,
  Space,
  Divider,
  message,
} from 'antd';
import { UserOutlined, SaveOutlined, CameraOutlined } from '@ant-design/icons';
import { useAuthStore } from '../../stores/authStore';
import apiClient from '../../services/api';
import { resolveAvatarUrl } from '../../utils/avatar';
import './index.css';

const { Title, Text } = Typography;

interface ProfileFormValues {
  username: string;
  realName?: string;
  email?: string;
  phone?: string;
  password?: string;
  confirmPassword?: string;
}

const ProfilePage: React.FC = () => {
  const [form] = Form.useForm<ProfileFormValues>();
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const { user, setUser } = useAuthStore();
  const [avatarUrl, setAvatarUrl] = useState<string | undefined>(user?.avatar);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadProfile();
  }, []);

  const loadProfile = async () => {
    try {
      const response = await apiClient.get('/users/me');
      const userData = response.data || response;
      form.setFieldsValue({
        username: userData.username,
        realName: userData.realName || '',
        email: userData.email || '',
        phone: userData.phone || '',
      });
      setAvatarUrl(resolveAvatarUrl(userData.avatar));
    } catch (error) {
      console.error('加载个人资料失败:', error);
      message.error('加载个人资料失败');
    }
  };

  const handleAvatarClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileUpload = async (file: File) => {
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const response = await apiClient.post('/upload/avatar', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const result = response.data || response;
      setAvatarUrl(resolveAvatarUrl(result.fileUrl));
      if (result.user) {
        setUser({ ...user!, ...result.user });
      }
      message.success('头像上传成功');
    } catch (error: any) {
      console.error('上传头像失败:', error);
      message.error(error.response?.data?.message || error.message || '上传头像失败');
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async (values: ProfileFormValues) => {
    setLoading(true);
    try {
      const { confirmPassword, ...updateData } = values;
      if (!updateData.password || updateData.password.trim() === '') {
        delete updateData.password;
      }
      const response = await apiClient.patch('/users/me', updateData);
      const updatedUser = response.data || response;
      setUser({ ...user!, ...updatedUser });
      message.success('个人资料更新成功');
      form.resetFields();
      form.setFieldsValue({
        username: updatedUser.username,
        realName: updatedUser.realName || '',
        email: updatedUser.email || '',
        phone: updatedUser.phone || '',
      });
    } catch (error: any) {
      console.error('更新个人资料失败:', error);
      message.error(error.response?.data?.message || error.message || '更新个人资料失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="profile-page">
      <Card>
        <Space direction="vertical" size="large" style={{ width: '100%' }}>
          <div>
            <Title level={3}>个人资料</Title>
            <Text type="secondary">管理您的个人信息和账户设置</Text>
          </div>
          <Divider />
          <div className="profile-avatar-section">
            <div className="avatar-upload-wrapper">
              <Avatar
                size={100}
                icon={<UserOutlined />}
                src={avatarUrl}
                className="profile-avatar"
                onError={() => { setAvatarUrl(undefined); return false; }}
              />
              <div
                className="avatar-upload-overlay"
                onClick={handleAvatarClick}
                style={{ cursor: uploading ? 'wait' : 'pointer' }}
              >
                <CameraOutlined style={{ fontSize: 24, color: '#fff' }} />
                <Text style={{ color: '#fff', fontSize: 12, marginTop: 4 }}>
                  {uploading ? '上传中...' : '点击上传'}
                </Text>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/gif,image/webp"
                style={{ display: 'none' }}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFileUpload(file);
                }}
              />
            </div>
            <div>
              <Text strong>{user?.username}</Text>
              <br />
              <Text type="secondary">{user?.role === 'ADMIN' ? '管理员' : '客服'}</Text>
            </div>
          </div>
          <Divider />
          <Form form={form} layout="vertical" onFinish={handleSubmit} style={{ maxWidth: 600 }}>
            <Form.Item label="用户名" name="username" rules={[{ required: true, message: '请输入用户名' }]}>
              <Input disabled />
            </Form.Item>
            <Form.Item label="真实姓名" name="realName">
              <Input placeholder="请输入真实姓名" />
            </Form.Item>
            <Form.Item label="邮箱" name="email" rules={[{ type: 'email', message: '请输入有效的邮箱地址' }]}>
              <Input placeholder="请输入邮箱地址" />
            </Form.Item>
            <Form.Item label="手机号" name="phone" rules={[{ pattern: /^1[3-9]d{9}$/, message: '请输入有效的手机号' }]}>
              <Input placeholder="请输入手机号" />
            </Form.Item>
            <Divider>修改密码（可选）</Divider>
            <Form.Item label="新密码" name="password" rules={[{ min: 6, message: '密码长度至少6位' }]}>
              <Input.Password placeholder="留空则不修改密码" />
            </Form.Item>
            <Form.Item
              label="确认密码"
              name="confirmPassword"
              dependencies={['password']}
              rules={[
                ({ getFieldValue }) => ({
                  validator(_, value) {
                    if (!value || getFieldValue('password') === value) return Promise.resolve();
                    return Promise.reject(new Error('两次输入的密码不一致'));
                  },
                }),
              ]}
            >
              <Input.Password placeholder="请再次输入新密码" />
            </Form.Item>
            <Form.Item>
              <Button type="primary" htmlType="submit" icon={<SaveOutlined />} loading={loading}>
                保存更改
              </Button>
            </Form.Item>
          </Form>
        </Space>
      </Card>
    </div>
  );
};

export default ProfilePage;
