import React, { useEffect, useState } from 'react';
import {
  Card,
  Table,
  Switch,
  Button,
  Space,
  Modal,
  Form,
  Input,
  InputNumber,
  Tag,
  Popconfirm,
  message,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  PlusOutlined,
  ReloadOutlined,
  EditOutlined,
  DeleteOutlined,
} from '@ant-design/icons';
import {
  getQuickReplyCategories,
  createQuickReplyCategory,
  updateQuickReplyCategory,
  deleteQuickReplyCategory,
} from '../../../services/quickReplyCategory.service';
import './index.css';

const { TextArea } = Input;

interface QuickReplyCategory {
  id: string;
  name: string;
  description?: string;
  sortOrder: number;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
  _count?: {
    quickReplies: number;
  };
}

const QuickReplyCategoriesPage: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [categories, setCategories] = useState<QuickReplyCategory[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<QuickReplyCategory | null>(null);
  const [form] = Form.useForm();

  // 加载分类列表
  const loadCategories = async () => {
    setLoading(true);
    try {
      const data = await getQuickReplyCategories();
      setCategories(data);
    } catch (error: any) {
      message.error('加载分类列表失败');
      console.error('加载分类列表失败:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCategories();
  }, []);

  // 打开新建/编辑弹窗
  const handleOpenModal = (category?: QuickReplyCategory) => {
    if (category) {
      setEditingCategory(category);
      form.setFieldsValue({
        name: category.name,
        description: category.description,
        sortOrder: category.sortOrder,
        enabled: category.enabled,
      });
    } else {
      setEditingCategory(null);
      form.resetFields();
      form.setFieldsValue({
        enabled: true,
        sortOrder: 0,
      });
    }
    setModalOpen(true);
  };

  // 关闭弹窗
  const handleCloseModal = () => {
    setModalOpen(false);
    setEditingCategory(null);
    form.resetFields();
  };

  // 保存分类
  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      
      if (editingCategory) {
        // 更新
        await updateQuickReplyCategory(editingCategory.id, values);
        message.success('更新分类成功');
      } else {
        // 创建
        await createQuickReplyCategory(values);
        message.success('创建分类成功');
      }
      
      handleCloseModal();
      loadCategories();
    } catch (error: any) {
      if (error.errorFields) {
        // 表单验证错误
        return;
      }
      message.error(
        editingCategory ? '更新分类失败' : '创建分类失败',
      );
      console.error('保存分类失败:', error);
    }
  };

  // 删除分类
  const handleDelete = async (category: QuickReplyCategory) => {
    try {
      const replyCount = category._count?.quickReplies || 0;
      
      if (replyCount > 0) {
        // 有关联的快捷回复，询问是否强制删除
        Modal.confirm({
          title: '确认删除',
          content: `该分类下还有 ${replyCount} 条快捷回复。删除后，这些回复的分类将被清空。是否继续？`,
          okText: '强制删除',
          okType: 'danger',
          cancelText: '取消',
          onOk: async () => {
            try {
              await deleteQuickReplyCategory(category.id, true);
              message.success('删除分类成功');
              loadCategories();
            } catch (error: any) {
              message.error('删除分类失败');
              console.error('删除分类失败:', error);
            }
          },
        });
      } else {
        // 没有关联的快捷回复，直接删除
        await deleteQuickReplyCategory(category.id, false);
        message.success('删除分类成功');
        loadCategories();
      }
    } catch (error: any) {
      message.error('删除分类失败');
      console.error('删除分类失败:', error);
    }
  };

  // 切换启用状态
  const handleToggleEnabled = async (category: QuickReplyCategory, enabled: boolean) => {
    try {
      await updateQuickReplyCategory(category.id, { enabled });
      message.success(`${enabled ? '启用' : '禁用'}分类成功`);
      loadCategories();
    } catch (error: any) {
      message.error(`${enabled ? '启用' : '禁用'}分类失败`);
      console.error('切换启用状态失败:', error);
    }
  };

  const columns: ColumnsType<QuickReplyCategory> = [
    {
      title: '分类名称',
      dataIndex: 'name',
      key: 'name',
      width: 150,
    },
    {
      title: '描述',
      dataIndex: 'description',
      key: 'description',
      ellipsis: true,
    },
    {
      title: '关联回复数',
      key: 'replyCount',
      width: 120,
      align: 'center',
      render: (_, record) => (
        <Tag color="blue">{record._count?.quickReplies || 0}</Tag>
      ),
    },
    {
      title: '排序',
      dataIndex: 'sortOrder',
      key: 'sortOrder',
      width: 80,
      align: 'center',
    },
    {
      title: '状态',
      dataIndex: 'enabled',
      key: 'enabled',
      width: 100,
      align: 'center',
      render: (enabled: boolean, record) => (
        <Switch
          checked={enabled}
          onChange={(checked) => handleToggleEnabled(record, checked)}
        />
      ),
    },
    {
      title: '创建时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 180,
      render: (text: string) => new Date(text).toLocaleString('zh-CN'),
    },
    {
      title: '操作',
      key: 'action',
      width: 150,
      fixed: 'right',
      render: (_, record) => (
        <Space size="small">
          <Button
            type="link"
            size="small"
            icon={<EditOutlined />}
            onClick={() => handleOpenModal(record)}
          >
            编辑
          </Button>
          <Popconfirm
            title="确认删除"
            description={`确定要删除分类"${record.name}"吗？`}
            onConfirm={() => handleDelete(record)}
            okText="确定"
            cancelText="取消"
            okType="danger"
          >
            <Button
              type="link"
              size="small"
              danger
              icon={<DeleteOutlined />}
            >
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div className="quick-reply-categories-page">
      <Card
        title="快捷回复分类管理"
        extra={
          <Space>
            <Button
              icon={<ReloadOutlined />}
              onClick={loadCategories}
              loading={loading}
            >
              刷新
            </Button>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => handleOpenModal()}
            >
              新建分类
            </Button>
          </Space>
        }
      >
        <Table
          columns={columns}
          dataSource={categories}
          rowKey="id"
          loading={loading}
          pagination={{
            pageSize: 20,
            showSizeChanger: true,
            showTotal: (total) => `共 ${total} 条`,
          }}
        />
      </Card>

      <Modal
        title={editingCategory ? '编辑分类' : '新建分类'}
        open={modalOpen}
        onOk={handleSave}
        onCancel={handleCloseModal}
        okText="保存"
        cancelText="取消"
        width={600}
      >
        <Form
          form={form}
          layout="vertical"
          initialValues={{
            enabled: true,
            sortOrder: 0,
          }}
        >
          <Form.Item
            label="分类名称"
            name="name"
            rules={[
              { required: true, message: '请输入分类名称' },
              { max: 20, message: '分类名称不能超过20个字符' },
            ]}
          >
            <Input placeholder="例如：问候语" maxLength={20} />
          </Form.Item>

          <Form.Item
            label="描述"
            name="description"
            rules={[{ max: 200, message: '描述不能超过200个字符' }]}
          >
            <TextArea
              placeholder="分类描述（可选）"
              rows={3}
              maxLength={200}
              showCount
            />
          </Form.Item>

          <Form.Item
            label="排序"
            name="sortOrder"
            rules={[
              { type: 'number', min: 0, message: '排序值不能小于0' },
            ]}
          >
            <InputNumber min={0} style={{ width: '100%' }} />
          </Form.Item>

          <Form.Item
            label="状态"
            name="enabled"
            valuePropName="checked"
          >
            <Switch checkedChildren="启用" unCheckedChildren="禁用" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default QuickReplyCategoriesPage;

