import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { Message, InputMode, MenuItem, TicketInfo, MenuContent } from '@/types'
import { CATEGORIES } from '@/types'

export const useChatStore = defineStore('chat', () => {
  // 状态
  const messages = ref<Message[]>([])
  const inputMode = ref<InputMode>('LOCKED')
  const isWaitingReply = ref(false)
  const selectedCategory = ref<string>('')
  const activeTicket = ref<TicketInfo | null>(null)
  const showActiveTicketModal = ref(false)
  const isTyping = ref(false)
  const queuePosition = ref(0)
  const estimatedWaitTime = ref<number | null>(null)
  const assignedAgent = ref<string>('')
  const showAgentOfflineModal = ref(false)
  const showSafeExitButton = ref(false)
  const hasAiResponse = ref(false)  // AI 是否已回复（用于控制转人工按钮显示）
  const isTicketReady = ref(false)  // 工单是否已创建成功（用于控制消息发送）
  const pendingMessages = ref<Array<{ text: string; type: 'TEXT' | 'IMAGE' }>>([])  // 等待工单就绪的消息队列

  // 计算属性
  const canInput = computed(() => inputMode.value === 'CHAT' && !isWaitingReply.value)
  const isInQueue = computed(() => queuePosition.value > 0)
  const hasAgent = computed(() => !!assignedAgent.value)
  const categorySelected = computed(() => !!selectedCategory.value)

  // 生成消息 ID
  function generateMsgId(): string {
    return `msg_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
  }

  // Actions
  function addMessage(msg: Omit<Message, 'clientMsgId'> & { clientMsgId?: string }) {
    const message: Message = {
      clientMsgId: msg.clientMsgId || generateMsgId(),
      timestamp: Date.now(),
      ...msg
    }
    messages.value.push(message)
    return message.clientMsgId
  }

  function updateMessageStatus(clientMsgId: string, status: Message['status']) {
    const msg = messages.value.find(m => m.clientMsgId === clientMsgId)
    if (msg) {
      msg.status = status
    }
  }

  function removeMessage(clientMsgId: string) {
    const index = messages.value.findIndex(m => m.clientMsgId === clientMsgId)
    if (index !== -1) {
      messages.value.splice(index, 1)
    }
  }

  function clearMessages() {
    messages.value = []
  }

  function setInputMode(mode: InputMode) {
    inputMode.value = mode
  }

  function setWaitingReply(waiting: boolean) {
    isWaitingReply.value = waiting
  }

  function setCategory(category: string) {
    selectedCategory.value = category
  }

  function setActiveTicket(ticket: TicketInfo | null) {
    activeTicket.value = ticket
    showActiveTicketModal.value = !!ticket
  }

  function hideActiveTicketModal() {
    showActiveTicketModal.value = false
  }

  function setTyping(typing: boolean) {
    isTyping.value = typing
  }

  function setQueuePosition(position: number, waitTime?: number | null) {
    console.log('[ChatStore] 设置排队位置:', { position, waitTime, 之前位置: queuePosition.value })
    queuePosition.value = position
    if (waitTime !== undefined) {
      estimatedWaitTime.value = waitTime
    }
  }

  function setAssignedAgent(agent: string) {
    assignedAgent.value = agent
    queuePosition.value = 0
    estimatedWaitTime.value = null
  }

  function setShowAgentOfflineModal(show: boolean) {
    showAgentOfflineModal.value = show
  }

  function setShowSafeExitButton(show: boolean) {
    showSafeExitButton.value = show
  }

  function setHasAiResponse(value: boolean) {
    hasAiResponse.value = value
  }

  function setTicketReady(ready: boolean) {
    isTicketReady.value = ready
  }

  function addPendingMessage(text: string, type: 'TEXT' | 'IMAGE' = 'TEXT') {
    pendingMessages.value.push({ text, type })
  }

  function getPendingMessages() {
    const msgs = [...pendingMessages.value]
    pendingMessages.value = []
    return msgs
  }

  // 显示分类菜单
  function showCategoryMenu(questList?: Array<{ id: string; name: string; icon?: string }>) {
    // 如果有后端返回的问题类型列表，转换格式使用；否则使用静态后备数据
    const menuContent: MenuContent = questList && questList.length > 0
      ? {
          title: '您好，这里是客服中心。\n请选择您遇到的问题类型：',
          items: questList.map(q => ({ id: q.id, label: q.name }))
        }
      : CATEGORIES

    addMessage({
      sender: 'AI',
      type: 'MENU',
      content: menuContent
    })
  }

  // 处理分类选择
  function handleCategorySelect(item: MenuItem) {
    setCategory(item.label)

    // 用户选择上屏
    addMessage({
      sender: 'PLAYER',
      type: 'TEXT',
      content: item.label
    })

    return item.label
  }

  // 添加系统消息
  function addSystemMessage(content: string) {
    addMessage({
      sender: 'SYSTEM',
      type: 'TEXT',
      content
    })
  }

  // 重置状态
  function reset() {
    messages.value = []
    inputMode.value = 'LOCKED'
    isWaitingReply.value = false
    selectedCategory.value = ''
    activeTicket.value = null
    showActiveTicketModal.value = false
    isTyping.value = false
    queuePosition.value = 0
    estimatedWaitTime.value = null
    assignedAgent.value = ''
    showAgentOfflineModal.value = false
    showSafeExitButton.value = false
    hasAiResponse.value = false
    isTicketReady.value = false
    pendingMessages.value = []
  }

  return {
    // 状态
    messages,
    inputMode,
    isWaitingReply,
    selectedCategory,
    activeTicket,
    showActiveTicketModal,
    isTyping,
    queuePosition,
    estimatedWaitTime,
    assignedAgent,
    showAgentOfflineModal,
    showSafeExitButton,
    hasAiResponse,
    isTicketReady,
    pendingMessages,
    // 计算
    canInput,
    isInQueue,
    hasAgent,
    categorySelected,
    // Actions
    addMessage,
    updateMessageStatus,
    removeMessage,
    clearMessages,
    setInputMode,
    setWaitingReply,
    setCategory,
    setActiveTicket,
    hideActiveTicketModal,
    setTyping,
    setQueuePosition,
    setAssignedAgent,
    setShowAgentOfflineModal,
    setShowSafeExitButton,
    setHasAiResponse,
    setTicketReady,
    addPendingMessage,
    getPendingMessages,
    showCategoryMenu,
    handleCategorySelect,
    addSystemMessage,
    reset
  }
})
