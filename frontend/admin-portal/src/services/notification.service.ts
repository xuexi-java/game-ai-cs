class NotificationService {
  private notificationPermission: NotificationPermission = 'default';
  private audioContext: AudioContext | null = null;
  private soundEnabled: boolean = true;

  constructor() {
    // 检查浏览器通知权限
    if ('Notification' in window) {
      this.notificationPermission = Notification.permission;
    }
    
    // 从 localStorage 读取声音设置
    this.soundEnabled = this.isSoundEnabled();
  }

  /**
   * 请求浏览器通知权限
   */
  async requestPermission(): Promise<boolean> {
    if (!('Notification' in window)) {
      console.warn('浏览器不支持通知功能');
      return false;
    }

    if (this.notificationPermission === 'granted') {
      return true;
    }

    if (this.notificationPermission === 'denied') {
      console.warn('用户已拒绝通知权限');
      return false;
    }

    try {
      const permission = await Notification.requestPermission();
      this.notificationPermission = permission;
      return permission === 'granted';
    } catch (error) {
      console.error('请求通知权限失败:', error);
      return false;
    }
  }

  /**
   * 显示浏览器通知
   */
  showNotification(title: string, options?: NotificationOptions): void {
    if (!('Notification' in window) || this.notificationPermission !== 'granted') {
      return;
    }

    // 如果页面可见，不显示通知（避免重复提示）
    if (document.visibilityState === 'visible') {
      return;
    }

    try {
      const notification = new Notification(title, {
        icon: '/favicon.ico',
        badge: '/favicon.ico',
        tag: options?.tag || 'customer-service-message', // 相同 tag 会替换旧通知
        requireInteraction: false,
        silent: false, // 允许系统提示音
        vibrate: [200, 100, 200], // 震动模式（如果支持）
        ...options,
      });

      // 点击通知时聚焦到窗口
      notification.onclick = () => {
        window.focus();
        notification.close();
      };

      // 自动关闭通知（5秒后）
      setTimeout(() => {
        notification.close();
      }, 5000);
    } catch (error) {
      console.error('显示通知失败:', error);
    }
  }

  /**
   * 播放提示音 - 美化版（更悦耳的多音调提示音）
   */
  playSound(): void {
    if (!this.soundEnabled) {
      return;
    }

    try {
      // 使用 Web Audio API 生成提示音
      if (!this.audioContext) {
        this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      }

      const now = this.audioContext.currentTime;
      
      // 创建更悦耳的双音调提示音（类似 iOS 消息提示音）
      // 第一个音调：高音（800Hz）
      const oscillator1 = this.audioContext.createOscillator();
      const gainNode1 = this.audioContext.createGain();
      
      oscillator1.connect(gainNode1);
      gainNode1.connect(this.audioContext.destination);
      
      oscillator1.frequency.value = 800;
      oscillator1.type = 'sine';
      
      // 第一个音调的音量曲线
      gainNode1.gain.setValueAtTime(0, now);
      gainNode1.gain.linearRampToValueAtTime(0.25, now + 0.01);
      gainNode1.gain.linearRampToValueAtTime(0, now + 0.15);
      
      oscillator1.start(now);
      oscillator1.stop(now + 0.15);
      
      // 第二个音调：低音（600Hz），稍微延迟
      const oscillator2 = this.audioContext.createOscillator();
      const gainNode2 = this.audioContext.createGain();
      
      oscillator2.connect(gainNode2);
      gainNode2.connect(this.audioContext.destination);
      
      oscillator2.frequency.value = 600;
      oscillator2.type = 'sine';
      
      // 第二个音调的音量曲线
      gainNode2.gain.setValueAtTime(0, now + 0.05);
      gainNode2.gain.linearRampToValueAtTime(0.2, now + 0.06);
      gainNode2.gain.linearRampToValueAtTime(0, now + 0.25);
      
      oscillator2.start(now + 0.05);
      oscillator2.stop(now + 0.25);
    } catch (error) {
      console.error('播放提示音失败:', error);
    }
  }

  /**
   * 设置声音开关
   */
  setSoundEnabled(enabled: boolean): void {
    this.soundEnabled = enabled;
    // 保存到 localStorage
    if (typeof window !== 'undefined') {
      localStorage.setItem('notification_sound_enabled', String(enabled));
    }
  }

  /**
   * 获取声音开关状态
   */
  isSoundEnabled(): boolean {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('notification_sound_enabled');
      if (stored !== null) {
        return stored === 'true';
      }
    }
    return this.soundEnabled;
  }

  /**
   * 初始化（从 localStorage 读取设置）
   */
  init(): void {
    this.soundEnabled = this.isSoundEnabled();
    // 自动请求通知权限（如果未设置）
    if (this.notificationPermission === 'default') {
      this.requestPermission().catch(console.error);
    }
  }

  /**
   * 获取通知权限状态
   */
  getPermissionStatus(): NotificationPermission {
    return this.notificationPermission;
  }
}

export const notificationService = new NotificationService();

