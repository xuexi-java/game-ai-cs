import { useState } from 'react';
import { Form, Input, Button, Card, message, Typography, Divider, Space } from 'antd';
import { UserOutlined, LockOutlined, CustomerServiceOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { login, saveUserInfo } from '../../services/auth.service';
import { useAuthStore } from '../../stores/authStore';
import { websocketService } from '../../services/websocket.service';
import type { LoginRequest } from '../../types';
import './index.css';

const { Title, Text } = Typography;

const LoginPage: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { setUser } = useAuthStore();

  const handleLogin = async (values: LoginRequest) => {
    setLoading(true);
    try {
      const response = await login(values);
      
      // 保存用户信息
      saveUserInfo(response.accessToken, response.user);
      setUser(response.user);
      
      // 连接WebSocket
      websocketService.connect(response.accessToken);
      
      message.success('登录成功，欢迎使用AI客服管理系统！');
      navigate('/dashboard');
    } catch (error) {
      console.error('登录失败:', error);
      message.error('登录失败，请检查用户名和密码');
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
              
              <Divider>演示账号</Divider>
              
            <div className="demo-accounts">
              <Space direction="vertical" style={{ width: '100%' }}>
                <div className="demo-account">
                  <Text strong>管理员账号：</Text>
                  <Text code>admin</Text>
                  <Text> / </Text>
                  <Text code>password123</Text>
                </div>
                <div className="demo-account">
                  <Text strong>客服账号：</Text>
                  <Text code>agent</Text>
                  <Text> / </Text>
                  <Text code>password123</Text>
                </div>
              </Space>
            </div>
            
            <div className="login-footer">
              <Text type="secondary" style={{ fontSize: '12px' }}>
                © 2024 AI智能客服管理系统 - 为您提供专业的客服解决方案
              </Text>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
