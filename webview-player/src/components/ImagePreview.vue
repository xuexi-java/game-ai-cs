<script setup lang="ts">
defineProps<{
  url: string
}>()

const emit = defineEmits<{
  close: []
}>()
</script>

<template>
  <Transition name="fade">
    <div
      class="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4 cursor-zoom-out"
      @click="emit('close')"
    >
      <img
        :src="url"
        class="max-w-full max-h-full rounded shadow-2xl"
        @click.stop
      />
    </div>
  </Transition>
</template>
