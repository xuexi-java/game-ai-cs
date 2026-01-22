import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { PlayerInfo } from '@/types'

export const useConnectionStore = defineStore('connection', () => {
  // 状态
  const isConnected = ref(false)
  const isConnecting = ref(false)
  const isInitializing = ref(true)  // 初始化中
  const initFailed = ref(false)     // 初始化失败
  const playerInfo = ref<PlayerInfo | null>(null)
  const currentTid = ref<string | null>(null)
  const currentSessionId = ref<string | null>(null)  // 当前会话ID（用于评价提交）
  const wsUrl = ref<string>('')
  const wsToken = ref<string>('')
  const uploadToken = ref<string>('')
  const errorMessage = ref<string>('')
  const errorCode = ref<string>('')   // 错误代码
  const agentAvailable = ref(true)
  const workingHours = ref('')
  const offlineReason = ref<string | undefined>(undefined)
  const language = ref<string>('zh-CN')  // 当前语言

  // 计算属性
  const hasPlayer = computed(() => !!playerInfo.value?.uid)

  // Actions
  function setPlayerInfo(info: PlayerInfo) {
    playerInfo.value = info
  }

  function setConnecting(connecting: boolean) {
    isConnecting.value = connecting
  }

  function setConnected(connected: boolean) {
    isConnected.value = connected
    if (connected) {
      isConnecting.value = false
      errorMessage.value = ''
    }
  }

  function setConnectionInfo(tid: string | null, url: string, token: string, upload: string) {
    currentTid.value = tid
    wsUrl.value = url
    wsToken.value = token
    uploadToken.value = upload
  }

  function setCurrentTid(tid: string) {
    currentTid.value = tid
  }

  function setCurrentSessionId(sessionId: string | null) {
    currentSessionId.value = sessionId
  }

  function setError(message: string, code?: string) {
    errorMessage.value = message
    errorCode.value = code || ''
    isConnecting.value = false
  }

  // 设置初始化失败
  function setInitFailed(message: string, code?: string) {
    initFailed.value = true
    isInitializing.value = false
    errorMessage.value = message
    errorCode.value = code || ''
  }

  // 设置初始化成功
  function setInitSuccess() {
    initFailed.value = false
    isInitializing.value = false
    errorMessage.value = ''
    errorCode.value = ''
  }

  function setAgentAvailability(available: boolean, hours: string, reason?: string) {
    agentAvailable.value = available
    workingHours.value = hours
    offlineReason.value = reason
  }

  function setLanguage(lang: string) {
    language.value = lang || 'zh-CN'
  }

  function reset() {
    isConnected.value = false
    isConnecting.value = false
    isInitializing.value = true
    initFailed.value = false
    currentTid.value = null
    currentSessionId.value = null
    wsUrl.value = ''
    wsToken.value = ''
    uploadToken.value = ''
    errorMessage.value = ''
    errorCode.value = ''
    agentAvailable.value = true
    workingHours.value = ''
    offlineReason.value = undefined
    language.value = 'zh-CN'
  }

  return {
    // 状态
    isConnected,
    isConnecting,
    isInitializing,
    initFailed,
    playerInfo,
    currentTid,
    currentSessionId,
    wsUrl,
    wsToken,
    uploadToken,
    errorMessage,
    errorCode,
    agentAvailable,
    workingHours,
    offlineReason,
    language,
    // 计算
    hasPlayer,
    // Actions
    setPlayerInfo,
    setConnecting,
    setConnected,
    setConnectionInfo,
    setCurrentTid,
    setCurrentSessionId,
    setError,
    setInitFailed,
    setInitSuccess,
    setAgentAvailability,
    setLanguage,
    reset
  }
})
