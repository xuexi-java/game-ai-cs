<script setup lang="ts">
defineProps<{
  isConnected: boolean
}>()

const emit = defineEmits<{
  close: []
}>()
</script>

<template>
  <header class="bg-white border-b px-4 py-3 flex items-center justify-between z-20 shadow-sm shrink-0">
    <div class="flex items-center gap-2">
      <div
        class="w-2 h-2 rounded-full transition-colors"
        :class="isConnected ? 'bg-green-500' : 'bg-gray-400'"
      />
      <span class="font-bold text-gray-800">客服中心</span>
    </div>
    <button
      class="text-gray-500 hover:text-gray-800 transition-colors"
      @click="emit('close')"
    >
      <i class="ri-close-line text-xl" />
    </button>
  </header>
</template>
