/**
 * 图片压缩工具
 * 使用 Canvas API 进行客户端图片压缩
 * 针对游戏截图场景优化
 */

export interface CompressOptions {
  maxWidth?: number;      // 最大宽度，默认 1440
  maxHeight?: number;     // 最大高度，默认 1440
  quality?: number;       // 压缩质量 0-1，默认 0.85
  skipThreshold?: number; // 跳过压缩的文件大小阈值(字节)，默认 500KB
  preserveFormat?: boolean; // 保留原格式，默认 true
}

export interface CompressResult {
  file: File;
  originalSize: number;
  compressedSize: number;
  compressionRatio: number;  // 压缩比例 (0-1)
  width: number;
  height: number;
}

const DEFAULT_OPTIONS: Required<CompressOptions> = {
  maxWidth: 1440,
  maxHeight: 1440,
  quality: 0.85,
  skipThreshold: 500 * 1024, // 500KB
  preserveFormat: true,
};

/**
 * 压缩图片文件
 * @param file 原始图片文件
 * @param options 压缩选项
 * @returns 压缩后的文件和压缩信息
 */
export async function compressImage(
  file: File,
  options: CompressOptions = {}
): Promise<CompressResult> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const originalSize = file.size;

  // 非图片文件直接返回
  if (!file.type.startsWith('image/')) {
    return {
      file,
      originalSize,
      compressedSize: originalSize,
      compressionRatio: 1,
      width: 0,
      height: 0,
    };
  }

  // GIF 不压缩（保留动画）
  if (file.type === 'image/gif') {
    return {
      file,
      originalSize,
      compressedSize: originalSize,
      compressionRatio: 1,
      width: 0,
      height: 0,
    };
  }

  // 小于阈值的图片不压缩（截图通常较小）
  if (file.size < opts.skipThreshold) {
    const dimensions = await getImageDimensions(file);
    return {
      file,
      originalSize,
      compressedSize: originalSize,
      compressionRatio: 1,
      ...dimensions,
    };
  }

  try {
    // 加载图片
    const img = await loadImage(file);

    // 计算目标尺寸
    const { width, height } = calculateDimensions(
      img.width,
      img.height,
      opts.maxWidth,
      opts.maxHeight
    );

    // 确定输出格式
    const outputMimeType = opts.preserveFormat
      ? (file.type === 'image/png' ? 'image/png' : 'image/jpeg')
      : 'image/jpeg';
    const outputExt = outputMimeType === 'image/png' ? '.png' : '.jpg';

    // 创建 Canvas 并绘制
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('无法创建 Canvas 上下文');
    }

    // 绘制白色背景（仅 JPEG 需要，处理透明图片）
    if (outputMimeType === 'image/jpeg') {
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, width, height);
    }

    // 绘制图片
    ctx.drawImage(img, 0, 0, width, height);

    // 转换为 Blob
    const blob = await canvasToBlob(canvas, outputMimeType, opts.quality);

    // 创建新文件
    const compressedFile = new File(
      [blob],
      file.name.replace(/\.[^.]+$/, outputExt),
      { type: outputMimeType }
    );

    const compressedSize = compressedFile.size;

    // 如果压缩后反而变大，返回原文件
    if (compressedSize >= originalSize) {
      console.log(`[ImageCompressor] 压缩无效，保留原文件: ${formatSize(originalSize)}`);
      return {
        file,
        originalSize,
        compressedSize: originalSize,
        compressionRatio: 1,
        width: img.width,
        height: img.height,
      };
    }

    console.log(
      `[ImageCompressor] 压缩完成: ${formatSize(originalSize)} → ${formatSize(compressedSize)} ` +
        `(${Math.round((1 - compressedSize / originalSize) * 100)}% 减少)`
    );

    return {
      file: compressedFile,
      originalSize,
      compressedSize,
      compressionRatio: compressedSize / originalSize,
      width,
      height,
    };
  } catch (error) {
    console.error('[ImageCompressor] 压缩失败:', error);
    // 压缩失败时返回原文件
    return {
      file,
      originalSize,
      compressedSize: originalSize,
      compressionRatio: 1,
      width: 0,
      height: 0,
    };
  }
}

/**
 * 加载图片
 */
function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(img.src);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(img.src);
      reject(new Error('图片加载失败'));
    };
    img.src = URL.createObjectURL(file);
  });
}

/**
 * 获取图片尺寸
 */
async function getImageDimensions(
  file: File
): Promise<{ width: number; height: number }> {
  try {
    const img = await loadImage(file);
    return { width: img.width, height: img.height };
  } catch {
    return { width: 0, height: 0 };
  }
}

/**
 * 计算目标尺寸（保持宽高比）
 */
function calculateDimensions(
  srcWidth: number,
  srcHeight: number,
  maxWidth: number,
  maxHeight: number
): { width: number; height: number } {
  let width = srcWidth;
  let height = srcHeight;

  // 如果图片尺寸小于限制，不需要缩放
  if (width <= maxWidth && height <= maxHeight) {
    return { width, height };
  }

  // 计算缩放比例
  const ratio = Math.min(maxWidth / width, maxHeight / height);
  width = Math.round(width * ratio);
  height = Math.round(height * ratio);

  return { width, height };
}

/**
 * Canvas 转 Blob
 */
function canvasToBlob(
  canvas: HTMLCanvasElement,
  mimeType: string,
  quality: number
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error('Canvas 转换失败'));
        }
      },
      mimeType,
      quality
    );
  });
}

/**
 * 格式化文件大小
 */
function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)}MB`;
}
