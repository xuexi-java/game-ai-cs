/**
 * 快捷回复组件
 */
import { Tag } from 'antd';

interface QuickRepliesProps {
  onReplySelect: (reply: string) => void;
  replies?: string[];
}

const DEFAULT_REPLIES = [
  '你好',
  '谢谢',
  '请稍等',
  '我明白了',
  '还有其他问题吗？',
  '需要更多帮助',
  '问题已解决',
  '非常感谢',
];

const QuickReplies = ({ onReplySelect, replies = DEFAULT_REPLIES }: QuickRepliesProps) => {
  if (!replies || replies.length === 0) {
    return null;
  }

  return (
    <div style={{ 
      display: 'flex', 
      gap: '8px', 
      flexWrap: 'wrap',
      marginBottom: '12px',
      padding: '0 4px'
    }}>
      {replies.map((reply, index) => (
        <Tag
          key={index}
          onClick={() => onReplySelect(reply)}
          style={{
            cursor: 'pointer',
            borderRadius: '16px',
            padding: '4px 12px',
            border: '1px solid #d9d9d9',
            background: '#fafafa',
            color: '#666',
            transition: 'all 0.2s ease',
            fontSize: '12px',
            margin: '2px',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = '#e6f7ff';
            e.currentTarget.style.borderColor = '#91d5ff';
            e.currentTarget.style.color = '#1890ff';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = '#fafafa';
            e.currentTarget.style.borderColor = '#d9d9d9';
            e.currentTarget.style.color = '#666';
          }}
        >
          {reply}
        </Tag>
      ))}
    </div>
  );
};

export default QuickReplies;
