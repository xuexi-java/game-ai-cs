<script setup lang="ts">
import { ref, onUnmounted, computed } from 'vue'
import { useChat } from '@/composables/useChat'
import { getBridge } from '@/services/bridge'
import ChatHeader from '@/components/ChatHeader.vue'
import ChatMain from '@/components/ChatMain.vue'
import ChatFooter from '@/components/ChatFooter.vue'
import TicketResumeModal from '@/components/TicketResumeModal.vue'
import AgentOfflineModal from '@/components/AgentOfflineModal.vue'
import ImagePreview from '@/components/ImagePreview.vue'
import CloseConfirmModal from '@/components/CloseConfirmModal.vue'
import QueueBanner from '@/components/QueueBanner.vue'
import RatingCard from '@/components/RatingCard.vue'

// 评价卡片 ref
const ratingCardRef = ref<InstanceType<typeof RatingCard> | null>(null)

const {
  chatStore,
  connectionStore,
  resumeTicket,
  startNewIssue,
  handleCategorySelect,
  sendText,
  sendImages,
  transferToAgent,
  handleContinueAi,
  saveTicketAndExit,
  safeExit,
  close,
  retry,
  endConsultation,
  handleRatingSubmit
} = useChat()

// 处理评价提交（包装原函数，成功后更新卡片状态）
async function onRatingSubmit(data: { rating: number; comment: string }) {
  await handleRatingSubmit(data)
  // 提交成功后更新卡片为已提交状态
  if (chatStore.hasRated) {
    ratingCardRef.value?.setSubmitted()
  }
}

// 图片预览
const previewUrl = ref<string | null>(null)

function openPreview(url: string) {
  previewUrl.value = url
}

function closePreview() {
  previewUrl.value = null
}

// 关闭确认弹窗
const showCloseConfirm = ref(false)

// 是否有活跃工单
const hasActiveTicket = computed(() => {
  return !!chatStore.activeTicket && chatStore.activeTicket.status !== 'RESOLVED'
})

// 点击关闭按钮时显示确认弹窗
function handleCloseClick() {
  showCloseConfirm.value = true
}

// 取消关闭
function handleCloseCancel() {
  showCloseConfirm.value = false
}

// 确认关闭（暂时离开）
function handleCloseConfirm() {
  showCloseConfirm.value = false
  close()
}

// 结束咨询并关闭
async function handleEndConsultation() {
  showCloseConfirm.value = false
  await endConsultation()
  close()
}

// 关闭 WebView（初始化失败时直接关闭）
function handleClose() {
  getBridge().close()
}

// 重试冷却逻辑
const COOLDOWN_SECONDS = 3
const retryCount = ref(0)
const isRetrying = ref(false)
const cooldownSeconds = ref(0)
let cooldownTimer: ReturnType<typeof setInterval> | null = null

function clearCooldownTimer() {
  if (cooldownTimer) {
    clearInterval(cooldownTimer)
    cooldownTimer = null
  }
}

async function handleRetry() {
  if (isRetrying.value || cooldownSeconds.value > 0) return

  isRetrying.value = true
  retryCount.value++

  await retry()

  isRetrying.value = false

  // 如果仍然失败，启动冷却（首次不需要冷却）
  if (connectionStore.initFailed && retryCount.value > 1) {
    cooldownSeconds.value = COOLDOWN_SECONDS
    clearCooldownTimer()
    cooldownTimer = setInterval(() => {
      cooldownSeconds.value--
      if (cooldownSeconds.value <= 0) {
        clearCooldownTimer()
      }
    }, 1000)
  }
}

onUnmounted(() => {
  clearCooldownTimer()
})
</script>

