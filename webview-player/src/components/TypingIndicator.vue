<script setup lang="ts">
defineProps<{
  inline?: boolean
}>()
</script>

<template>
  <div
    v-if="inline"
    class="bg-white px-4 py-4 rounded-2xl rounded-tl-none shadow-sm w-16 flex items-center justify-between"
  >
    <div class="typing-dot" />
    <div class="typing-dot" />
    <div class="typing-dot" />
  </div>

  <div v-else class="flex gap-2 max-w-[100%]">
    <div class="w-9 h-9 rounded-full flex items-center justify-center shrink-0 mt-1 shadow-sm border border-white bg-blue-100 text-blue-600">
      <i class="ri-robot-2-line" />
    </div>
    <div class="bg-white px-4 py-4 rounded-2xl rounded-tl-none shadow-sm w-16 flex items-center justify-between">
      <div class="typing-dot" />
      <div class="typing-dot" />
      <div class="typing-dot" />
    </div>
  </div>
</template>
