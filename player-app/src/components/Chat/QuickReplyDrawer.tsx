import { useEffect, useState } from 'react';
import {
  Drawer,
  Tabs,
  List,
  Button,
  Empty,
  message,
} from 'antd';
import { HeartOutlined, HeartFilled, CopyOutlined } from '@ant-design/icons';
import { quickReplyService } from '../../services/quickReply.service';
import './QuickReplyDrawer.css';

interface Reply {
  id: string;
  content: string;
  usageCount: number;
  favoriteCount: number;
  isFavorited: boolean;
}

interface QuickReplyDrawerProps {
  open: boolean;
  onClose: () => void;
  onInsert: (content: string, replyId: string) => void;
}

export default function QuickReplyDrawer({
  open,
  onClose,
  onInsert,
}: QuickReplyDrawerProps) {
  const [activeTab, setActiveTab] = useState<'all' | 'favorites' | 'recent'>('all');
  const [replies, setReplies] = useState<Reply[]>([]);
  const [loading, setLoading] = useState(false);
  const [favorites, setFavorites] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (open) {
      loadReplies();
    }
  }, [open, activeTab]);

  const loadReplies = async () => {
    setLoading(true);
    try {
      let data;
      if (activeTab === 'favorites') {
        data = await quickReplyService.getUserFavorites(1, 50);
      } else if (activeTab === 'recent') {
        data = await quickReplyService.getReplies({
          sortBy: 'lastUsedAt',
          pageSize: 50,
        });
      } else {
        data = await quickReplyService.getReplies({
          sortBy: 'usageCount',
          pageSize: 50,
        });
      }
      setReplies(data.data || []);
      // 记录收藏状态
      const favSet = new Set<string>();
      (data.data || []).forEach((reply: Reply) => {
        if (reply.isFavorited) {
          favSet.add(reply.id);
        }
      });
      setFavorites(favSet);
    } catch (error) {
      message.error('加载快捷回复失败');
    } finally {
      setLoading(false);
    }
  };

  const handleInsert = async (reply: Reply) => {
    try {
      await quickReplyService.incrementUsage(reply.id);
      onInsert(reply.content, reply.id);
      message.success('已插入回复');
    } catch (error) {
      message.error('插入失败');
    }
  };

  const handleToggleFavorite = async (replyId: string) => {
    try {
      await quickReplyService.toggleFavorite(replyId);
      const newFavorites = new Set(favorites);
      if (newFavorites.has(replyId)) {
        newFavorites.delete(replyId);
      } else {
        newFavorites.add(replyId);
      }
      setFavorites(newFavorites);
      // 更新回复列表
      setReplies(replies.map(r => ({
        ...r,
        isFavorited: newFavorites.has(r.id)
      })));
      message.success('已更新收藏');
    } catch (error) {
      message.error('操作失败');
    }
  };

  const renderReplyList = () => (
    <List
      dataSource={replies}
      loading={loading}
      locale={{ emptyText: <Empty description="暂无快捷回复" /> }}
      renderItem={(reply) => (
        <List.Item
          key={reply.id}
          actions={[
            <Button
              type="text"
              icon={
                favorites.has(reply.id) ? (
                  <HeartFilled style={{ color: 'red' }} />
                ) : (
                  <HeartOutlined />
                )
              }
              onClick={() => handleToggleFavorite(reply.id)}
            />,
            <Button
              type="primary"
              icon={<CopyOutlined />}
              onClick={() => handleInsert(reply)}
            >
              插入
            </Button>,
          ]}
        >
          <List.Item.Meta
            title={<div className="reply-content">{reply.content}</div>}
            description={`使用: ${reply.usageCount} | 收藏: ${reply.favoriteCount}`}
          />
        </List.Item>
      )}
    />
  );

  return (
    <Drawer
      title="快捷回复"
      placement="right"
      onClose={onClose}
      open={open}
      width={400}
      styles={{
        body: { padding: '0px' },
      }}
    >
      <Tabs
        activeKey={activeTab}
        onChange={(key) => setActiveTab(key as any)}
        items={[
          { label: '全部', key: 'all' },
          { label: '我的收藏', key: 'favorites' },
          { label: '最近使用', key: 'recent' },
        ]}
        style={{ padding: '16px' }}
      />
      <div style={{ padding: '0 16px', marginBottom: '16px' }}>
        {renderReplyList()}
      </div>
    </Drawer>
  );
}