<template>
  <div class="chat-container flex flex-col bg-[#F2F4F7] shadow-2xl relative overflow-hidden">
    <!-- 初始化中 -->
    <template v-if="connectionStore.isInitializing">
      <div class="flex flex-col items-center justify-center h-full">
        <div class="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mb-4 animate-pulse">
          <i class="ri-customer-service-2-line text-3xl text-blue-600" />
        </div>
        <p class="text-gray-500 text-sm">正在连接客服中心...</p>
      </div>
    </template>

    <!-- 初始化失败：显示错误信息 + 重试按钮 -->
    <template v-else-if="connectionStore.initFailed">
      <div class="flex flex-col items-center justify-center h-full px-6">
        <!-- 错误图标 -->
        <div class="w-16 h-16 mb-4 rounded-full bg-red-100 flex items-center justify-center">
          <i class="ri-wifi-off-line text-3xl text-red-500" />
        </div>

        <!-- 错误信息 -->
        <p class="text-gray-700 text-base font-medium mb-2">连接失败</p>
        <p class="text-gray-500 text-sm text-center mb-6">
          {{ connectionStore.errorMessage || '无法连接到客服中心' }}
        </p>

        <!-- 错误码（仅开发模式显示） -->
        <p v-if="connectionStore.errorCode" class="text-gray-400 text-xs mb-4">
          错误码: {{ connectionStore.errorCode }}
        </p>

        <!-- 按钮组 -->
        <div class="flex gap-3">
          <button
            :disabled="isRetrying || cooldownSeconds > 0"
            class="px-6 py-2.5 bg-blue-600 text-white rounded-full text-sm font-medium shadow-lg shadow-blue-200 hover:bg-blue-700 active:scale-95 transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            @click="handleRetry"
          >
            <i v-if="isRetrying" class="ri-loader-4-line animate-spin" />
            <i v-else class="ri-refresh-line" />
            <span v-if="cooldownSeconds > 0">重试 ({{ cooldownSeconds }}s)</span>
            <span v-else>重试</span>
          </button>
          <button
            class="px-6 py-2.5 bg-gray-200 text-gray-600 rounded-full text-sm font-medium hover:bg-gray-300 active:scale-95 transition-all"
            @click="handleClose"
          >
            关闭
          </button>
        </div>
      </div>
    </template>

    <!-- 正常内容 -->
    <template v-else>
      <!-- 关闭确认弹窗 -->
      <CloseConfirmModal
        v-if="showCloseConfirm"
        :has-active-ticket="hasActiveTicket"
        @cancel="handleCloseCancel"
        @confirm="handleCloseConfirm"
        @end-consultation="handleEndConsultation"
      />

      <!-- 继续咨询弹窗 -->
      <TicketResumeModal
        v-if="chatStore.showActiveTicketModal"
        :ticket="chatStore.activeTicket"
        @resume="resumeTicket"
        @new-issue="startNewIssue"
      />

      <!-- 客服不在线弹窗 -->
      <AgentOfflineModal
        v-if="chatStore.showAgentOfflineModal"
        :working-hours="connectionStore.workingHours"
        :offline-reason="connectionStore.offlineReason"
        @continue-ai="handleContinueAi"
        @save-ticket="saveTicketAndExit"
      />

      <!-- 图片预览 -->
      <ImagePreview
        v-if="previewUrl"
        :url="previewUrl"
        @close="closePreview"
      />

      <!-- 头部 -->
      <ChatHeader
        :is-connected="connectionStore.isConnected"
        @close="handleCloseClick"
      />

      <!-- 排队状态横幅（固定在头部下方） -->
      <QueueBanner
        v-if="chatStore.isInQueue"
        :position="chatStore.queuePosition"
        :wait-time="chatStore.estimatedWaitTime"
      />

      <!-- 消息列表 -->
      <ChatMain
        :messages="chatStore.messages"
        :is-typing="chatStore.isTyping"
        :category-selected="chatStore.categorySelected"
        @category-select="handleCategorySelect"
        @preview="openPreview"
      >
        <!-- 评价卡片（工单关闭且有客服参与时显示在消息列表底部） -->
        <template #bottom>
          <RatingCard
            v-if="chatStore.showRatingCard && !chatStore.hasRated"
            ref="ratingCardRef"
            @submit="onRatingSubmit"
          />
        </template>
      </ChatMain>

      <!-- 输入区域 -->
      <ChatFooter
        :input-mode="chatStore.inputMode"
        :is-waiting-reply="chatStore.isWaitingReply"
        :can-transfer="connectionStore.isConnected && !chatStore.hasAgent && !chatStore.isInQueue && !!chatStore.activeTicket && chatStore.hasAiResponse"
        :show-safe-exit-button="chatStore.showSafeExitButton"
        :is-session-ended="chatStore.showRatingCard || chatStore.hasRated"
        @send-text="sendText"
        @send-images="sendImages"
        @transfer="transferToAgent"
        @safe-exit="safeExit"
      />
    </template>
  </div>
</template>
