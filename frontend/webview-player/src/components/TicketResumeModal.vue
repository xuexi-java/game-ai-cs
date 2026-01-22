<script setup lang="ts">
import type { TicketInfo } from '@/types'

defineProps<{
  ticket: TicketInfo | null
}>()

const emit = defineEmits<{
  resume: []
  newIssue: []
}>()
</script>

<template>
  <Transition name="fade">
    <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-6">
      <div class="bg-white w-full max-w-sm rounded-2xl shadow-2xl p-6 flex flex-col gap-4 animate-[bounce_0.2s_ease-out]">
        <div class="text-center">
          <div class="w-12 h-12 bg-yellow-100 text-yellow-600 rounded-full flex items-center justify-center mx-auto mb-3">
            <i class="ri-history-line text-2xl" />
          </div>
          <h3 class="text-lg font-bold text-gray-800">发现未完成的咨询</h3>
          <p class="text-gray-500 text-xs mt-1">单号: {{ ticket?.tid }}</p>
          <p class="text-gray-600 mt-3 text-sm leading-relaxed">
            您上次的咨询尚未结束，是否继续？
            <br />
            <span class="text-xs text-gray-400">选择"咨询新问题"将自动关闭旧咨询。</span>
          </p>
        </div>
        <div class="flex flex-col gap-3 mt-2">
          <button
            class="w-full bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-xl font-bold shadow-lg shadow-blue-200 active:scale-95 transition-all"
            @click="emit('resume')"
          >
            继续上次的问题
          </button>
          <button
            class="w-full bg-white border border-gray-200 text-gray-600 hover:bg-gray-50 py-3 rounded-xl font-bold active:scale-95 transition-all"
            @click="emit('newIssue')"
          >
            咨询新问题
          </button>
        </div>
      </div>
    </div>
  </Transition>
</template>
