/**
 * 文件上传服务
 */
import apiClient from './api';

export interface UploadResponse {
  fileUrl: string;
  fileName: string;
  fileType: string;
  fileSize: number;
}

/**
 * 上传工单附件
 */
export const uploadTicketAttachment = async (
  file: File,
  ticketId: string
): Promise<UploadResponse> => {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('ticketId', ticketId);

  return apiClient.post('/upload/ticket-attachment', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  });
};
