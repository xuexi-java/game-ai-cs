/**
 * 网络状态指示器组件
 */
import { useState, useEffect } from 'react';
import { Alert, Typography } from 'antd';
import { WifiOutlined, DisconnectOutlined } from '@ant-design/icons';

interface NetworkStatusProps {
  wsConnected?: boolean;
}

const NetworkStatus = ({ wsConnected }: NetworkStatusProps) => {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [showOfflineAlert, setShowOfflineAlert] = useState(false);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      setShowOfflineAlert(false);
    };

    const handleOffline = () => {
      setIsOnline(false);
      setShowOfflineAlert(true);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // 如果网络正常且WebSocket连接正常，不显示任何提示
  if (isOnline && wsConnected !== false) {
    return null;
  }

  return (
    <div style={{ 
      position: 'fixed', 
      top: 0, 
      left: 0, 
      right: 0, 
      zIndex: 1000,
      padding: '8px 16px'
    }}>
      {!isOnline && showOfflineAlert && (
        <Alert
          message={
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <DisconnectOutlined />
              <Typography.Text>网络连接已断开，请检查网络设置</Typography.Text>
            </div>
          }
          type="error"
          showIcon={false}
          closable
          onClose={() => setShowOfflineAlert(false)}
        />
      )}
      
      {isOnline && wsConnected === false && (
        <Alert
          message={
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <WifiOutlined />
              <Typography.Text>实时连接已断开，正在尝试重连...</Typography.Text>
            </div>
          }
          type="warning"
          showIcon={false}
        />
      )}
    </div>
  );
};

export default NetworkStatus;
