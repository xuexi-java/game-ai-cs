/**
 * 加载组件
 */
import { Spin, Typography } from 'antd';
import './Loading.css';

interface LoadingProps {
  text?: string;
  size?: 'small' | 'default' | 'large';
  fullscreen?: boolean;
}

const Loading = ({ 
  text = '加载中...', 
  size = 'large',
  fullscreen = false 
}: LoadingProps) => {
  const containerClass = fullscreen ? 'loading-fullscreen' : 'loading-container';

  return (
    <div className={containerClass}>
      <div className="loading-content">
        <Spin size={size} />
        <Typography.Text className="loading-text">
          {text}
        </Typography.Text>
      </div>
    </div>
  );
};

export default Loading;
