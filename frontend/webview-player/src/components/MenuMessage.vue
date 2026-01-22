<script setup lang="ts">
import type { MenuContent, MenuItem } from '@/types'

const props = defineProps<{
  content: MenuContent
  disabled?: boolean
}>()

const emit = defineEmits<{
  select: [item: MenuItem]
}>()

function handleSelect(item: MenuItem) {
  if (!props.disabled) {
    emit('select', item)
  }
}
</script>

<template>
  <div
    class="bg-white rounded-2xl rounded-tl-none shadow-sm w-72 overflow-hidden border border-blue-50/50"
    :class="{ 'opacity-60': disabled }"
  >
    <div
      v-if="content.title"
      class="px-4 py-3 text-gray-800 font-medium leading-relaxed border-b border-gray-100 bg-gray-50/50 whitespace-pre-wrap"
    >
      {{ content.title }}
    </div>
    <div class="flex flex-col">
      <button
        v-for="item in content.items"
        :key="item.id"
        :disabled="disabled"
        class="group relative flex items-center justify-between w-full px-4 py-3.5 text-left text-sm text-gray-700 transition-colors border-b border-gray-100 last:border-0"
        :class="disabled ? 'cursor-not-allowed' : 'hover:bg-blue-50 hover:text-blue-600 active:bg-blue-100'"
        @click="handleSelect(item)"
      >
        <span>{{ item.label }}</span>
        <i class="ri-arrow-right-s-line text-gray-300 text-lg" :class="{ 'group-hover:text-blue-400': !disabled }" />
      </button>
    </div>
  </div>
</template>
