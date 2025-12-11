import { useState } from 'react';
import { Form, Input, Button, Card, Typography, Divider, Space } from 'antd';
import { UserOutlined, LockOutlined, CustomerServiceOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { login, saveUserInfo } from '../../services/auth.service';
import { useAuthStore } from '../../stores/authStore';
import type { LoginRequest } from '../../types';
import { useMessage } from '../../hooks/useMessage';
import './index.css';

const { Title, Text } = Typography;

const LoginPage: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { setUser } = useAuthStore();
  const message = useMessage();

  const handleLogin = async (values: LoginRequest) => {
    setLoading(true);
    try {
      const response = await login(values);
      
      // 保存用户信息
      saveUserInfo(response.accessToken, response.user);
      setUser(response.user);
      
      // 连接WebSocket（延迟导入避免循环依赖）
      const { websocketService } = await import('../../services/websocket.service');
      websocketService.connect(response.accessToken);
      
      message.success('登录成功，欢迎使用AI客服管理系统！');
      const targetRoute = response.user.role === 'ADMIN' ? '/dashboard' : '/workbench/queue';
      navigate(targetRoute);
    } catch (error: any) {
      console.error('登录失败:', error);
      
      // ✅ 修复：根据错误类型显示准确的消息
      if (error?.response?.status === 401) {
        // 401 错误：用户名或密码错误
        const errorMessage = error.response?.data?.message || '用户名或密码错误';
        message.error(errorMessage);
      } else if (error?.response) {
        // 其他 HTTP 错误
        message.error(error.response.data?.message || '登录失败，请重试');
      } else if (error?.message) {
        // 其他错误
        message.error(error.message);
      } else {
        // 网络错误
        message.error('网络连接失败，请检查网络后重试');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-container">
      <div className="login-content-wrapper">
        <div className="login-content">
          <Card className="login-card">
            <div className="login-header">
              <div className="brand-section">
                <CustomerServiceOutlined className="brand-icon" />
                <Title level={1} className="brand-title">AI智能客服管理系统</Title>
                <Text className="brand-subtitle">基于人工智能技术的现代化客服管理平台</Text>
              </div>
              
              <div className="login-title-section">
                <Title level={2}>欢迎登录</Title>
                <Text type="secondary">请使用您的管理员账号登录系统</Text>
              </div>
            </div>
              
              <Form
                name="login"
                onFinish={handleLogin}
                autoComplete="off"
                size="large"
                className="login-form"
              >
                <Form.Item
                  name="username"
                  rules={[
                    { required: true, message: '请输入用户名' },
                    { min: 3, message: '用户名至少3个字符' }
                  ]}
                >
                  <Input
                    prefix={<UserOutlined className="input-icon" />}
                    placeholder="请输入用户名"
                    autoComplete="username"
                  />
                </Form.Item>

                <Form.Item
                  name="password"
                  rules={[
                    { required: true, message: '请输入密码' },
                    { min: 6, message: '密码至少6个字符' }
                  ]}
                >
                  <Input.Password
                    prefix={<LockOutlined className="input-icon" />}
                    placeholder="请输入密码"
                    autoComplete="current-password"
                  />
                </Form.Item>

                <Form.Item>
                  <Button
                    type="primary"
                    htmlType="submit"
                    loading={loading}
                    block
                    className="login-button"
                  >
                    {loading ? '登录中...' : '立即登录'}
                  </Button>
                </Form.Item>
              </Form>         
            <div className="login-footer">
              <Text type="secondary" style={{ fontSize: '12px' }}>
                © 2025 智能客服管理系统 - 为您提供专业的客服解决方案
              </Text>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
