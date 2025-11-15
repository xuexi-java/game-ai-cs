/**
 * 表情选择器组件
 */
import { useState } from 'react';
import { Popover, Button } from 'antd';
import { SmileOutlined } from '@ant-design/icons';

interface EmojiPickerProps {
  onEmojiSelect: (emoji: string) => void;
}

const EMOJI_LIST = [
  '😀', '😃', '😄', '😁', '😆', '😅', '😂', '🤣', '😊', '😇',
  '🙂', '🙃', '😉', '😌', '😍', '🥰', '😘', '😗', '😙', '😚',
  '😋', '😛', '😝', '😜', '🤪', '🤨', '🧐', '🤓', '😎', '🤩',
  '🥳', '😏', '😒', '😞', '😔', '😟', '😕', '🙁', '☹️', '😣',
  '😖', '😫', '😩', '🥺', '😢', '😭', '😤', '😠', '😡', '🤬',
  '🤯', '😳', '🥵', '🥶', '😱', '😨', '😰', '😥', '😓', '🤗',
  '🤔', '🤭', '🤫', '🤥', '😶', '😐', '😑', '😬', '🙄', '😯',
  '😦', '😧', '😮', '😲', '🥱', '😴', '🤤', '😪', '😵', '🤐',
  '🥴', '🤢', '🤮', '🤧', '😷', '🤒', '🤕', '🤑', '🤠', '😈',
  '👍', '👎', '👌', '✌️', '🤞', '🤟', '🤘', '🤙', '👈', '👉',
  '👆', '🖕', '👇', '☝️', '👋', '🤚', '🖐️', '✋', '🖖', '👏',
  '🙌', '👐', '🤲', '🤝', '🙏', '✍️', '💪', '🦾', '🦿', '🦵',
  '❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💔',
  '❣️', '💕', '💞', '💓', '💗', '💖', '💘', '💝', '💟', '☮️',
  '✝️', '☪️', '🕉️', '☸️', '✡️', '🔯', '🕎', '☯️', '☦️', '🛐',
];

const EmojiPicker = ({ onEmojiSelect }: EmojiPickerProps) => {
  const [visible, setVisible] = useState(false);

  const handleEmojiClick = (emoji: string) => {
    onEmojiSelect(emoji);
    setVisible(false);
  };

  const content = (
    <div style={{ 
      width: 280, 
      maxHeight: 200, 
      overflowY: 'auto',
      display: 'grid',
      gridTemplateColumns: 'repeat(10, 1fr)',
      gap: '4px',
      padding: '8px'
    }}>
      {EMOJI_LIST.map((emoji, index) => (
        <button
          key={index}
          onClick={() => handleEmojiClick(emoji)}
          style={{
            border: 'none',
            background: 'transparent',
            fontSize: '18px',
            padding: '4px',
            cursor: 'pointer',
            borderRadius: '4px',
            transition: 'background 0.2s',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = '#f5f5f5';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'transparent';
          }}
        >
          {emoji}
        </button>
      ))}
    </div>
  );

  return (
    <Popover
      content={content}
      title="选择表情"
      trigger="click"
      open={visible}
      onOpenChange={setVisible}
      placement="topLeft"
    >
      <Button
        type="text"
        icon={<SmileOutlined />}
        size="small"
        style={{ 
          border: 'none',
          color: '#999',
          padding: '4px 8px'
        }}
      />
    </Popover>
  );
};

export default EmojiPicker;
