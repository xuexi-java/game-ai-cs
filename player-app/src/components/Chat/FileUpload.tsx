/**
 * 文件上传组件
 */
import { useState } from 'react';
import { Upload, Button, message, Modal } from 'antd';
import { PaperClipOutlined, FileImageOutlined } from '@ant-design/icons';
import type { UploadFile, UploadProps } from 'antd/es/upload/interface';

interface FileUploadProps {
  onFileSelect: (file: File) => void;
  accept?: string;
  maxSize?: number; // MB
}

const FileUpload = ({ 
  onFileSelect, 
  accept = 'image/jpeg,image/png,image/gif,image/webp',
  maxSize = 10 
}: FileUploadProps) => {
  const [previewVisible, setPreviewVisible] = useState(false);
  const [previewImage, setPreviewImage] = useState('');
  const [previewTitle, setPreviewTitle] = useState('');

  const beforeUpload: UploadProps['beforeUpload'] = (file) => {
    const isValidType = accept.split(',').some(type => 
      file.type.includes(type.replace('image/', '').replace('*', ''))
    );
    
    if (!isValidType) {
      message.error('文件格式不支持！');
      return false;
    }

    const isValidSize = file.size / 1024 / 1024 < maxSize;
    if (!isValidSize) {
      message.error(`文件大小不能超过 ${maxSize}MB！`);
      return false;
    }

    onFileSelect(file);
    return false; // 阻止自动上传
  };

  const handlePreview = async (file: UploadFile) => {
    if (!file.url && !file.preview) {
      file.preview = await getBase64(file.originFileObj as File);
    }

    setPreviewImage(file.url || (file.preview as string));
    setPreviewVisible(true);
    setPreviewTitle(file.name || file.url!.substring(file.url!.lastIndexOf('/') + 1));
  };

  const getBase64 = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = (error) => reject(error);
    });

  return (
    <>
      <Upload
        beforeUpload={beforeUpload}
        showUploadList={false}
        accept={accept}
        onPreview={handlePreview}
      >
        <Button
          type="text"
          icon={accept.includes('image') ? <FileImageOutlined /> : <PaperClipOutlined />}
          size="small"
          style={{ 
            border: 'none',
            color: '#999',
            padding: '4px 8px'
          }}
        />
      </Upload>

      <Modal
        open={previewVisible}
        title={previewTitle}
        footer={null}
        onCancel={() => setPreviewVisible(false)}
      >
        <img alt="preview" style={{ width: '100%' }} src={previewImage} />
      </Modal>
    </>
  );
};

export default FileUpload;
