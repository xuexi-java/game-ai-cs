<script setup lang="ts">
import type { Message, MenuItem } from '@/types'
import MessageItem from './MessageItem.vue'
import TypingIndicator from './TypingIndicator.vue'

defineProps<{
  messages: Message[]
  isTyping: boolean
  categorySelected: boolean
}>()

const emit = defineEmits<{
  categorySelect: [item: MenuItem]
  preview: [url: string]
}>()
</script>

<template>
  <main class="flex-1 overflow-y-auto p-4 space-y-5 scrollbar-thin pb-20">
    <TransitionGroup name="message">
      <MessageItem
        v-for="msg in messages"
        :key="msg.clientMsgId"
        :message="msg"
        :menu-disabled="categorySelected"
        @category-select="emit('categorySelect', $event)"
        @preview="emit('preview', $event)"
      />
    </TransitionGroup>

    <!-- 全局输入指示器 -->
    <TypingIndicator v-if="isTyping" />

    <!-- 底部插槽（用于评价入口卡片等） -->
    <slot name="bottom" />
  </main>
</template>
