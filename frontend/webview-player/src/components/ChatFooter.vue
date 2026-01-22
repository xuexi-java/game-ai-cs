<script setup lang="ts">
import { ref } from 'vue'
import type { InputMode } from '@/types'

// 配置常量
const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5MB
const MAX_FILE_COUNT = 5 // 最多5张

const props = defineProps<{
  inputMode: InputMode
  isWaitingReply: boolean
  canTransfer: boolean
  showSafeExitButton: boolean
  isSessionEnded?: boolean  // 咨询是否已结束（用于显示不同的锁定提示）
}>()

const emit = defineEmits<{
  sendText: [text: string]
  sendImages: [files: File[]]
  transfer: []
  safeExit: []
}>()

const inputText = ref('')
const fileInput = ref<HTMLInputElement | null>(null)
const toastMessage = ref('')
const showToast = ref(false)

function handleSend() {
  if (!inputText.value.trim()) return
  emit('sendText', inputText.value)
  inputText.value = ''
}

function triggerFileUpload() {
  if (props.isWaitingReply) return
  fileInput.value?.click()
}

function showToastMessage(message: string) {
  toastMessage.value = message
  showToast.value = true
  setTimeout(() => {
    showToast.value = false
  }, 3000)
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`
}

function handleFileUpload(event: Event) {
  const input = event.target as HTMLInputElement
  const files = input.files

  if (!files || files.length === 0) {
    input.value = ''
    return
  }

  // 检查数量限制
  if (files.length > MAX_FILE_COUNT) {
    showToastMessage(`最多只能选择 ${MAX_FILE_COUNT} 张图片`)
    input.value = ''
    return
  }

  const validFiles: File[] = []
  const oversizedFiles: string[] = []

  // 检查每个文件的大小
  for (let i = 0; i < files.length; i++) {
    const file = files[i]
    if (file.size > MAX_FILE_SIZE) {
      oversizedFiles.push(`${file.name} (${formatFileSize(file.size)})`)
    } else {
      validFiles.push(file)
    }
  }

  // 如果有超大文件，显示提示
  if (oversizedFiles.length > 0) {
    const maxSizeMB = MAX_FILE_SIZE / (1024 * 1024)
    if (oversizedFiles.length === files.length) {
      // 全部超大
      showToastMessage(`图片大小不能超过 ${maxSizeMB}MB`)
    } else {
      // 部分超大
      showToastMessage(`已过滤 ${oversizedFiles.length} 张超大图片（>${maxSizeMB}MB）`)
    }
  }

  // 发送有效文件
  if (validFiles.length > 0) {
    emit('sendImages', validFiles)
  }

  input.value = ''
}
</script>

<template>
  <footer class="bg-white border-t p-3 shrink-0 z-20 pb-safe relative">
    <!-- Toast 提示 -->
    <Transition name="toast">
      <div
        v-if="showToast"
        class="absolute -top-16 left-1/2 -translate-x-1/2 bg-gray-800/90 text-white px-4 py-2 rounded-lg text-sm whitespace-nowrap shadow-lg z-50"
      >
        {{ toastMessage }}
      </div>
    </Transition>

    <!-- 安全退出按钮 -->
    <Transition name="fade">
      <div v-if="showSafeExitButton" class="absolute -top-14 left-0 w-full flex justify-center pointer-events-none">
        <button
          class="pointer-events-auto bg-orange-500 text-white px-6 py-2.5 rounded-full text-sm font-bold shadow-lg shadow-orange-200 hover:bg-orange-600 flex items-center gap-2 transition-all active:scale-95"
          @click="emit('safeExit')"
        >
          <i class="ri-logout-box-r-line" /> 安全退出
        </button>
      </div>
    </Transition>

    <!-- 转人工按钮 -->
    <Transition name="fade">
      <div
        v-if="inputMode === 'CHAT' && !isWaitingReply && canTransfer"
        class="absolute -top-10 left-0 w-full flex justify-center pointer-events-none"
      >
        <button
          class="pointer-events-auto bg-white/90 backdrop-blur border border-blue-100 text-blue-600 px-4 py-1.5 rounded-full text-xs font-medium shadow-sm hover:bg-blue-50 flex items-center gap-1 transition-all active:scale-95"
          @click="emit('transfer')"
        >
          <i class="ri-customer-service-fill" /> 转人工客服
        </button>
      </div>
    </Transition>

    <!-- 等待回复状态 -->
    <div v-if="isWaitingReply" class="flex gap-2 items-center">
      <div class="flex-1 bg-gray-100 text-gray-400 px-4 py-3 rounded-2xl text-center text-xs select-none border border-transparent flex items-center justify-center gap-2">
        <i class="ri-loader-4-line animate-spin" /> 对方正在输入...
      </div>
    </div>

    <!-- 锁定状态 -->
    <div v-else-if="inputMode === 'LOCKED'" class="flex gap-2 items-center">
      <div class="flex-1 bg-gray-100 text-gray-400 px-4 py-3 rounded-2xl text-center text-xs select-none">
        {{ isSessionEnded ? '本次咨询已结束' : '请在上方选择问题分类' }}
      </div>
    </div>

    <!-- 正常输入状态 -->
    <div v-else class="flex gap-2 items-end">
      <button
        class="text-gray-400 hover:text-blue-600 p-2 transition-colors rounded-full hover:bg-gray-50 active:scale-95"
        @click="triggerFileUpload"
      >
        <i class="ri-image-add-line text-2xl" />
      </button>
      <input
        ref="fileInput"
        type="file"
        accept="image/*"
        multiple
        class="hidden"
        @change="handleFileUpload"
      />

      <div class="flex-1 bg-gray-50 rounded-2xl px-4 py-2 transition-colors focus-within:bg-white focus-within:ring-2 focus-within:ring-blue-100 border border-gray-100">
        <textarea
          v-model="inputText"
          :disabled="isWaitingReply"
          rows="1"
          placeholder="请描述具体问题..."
          class="w-full bg-transparent outline-none resize-none max-h-24 text-gray-800 text-sm py-1 placeholder-gray-400"
          @keydown.enter.prevent="handleSend"
        />
      </div>

      <button
        :disabled="!inputText.trim() || isWaitingReply"
        class="bg-blue-600 text-white w-10 h-10 rounded-full flex items-center justify-center hover:bg-blue-700 disabled:opacity-50 disabled:scale-95 transition-all shadow-lg shadow-blue-200 shrink-0"
        @click="handleSend"
      >
        <i class="ri-send-plane-fill" />
      </button>
    </div>
  </footer>
</template>

<style scoped>
.toast-enter-active,
.toast-leave-active {
  transition: all 0.3s ease;
}

.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(-10px);
}
</style>
