/**
 * 文件上传服务
 */
import apiClient from './api';

export interface UploadResponse {
  id: string;
  fileUrl: string;
  fileName: string;
  fileType: string;
  fileSize: number;
}

/**
 * 上传工单附件
 */
export interface UploadTicketAttachmentPayload {
  ticketId?: string;
  ticketToken?: string;
  sessionId?: string;
}

export const uploadTicketAttachment = async (
  file: File,
  payload: UploadTicketAttachmentPayload,
): Promise<UploadResponse> => {
  const formData = new FormData();
  formData.append('file', file);
  if (payload.ticketId) {
    formData.append('ticketId', payload.ticketId);
  }
  if (payload.ticketToken) {
    formData.append('ticketToken', payload.ticketToken);
  }
  if (payload.sessionId) {
    formData.append('sessionId', payload.sessionId);
  }

  const response = await apiClient.post('/upload/ticket-attachment', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  });
  
  return response.data || response;
};

