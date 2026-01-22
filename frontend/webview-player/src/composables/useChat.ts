import { onMounted, onUnmounted, nextTick, ref } from 'vue'
import { useChatStore } from '@/stores/chat'
import { useConnectionStore } from '@/stores/connection'
import { getBridge, getPlayerInfo, closeBridge } from '@/services/bridge'
import * as api from '@/services/api'
import { getSocket } from '@/services/socket'
import { compressImage } from '@/utils/imageCompressor'
import type {
  PlayerConnectData,
  MenuItem,
  WsMessageReceiveData,
  WsMessageAckData,
  WsQueueUpdateData,
  WsAgentAssignedData,
  WsTypingStatusData,
  WsTicketCreatedData,
  WsTicketUpdateData,
  WsTransferResultData,
  WsErrorData
} from '@/types'

export function useChat() {
  const chatStore = useChatStore()
  const connectionStore = useConnectionStore()
  const socket = getSocket()

  // Bootstrap 数据
  const bootstrapData = ref<PlayerConnectData | null>(null)

  // 初始化
  async function initialize() {
    try {
      // 1. 获取玩家信息
      const playerInfo = await getPlayerInfo()
      connectionStore.setPlayerInfo(playerInfo)
      console.log('[Chat] 玩家信息:', playerInfo)

      // 1.5. 初始化 API 服务（新增 - 远程模式）
      await api.init()

      // 检查必要参数
      if (!playerInfo.gameid || !playerInfo.uid) {
        connectionStore.setInitFailed('缺少必要的玩家信息参数', 'MISSING_PARAMS')
        return
      }

      // 2. 调用 Bootstrap 接口
      const response = await api.callPlayerApi<PlayerConnectData>(
        '/api/v1/player/connect',
        {}
      )

      if (!response.result || !response.data) {
        const errorMsg = response.error || '连接客服中心失败'
        const errorCode = response.errorCode || 'API_ERROR'
        console.error('[Chat] API 错误:', errorMsg, errorCode)
        connectionStore.setInitFailed(errorMsg, errorCode)
        return
      }

      bootstrapData.value = response.data
      const { wsUrl, wsToken, uploadToken, agentAvailable, offlineReason, workingHours, activeTicket, history, bootstrapMessages, language } = response.data

      // 3. 保存连接信息
      connectionStore.setConnectionInfo(activeTicket?.tid || null, wsUrl, wsToken, uploadToken)
      connectionStore.setAgentAvailability(agentAvailable, workingHours, offlineReason)
      if (language) {
        connectionStore.setLanguage(language)
      }

      // 4. 标记初始化成功
      connectionStore.setInitSuccess()

      // 5. 根据返回决定流程
      if (activeTicket) {
        // 有活跃工单，显示继续咨询选项
        chatStore.setActiveTicket({
          tid: activeTicket.tid,
          status: activeTicket.status,
          createdAt: activeTicket.createdAt,
          isAgentConnected: activeTicket.isAgentConnected
        })

        // 恢复工单时直接允许显示转人工按钮（之前已描述过问题）
        chatStore.setHasAiResponse(true)

        // 如果工单已有客服接入，设置标记（这样转人工后就不会限制发消息）
        if (activeTicket.isAgentConnected) {
          chatStore.setAssignedAgent('客服')  // 设置占位符，具体名称会在 onAgentAssigned 中更新
          chatStore.setHadAgentInteraction(true)  // 标记有客服参与（用于评价）
        }

        // 显示历史消息
        if (history && history.length > 0) {
          for (const msg of history) {
            // 处理图片消息的相对路径URL（使用 api.getImageUrl）
            let content = msg.content
            if (msg.messageType === 'IMAGE' && typeof content === 'string') {
              content = api.getImageUrl(content)
            }
            chatStore.addMessage({
              clientMsgId: msg.id,
              sender: msg.senderType as any,
              type: msg.messageType as any,
              content,
              timestamp: new Date(msg.createdAt).getTime()
            })
          }
        }

        // 连接 WebSocket 并恢复工单
        await connectAndResume(activeTicket.tid)
      } else {
        // 无活跃工单，显示首屏消息和分类菜单
        if (bootstrapMessages && bootstrapMessages.length > 0) {
          for (const msg of bootstrapMessages) {
            chatStore.addMessage({
              clientMsgId: msg.id,
              sender: msg.senderType as any,
              type: msg.messageType as any,
              content: msg.content
            })
          }
        }
        startNewFlow()
      }
    } catch (error) {
      console.error('[Chat] 初始化失败:', error)
      const errorMsg = error instanceof Error ? error.message : '初始化失败，请重试'
      connectionStore.setInitFailed(errorMsg, 'INIT_ERROR')
    }
  }

  // 重试初始化
  async function retry() {
    // 重置状态
    connectionStore.reset()
    chatStore.reset()
    bootstrapData.value = null

    // 重新初始化
    await initialize()
  }

  // 开始新流程
  function startNewFlow() {
    // 使用后端返回的问题类型列表
    const questList = bootstrapData.value?.questList
    chatStore.showCategoryMenu(questList)
  }

  // 继续旧工单
  async function resumeTicket() {
    chatStore.hideActiveTicketModal()

    if (chatStore.activeTicket?.tid) {
      const tid = chatStore.activeTicket.tid

      // 如果 WebSocket 已连接（从 CONFIRM_CLOSE_REQUIRED 错误恢复），直接恢复工单
      if (connectionStore.isConnected) {
        console.log('[Chat] WebSocket 已连接，直接恢复工单:', tid)
        socket.resumeTicket(tid)
        lastAttemptedIssueType.value = null // 清除上次尝试的问题类型
        return
      }

      // 否则，需要先连接 WebSocket
      await connectAndResume(tid)
    }
  }

  // 连接并恢复工单
  async function connectAndResume(tid: string) {
    if (!bootstrapData.value) return

    const { wsUrl, wsToken } = bootstrapData.value
    const absoluteWsUrl = api.getWsUrl(wsUrl)
    connectionStore.setConnecting(true)

    // 保存待恢复的工单号
    pendingResumeTid.value = tid

    // 设置事件监听
    setupSocketListeners()

    // 连接 WebSocket
    socket.connect(absoluteWsUrl, wsToken)
  }

  // 待恢复的工单号
  const pendingResumeTid = ref<string | null>(null)

  // 是否需要关闭旧工单（用户点击"咨询新问题"时设置）
  const shouldConfirmClose = ref(false)

  // 咨询新问题
  async function startNewIssue() {
    chatStore.hideActiveTicketModal()
    chatStore.setActiveTicket(null)

    // 如果有上次尝试的问题类型（从 CONFIRM_CLOSE_REQUIRED 错误恢复），直接创建工单
    if (lastAttemptedIssueType.value && connectionStore.isConnected) {
      console.log('[Chat] 从 CONFIRM_CLOSE_REQUIRED 恢复，直接创建工单:', lastAttemptedIssueType.value)
      socket.createTicket(lastAttemptedIssueType.value, true) // confirmClose=true
      lastAttemptedIssueType.value = null
      return
    }

    // 否则，记住需要关闭旧工单，并显示分类菜单
    shouldConfirmClose.value = true
    startNewFlow()
  }

  // 待创建工单的问题类型（用于 onConnectionReady 回调）
  const pendingIssueType = ref<string | null>(null)

  // 上次尝试创建工单的问题类型（用于处理 CONFIRM_CLOSE_REQUIRED 错误后重试）
  const lastAttemptedIssueType = ref<string | null>(null)

  // 处理分类选择
  async function handleCategorySelect(item: MenuItem) {
    const category = chatStore.handleCategorySelect(item)

    // 显示引导消息
    showTypingThenMessage({
      sender: 'AI',
      type: 'TEXT',
      content: `好的，您选择了【${category}】。\n请详细描述您遇到的具体情况，我们会尽快反馈。`
    }, 800, () => {
      chatStore.setInputMode('CHAT')
    })

    // 连接 WebSocket 并创建工单
    if (bootstrapData.value) {
      const { wsUrl, wsToken } = bootstrapData.value
      const absoluteWsUrl = api.getWsUrl(wsUrl)
      connectionStore.setConnecting(true)

      // 保存待创建工单的问题类型
      pendingIssueType.value = item.id
      console.log('[Chat] 保存待创建工单类型:', item.id)

      // 设置监听器
      setupSocketListeners()

      // 连接 WebSocket
      socket.connect(absoluteWsUrl, wsToken)
    }
  }

  // 设置 Socket 监听器
  function setupSocketListeners() {
    socket.on('onConnect', () => {
      connectionStore.setConnected(true)

      // 如果有待恢复的工单，执行恢复
      if (pendingResumeTid.value) {
        console.log('[Chat] 连接成功，恢复工单:', pendingResumeTid.value)
        socket.resumeTicket(pendingResumeTid.value)
        pendingResumeTid.value = null
      }
    })

    socket.on('onDisconnect', (reason) => {
      connectionStore.setConnected(false)
      if (reason !== 'io client disconnect') {
        chatStore.addSystemMessage('连接已断开，正在重连...')
      }
    })

    socket.on('onConnectionReady', (data) => {
      connectionStore.setConnecting(false)
      if (data.tid) {
        connectionStore.setCurrentTid(data.tid)
        // 恢复工单成功，解锁输入框，并标记工单就绪
        chatStore.setInputMode('CHAT')
        chatStore.setTicketReady(true)
        console.log('[Chat] 工单已恢复，解锁输入框')
      }

      // 保存会话ID（用于评价提交）
      if (data.sessionId) {
        connectionStore.setCurrentSessionId(data.sessionId)
        console.log('[Chat] 保存会话ID:', data.sessionId)
      }

      // 如果有待创建的工单类型，创建工单
      if (pendingIssueType.value) {
        // shouldConfirmClose 在用户点击"咨询新问题"时被设置为 true
        // 或者 bootstrap 时返回了 activeTicket
        const needConfirmClose = shouldConfirmClose.value || !!bootstrapData.value?.activeTicket
        console.log('[Chat] ConnectionReady, 创建工单:', pendingIssueType.value, '关闭旧工单:', needConfirmClose)

        // 保存问题类型，以便处理 CONFIRM_CLOSE_REQUIRED 错误后重试
        lastAttemptedIssueType.value = pendingIssueType.value

        socket.createTicket(pendingIssueType.value, needConfirmClose)
        pendingIssueType.value = null
        shouldConfirmClose.value = false // 重置标志
      }
    })

    socket.on('onTicketCreated', (data: WsTicketCreatedData) => {
      connectionStore.setCurrentTid(data.tid)
      // 工单创建成功，只更新工单信息，不显示弹窗
      // 注意：不能调用 setActiveTicket，因为它会显示 TicketResumeModal
      chatStore.activeTicket = {
        tid: data.tid,
        status: data.status as 'IN_PROGRESS' | 'WAITING' | 'RESOLVED',
        createdAt: new Date().toISOString(),
        isAgentConnected: false
      }
      // 清除上次尝试的问题类型（工单已成功创建）
      lastAttemptedIssueType.value = null

      // 保存会话ID（用于评价提交）
      if (data.sessionId) {
        connectionStore.setCurrentSessionId(data.sessionId)
        console.log('[Chat] 保存会话ID:', data.sessionId)
      }

      // 标记工单已就绪
      chatStore.setTicketReady(true)
      console.log('[Chat] 工单创建成功，开始发送队列消息')

      // 发送队列中的待发消息
      const pendingMsgs = chatStore.getPendingMessages()
      for (const msg of pendingMsgs) {
        console.log('[Chat] 发送队列消息:', msg.text)
        socket.sendMessage(msg.text, msg.type)
      }
    })

    socket.on('onMessageReceive', (data: WsMessageReceiveData) => {
      handleIncomingMessage(data)
    })

    socket.on('onMessageAck', (data: WsMessageAckData) => {
      chatStore.updateMessageStatus(data.clientMsgId, 'delivered')
    })

    socket.on('onTypingStatus', (data: WsTypingStatusData) => {
      if (data.senderType !== 'PLAYER') {
        chatStore.setTyping(data.isTyping)
      }
    })

    socket.on('onQueueUpdate', (data: WsQueueUpdateData) => {
      console.log('[Chat] 收到排队更新:', data)
      // 只更新排队位置，不添加系统消息（用 QueueBanner 组件显示）
      chatStore.setQueuePosition(data.queuePosition, data.waitTime)
    })

    socket.on('onAgentAssigned', (data: WsAgentAssignedData) => {
      // 设置客服信息，清除排队状态
      chatStore.setAssignedAgent(data.agentName)
      // 标记有客服参与（用于判断是否显示评价弹窗）
      chatStore.setHadAgentInteraction(true)
      // 客服接入后，取消等待回复的限制，玩家可以自由发送消息
      chatStore.setWaitingReply(false)
      // 添加系统消息提示客服已接入
      chatStore.addSystemMessage(`客服 ${data.agentName} 已接入，将为您提供服务`)
      scrollToBottom()
    })

    socket.on('onTransferResult', (data: WsTransferResultData) => {
      handleTransferResult(data)
    })

    socket.on('onTicketUpdate', (data: WsTicketUpdateData) => {
      console.log('[Chat] 工单状态更新:', data)
      if (data.status === 'RESOLVED') {
        // 工单已关闭
        chatStore.activeTicket = null
        if (data.closedBy === 'AGENT') {
          chatStore.addSystemMessage('客服已结束本次咨询')
        } else if (data.closedBy === 'SYSTEM') {
          chatStore.addSystemMessage('本次咨询已自动结束')
        }
        // PLAYER 关闭时不显示消息，由用户操作触发
        chatStore.setInputMode('LOCKED')

        // 保存后端返回的 sessionId（如果有），否则使用之前保存的
        if (data.sessionId) {
          connectionStore.setCurrentSessionId(data.sessionId)
        }

        // 显示评价卡片（只有与人工客服交流后才显示）
        if (chatStore.hadAgentInteraction && connectionStore.currentSessionId) {
          console.log('[Chat] 显示评价卡片, sessionId:', connectionStore.currentSessionId)
          chatStore.setShowRatingCard(true)
        }

        scrollToBottom()
      }
    })

    socket.on('onError', (data: WsErrorData) => {
      console.log('[Chat] 收到错误:', data)

      // 处理 CONFIRM_CLOSE_REQUIRED 错误
      // 这种情况发生在：Bootstrap 没有返回 activeTicket，但后端创建工单时发现有活跃工单
      if (data.code === 'CONFIRM_CLOSE_REQUIRED') {
        const errorData = data.data as { existingTicketNo?: string; existingDescription?: string } | undefined
        console.log('[Chat] 发现未关闭工单:', errorData)

        // 显示 TicketResumeModal，让用户选择
        chatStore.setActiveTicket({
          tid: errorData?.existingTicketNo || '未知',
          status: 'IN_PROGRESS',
          createdAt: new Date().toISOString(),
          isAgentConnected: false
        })

        // 标记需要确认关闭旧工单（用于下次创建时传递 confirmClose=true）
        shouldConfirmClose.value = true
        return
      }

      connectionStore.setError(data.message)
    })

    socket.on('onKicked', () => {
      chatStore.addSystemMessage('您已在其他设备登录')
      connectionStore.setConnected(false)
    })

    // Token 失效时自动刷新并重连
    // 注意：SocketService 内部已有 maxTokenRefreshAttempts 限制，超限后会触发 onError
    socket.on('onTokenInvalid', async () => {
      console.log('[Chat] wsToken 失效，尝试重新获取...')

      try {
        // 添加短暂延迟，避免过于频繁的请求
        await new Promise(resolve => setTimeout(resolve, 500))

        // 重新调用 Bootstrap 获取新 token
        const response = await api.callPlayerApi<PlayerConnectData>(
          '/api/v1/player/connect',
          {}
        )

        if (response.result && response.data) {
          const { wsUrl, wsToken, uploadToken } = response.data

          // 更新缓存的 token
          connectionStore.setConnectionInfo(
            connectionStore.currentTid,
            wsUrl,
            wsToken,
            uploadToken
          )
          bootstrapData.value = response.data

          console.log('[Chat] wsToken 刷新成功，重新连接...')

          // 使用新 token 重连
          const absoluteWsUrl = api.getWsUrl(wsUrl)
          socket.connect(absoluteWsUrl, wsToken)
        } else {
          console.error('[Chat] wsToken 刷新失败:', response.error)
          connectionStore.setError('连接认证失败，请重新进入', 'TOKEN_REFRESH_FAILED')
        }
      } catch (error) {
        console.error('[Chat] wsToken 刷新异常:', error)
        connectionStore.setError('连接认证失败，请重新进入', 'TOKEN_REFRESH_FAILED')
      }
    })
  }

  // 处理收到的消息
  function handleIncomingMessage(data: WsMessageReceiveData) {
    const { message } = data

    // 玩家自己发送的消息已在 sendText() 中添加，跳过避免重复
    if (message.senderType === 'PLAYER') {
      return
    }

    chatStore.setWaitingReply(false)
    chatStore.setTyping(false)

    // AI 或客服回复后，允许显示转人工按钮
    if (message.senderType === 'AI' || message.senderType === 'AGENT') {
      chatStore.setHasAiResponse(true)
    }

    // 处理图片消息的相对路径URL（使用 api.getImageUrl 统一转换）
    let content = message.content
    if (message.messageType === 'IMAGE' && typeof content === 'string') {
      content = api.getImageUrl(content)
      console.log('[Chat] 图片URL转换:', message.content, '->', content)
    }

    chatStore.addMessage({
      clientMsgId: message.id,
      sender: message.senderType as any,
      type: message.messageType as any,
      content,
      timestamp: new Date(message.createdAt).getTime()
    })

    scrollToBottom()
  }

  // 发送文本消息
  function sendText(text: string) {
    if (!text.trim() || !chatStore.canInput) return

    // 如果工单还没创建成功，将消息加入队列
    if (!chatStore.isTicketReady) {
      console.log('[Chat] 工单未就绪，消息加入队列:', text)
      chatStore.addPendingMessage(text, 'TEXT')

      // 先在 UI 上显示消息（状态为 sending）
      const clientMsgId = `msg_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
      chatStore.addMessage({
        clientMsgId,
        sender: 'PLAYER',
        type: 'TEXT',
        content: text,
        status: 'sending'
      })

      // 设置等待状态
      if (!chatStore.hasAgent && !chatStore.isInQueue) {
        chatStore.setWaitingReply(true)
        chatStore.setTyping(true)
      }

      scrollToBottom()
      return
    }

    const clientMsgId = socket.sendMessage(text, 'TEXT')

    chatStore.addMessage({
      clientMsgId,
      sender: 'PLAYER',
      type: 'TEXT',
      content: text,
      status: 'sending'
    })

    // 只有在纯 AI 模式下才限制等待回复
    // 转人工后（排队中或已有客服）玩家可以自由发送多条消息
    if (!chatStore.hasAgent && !chatStore.isInQueue) {
      chatStore.setWaitingReply(true)
      // 显示 AI 正在输入的动画
      chatStore.setTyping(true)
    }

    scrollToBottom()
  }

  // 刷新 uploadToken（重新调用 connect 接口）
  async function refreshUploadToken(): Promise<string | null> {
    try {
      console.log('[Chat] 刷新 uploadToken...')
      const response = await api.callPlayerApi<PlayerConnectData>(
        '/api/v1/player/connect',
        {}
      )
      if (response.result && response.data?.uploadToken) {
        const newToken = response.data.uploadToken
        connectionStore.uploadToken = newToken
        console.log('[Chat] uploadToken 刷新成功')
        return newToken
      }
      console.error('[Chat] uploadToken 刷新失败:', response.error)
      return null
    } catch (error) {
      console.error('[Chat] uploadToken 刷新异常:', error)
      return null
    }
  }

  // 发送单张图片（内部使用）
  async function uploadSingleImage(file: File, clientMsgId: string): Promise<boolean> {
    try {
      let uploadToken = connectionStore.uploadToken
      if (!uploadToken) {
        chatStore.updateMessageStatus(clientMsgId, 'failed')
        return false
      }

      // 压缩图片（使用默认参数：1440px, 500KB阈值, 保留格式）
      const compressed = await compressImage(file)

      let result = await api.uploadFile(compressed.file, compressed.file.name, uploadToken)

      // 如果 token 过期或无效，刷新后重试一次
      if (!result.url && (result.errorCode === 'INVALID_TOKEN' || result.errorCode === 'EXPIRED_TOKEN')) {
        console.log('[Chat] uploadToken 失效，尝试刷新... errorCode:', result.errorCode)
        const newToken = await refreshUploadToken()
        if (newToken) {
          result = await api.uploadFile(compressed.file, compressed.file.name, newToken)
        }
      }

      if (result.url) {
        socket.sendMessage(result.url, 'IMAGE')
        chatStore.updateMessageStatus(clientMsgId, 'sent')
        return true
      } else {
        console.error('[Chat] 图片上传失败:', result.error)
        chatStore.updateMessageStatus(clientMsgId, 'failed')
        return false
      }
    } catch (error) {
      chatStore.updateMessageStatus(clientMsgId, 'failed')
      return false
    }
  }

  // 发送多张图片
  async function sendImages(files: File[]) {
    if (!chatStore.canInput || files.length === 0) return

    // 为每个文件创建本地预览消息
    const uploadTasks: Array<{ file: File; clientMsgId: string }> = []

    for (const file of files) {
      const localUrl = URL.createObjectURL(file)
      const clientMsgId = `img_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`

      chatStore.addMessage({
        clientMsgId,
        sender: 'PLAYER',
        type: 'IMAGE',
        content: localUrl,
        status: 'sending'
      })

      uploadTasks.push({ file, clientMsgId })
    }

    scrollToBottom()

    // 上传期间临时禁用输入（防止重复发送）
    chatStore.setWaitingReply(true)

    // 逐个上传（避免并发过高）
    for (const task of uploadTasks) {
      await uploadSingleImage(task.file, task.clientMsgId)
    }

    // 上传完成后，根据是否有客服/排队中决定是否继续等待
    // 如果有客服接入或正在排队，允许玩家继续发送消息
    // 如果是纯 AI 模式，需要等待 AI 回复
    if (chatStore.hasAgent || chatStore.isInQueue) {
      chatStore.setWaitingReply(false)
    } else {
      // AI 模式：保持等待状态，显示 AI 正在输入
      chatStore.setTyping(true)
    }
    scrollToBottom()
  }

  // 转人工
  function transferToAgent() {
    console.log('[Chat] 转人工被调用', {
      isConnected: connectionStore.isConnected,
      hasAgent: chatStore.hasAgent,
      currentTid: connectionStore.currentTid,
      agentAvailable: connectionStore.agentAvailable
    })

    // 直接发起转人工请求，让后端实时判断客服可用性
    // 后端会根据实际情况：有客服则排队，无客服则转为加急工单
    chatStore.addMessage({
      clientMsgId: `sys_${Date.now()}`,
      sender: 'PLAYER',
      type: 'TEXT',
      content: '转人工客服'
    })

    chatStore.setWaitingReply(true)
    socket.requestTransfer('PLAYER_REQUEST')
  }

  // 继续AI咨询（关闭弹窗）
  function handleContinueAi() {
    chatStore.setShowAgentOfflineModal(false)
  }

  // 是否正在保存退出
  const isSavingAndExit = ref(false)

  // 保存工单稍后咨询（直接退出）
  async function saveTicketAndExit() {
    chatStore.setShowAgentOfflineModal(false)
    isSavingAndExit.value = true

    // 调用后端转人工接口，后端会自动处理无客服的情况（转为加急工单）
    socket.requestTransfer('SAVE_FOR_LATER')

    // 不等待结果，直接退出（后端会异步处理）
    // 短暂延迟确保请求发出
    setTimeout(() => {
      socket.disconnect()
      closeBridge()
    }, 300)
  }

  // 处理转人工结果
  function handleTransferResult(data: WsTransferResultData) {
    console.log('[Chat] 收到转人工结果', data)
    chatStore.setWaitingReply(false)

    // 如果是保存退出触发的，不显示消息（页面即将关闭）
    if (isSavingAndExit.value) {
      return
    }

    if (data.convertedToTicket) {
      // 转为加急工单 - 清除排队状态并显示弹窗
      chatStore.setQueuePosition(0, null)  // 清除排队状态
      chatStore.setShowAgentOfflineModal(true)
      chatStore.addSystemMessage(data.message || '您的咨询已保存为加急工单，客服上线后将优先处理')
    } else if (data.success) {
      // 正常排队 - 设置排队位置（QueueBanner 会自动显示）
      const position = data.queuePosition || 1
      chatStore.setQueuePosition(position, data.waitTime)
      // 不添加系统消息，用 QueueBanner 组件显示排队状态
    } else {
      // 失败
      console.error('[Chat] 转人工失败', data.error || data.message)
      chatStore.addSystemMessage(data.message || data.error || '转人工失败，请稍后重试')
    }

    scrollToBottom()
  }

  // 安全退出
  function safeExit() {
    socket.disconnect()
    getBridge().close()
  }

  // 结束咨询（玩家主动关闭工单）
  async function endConsultation() {
    if (!connectionStore.isConnected) {
      console.log('[Chat] 未连接，无法结束咨询')
      return
    }

    console.log('[Chat] 玩家主动结束咨询')

    // 调用后端关闭工单
    socket.closeTicket('RESOLVED')

    // 清除本地工单状态
    chatStore.setActiveTicket(null)
  }

  // 处理评价提交
  async function handleRatingSubmit(data: { rating: number; comment: string }) {
    const sessionId = connectionStore.currentSessionId
    if (!sessionId) {
      console.error('[Chat] 无法提交评价：缺少 sessionId')
      return
    }

    console.log('[Chat] 提交评价:', { sessionId, rating: data.rating })
    const result = await api.submitRating(sessionId, data.rating, data.comment)

    if (result.success) {
      chatStore.setHasRated(true)
    } else {
      console.error('[Chat] 评价提交失败:', result.error)
    }

    scrollToBottom()
  }

  // 显示打字动画后显示消息
  function showTypingThenMessage(
    messageData: { sender: 'AI' | 'AGENT'; type: 'TEXT'; content: string },
    delay = 600,
    callback?: () => void
  ) {
    const typingMsgId = chatStore.addMessage({
      sender: messageData.sender,
      type: 'TYPING' as const,
      content: ''
    })

    scrollToBottom()

    setTimeout(() => {
      chatStore.removeMessage(typingMsgId)
      chatStore.addMessage(messageData)
      scrollToBottom()
      callback?.()
    }, delay)
  }

  // 滚动到底部
  function scrollToBottom() {
    nextTick(() => {
      const container = document.querySelector('main')
      if (container) {
        container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' })
      }
    })
  }

  // 关闭
  function close() {
    socket.disconnect()
    getBridge().close()
  }

  // 生命周期
  onMounted(() => {
    initialize()
  })

  onUnmounted(() => {
    socket.disconnect()
  })

  return {
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
    scrollToBottom,
    endConsultation,
    // 评价相关
    handleRatingSubmit
  }
}
