<script setup lang="ts">
import { computed } from 'vue'
import { marked } from 'marked'
import type { Message, MenuItem, MenuContent } from '@/types'
import MenuMessage from './MenuMessage.vue'
import TypingIndicator from './TypingIndicator.vue'

// 配置 marked：禁用 GFM 换行，使用更简洁的输出
marked.setOptions({
  breaks: true,  // 支持换行
  gfm: true,     // 支持 GitHub 风格 Markdown
})

const props = defineProps<{
  message: Message
  menuDisabled?: boolean
}>()

const emit = defineEmits<{
  categorySelect: [item: MenuItem]
  preview: [url: string]
}>()

function isMenuContent(content: unknown): content is MenuContent {
  return typeof content === 'object' && content !== null && 'items' in content
}

// 将 Markdown 转换为 HTML（仅用于 AI/客服消息）
const renderedContent = computed(() => {
  if (typeof props.message.content !== 'string') return ''
  // 使用 marked 解析 Markdown，返回 HTML
  const html = marked.parse(props.message.content) as string
  // 移除最外层的 <p> 标签（如果只有一个段落）
  return html.replace(/^<p>([\s\S]*)<\/p>\n?$/, '$1')
})
</script>

<template>
  <div class="flex flex-col">
    <!-- 系统消息 -->
    <div v-if="message.sender === 'SYSTEM'" class="flex justify-center my-2">
      <span class="bg-gray-200/80 text-gray-500 px-3 py-1 rounded-full text-xs scale-90">
        {{ message.content }}
      </span>
    </div>

    <!-- AI/客服消息 -->
    <div v-else-if="message.sender === 'AI' || message.sender === 'AGENT'" class="flex gap-2 max-w-[100%]">
      <div
        class="w-9 h-9 rounded-full flex items-center justify-center shrink-0 mt-1 shadow-sm border border-white"
        :class="message.sender === 'AI' ? 'bg-blue-100 text-blue-600' : 'bg-purple-100 text-purple-600'"
      >
        <i :class="message.sender === 'AI' ? 'ri-robot-2-line' : 'ri-customer-service-2-line'" />
      </div>

      <div class="flex flex-col gap-2 min-w-0 flex-1">
        <!-- 打字动画 -->
        <TypingIndicator v-if="message.type === 'TYPING'" inline />

        <!-- 文本消息 (支持 Markdown) -->
        <div
          v-if="message.type === 'TEXT'"
          class="bg-white p-3 rounded-2xl rounded-tl-none shadow-sm text-gray-800 leading-relaxed max-w-[90%] self-start border border-transparent markdown-content"
          v-html="renderedContent"
        />

        <!-- 图片消息 -->
        <div
          v-else-if="message.type === 'IMAGE'"
          class="cursor-zoom-in self-start"
          @click="emit('preview', message.content as string)"
        >
          <img
            :src="message.content as string"
            class="rounded-2xl rounded-tl-none max-w-[150px] shadow-sm border border-gray-100"
          />
        </div>

        <!-- 菜单消息 -->
        <MenuMessage
          v-else-if="message.type === 'MENU' && isMenuContent(message.content)"
          :content="message.content"
          :disabled="menuDisabled"
          @select="emit('categorySelect', $event)"
        />
      </div>
    </div>

    <!-- 玩家消息 -->
    <div v-else-if="message.sender === 'PLAYER'" class="flex justify-end mb-1">
      <div class="flex items-end gap-2 max-w-[85%]">
        <!-- 文本消息 -->
        <div
          v-if="message.type === 'TEXT'"
          class="bg-blue-600 text-white px-4 py-2.5 rounded-2xl rounded-tr-none shadow-md shadow-blue-100 leading-relaxed text-sm"
        >
          {{ message.content }}
        </div>

        <!-- 图片消息 -->
        <div
          v-else-if="message.type === 'IMAGE'"
          class="relative group cursor-zoom-in"
          @click="emit('preview', message.content as string)"
        >
          <img
            :src="message.content as string"
            class="rounded-2xl rounded-tr-none max-w-[150px] shadow-sm border border-blue-100"
          />
          <div
            v-if="message.status === 'sending'"
            class="absolute inset-0 bg-black/30 rounded-2xl rounded-tr-none flex items-center justify-center"
          >
            <i class="ri-loader-4-line text-white animate-spin text-2xl" />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Markdown 内容样式 */
.markdown-content :deep(strong) {
  font-weight: 600;
}

.markdown-content :deep(em) {
  font-style: italic;
}

.markdown-content :deep(a) {
  color: #2563eb;
  text-decoration: underline;
}

.markdown-content :deep(code) {
  background-color: #f3f4f6;
  padding: 0.125rem 0.375rem;
  border-radius: 0.25rem;
  font-size: 0.875em;
  font-family: ui-monospace, monospace;
}

.markdown-content :deep(pre) {
  background-color: #f3f4f6;
  padding: 0.75rem;
  border-radius: 0.5rem;
  overflow-x: auto;
  margin: 0.5rem 0;
}

.markdown-content :deep(ul),
.markdown-content :deep(ol) {
  padding-left: 1.25rem;
  margin: 0.5rem 0;
}

.markdown-content :deep(li) {
  margin: 0.25rem 0;
}

.markdown-content :deep(p) {
  margin: 0.5rem 0;
}

.markdown-content :deep(p:first-child) {
  margin-top: 0;
}

.markdown-content :deep(p:last-child) {
  margin-bottom: 0;
}

.markdown-content :deep(blockquote) {
  border-left: 3px solid #d1d5db;
  padding-left: 0.75rem;
  margin: 0.5rem 0;
  color: #6b7280;
}
</style>
