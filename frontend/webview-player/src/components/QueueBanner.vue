<script setup lang="ts">
defineProps<{
  position: number
  waitTime?: number | null
}>()
</script>

<template>
  <div class="queue-banner">
    <div class="queue-content">
      <!-- 左侧动画图标 -->
      <div class="queue-icon">
        <div class="pulse-ring" />
        <i class="ri-customer-service-2-fill" />
      </div>

      <!-- 中间信息 -->
      <div class="queue-info">
        <div class="queue-title">正在为您转接人工客服</div>
        <div class="queue-detail">
          <span class="queue-position">
            当前排队 <strong>第 {{ position }} 位</strong>
          </span>
          <span v-if="waitTime && waitTime > 0" class="queue-wait">
            · 预计等待 {{ waitTime }} 分钟
          </span>
        </div>
      </div>

      <!-- 右侧加载动画 -->
      <div class="queue-loading">
        <span class="dot" />
        <span class="dot" />
        <span class="dot" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.queue-banner {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  padding: 12px 16px;
  margin: 8px 12px;
  border-radius: 12px;
  box-shadow: 0 4px 15px rgba(102, 126, 234, 0.3);
  animation: slideDown 0.3s ease-out;
}

@keyframes slideDown {
  from {
    opacity: 0;
    transform: translateY(-10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.queue-content {
  display: flex;
  align-items: center;
  gap: 12px;
}

.queue-icon {
  position: relative;
  width: 40px;
  height: 40px;
  background: rgba(255, 255, 255, 0.2);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.queue-icon i {
  font-size: 20px;
  color: white;
  z-index: 1;
}

.pulse-ring {
  position: absolute;
  inset: -4px;
  border: 2px solid rgba(255, 255, 255, 0.4);
  border-radius: 50%;
  animation: pulse 1.5s ease-out infinite;
}

@keyframes pulse {
  0% {
    transform: scale(1);
    opacity: 1;
  }
  100% {
    transform: scale(1.3);
    opacity: 0;
  }
}

.queue-info {
  flex: 1;
  min-width: 0;
}

.queue-title {
  color: white;
  font-size: 14px;
  font-weight: 600;
  margin-bottom: 2px;
}

.queue-detail {
  color: rgba(255, 255, 255, 0.85);
  font-size: 12px;
}

.queue-position strong {
  color: #ffd700;
  font-weight: 600;
}

.queue-wait {
  opacity: 0.8;
}

.queue-loading {
  display: flex;
  gap: 4px;
  padding-right: 4px;
}

.queue-loading .dot {
  width: 6px;
  height: 6px;
  background: rgba(255, 255, 255, 0.6);
  border-radius: 50%;
  animation: bounce 1.4s ease-in-out infinite both;
}

.queue-loading .dot:nth-child(1) {
  animation-delay: -0.32s;
}

.queue-loading .dot:nth-child(2) {
  animation-delay: -0.16s;
}

@keyframes bounce {
  0%, 80%, 100% {
    transform: scale(0.6);
    opacity: 0.4;
  }
  40% {
    transform: scale(1);
    opacity: 1;
  }
}
</style>
