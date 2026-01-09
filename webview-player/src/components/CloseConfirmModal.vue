<script setup lang="ts">
defineProps<{
  hasActiveTicket: boolean
}>()

const emit = defineEmits<{
  cancel: []
  confirm: []
  endConsultation: []
}>()
</script>

<template>
  <div class="fixed inset-0 z-50 flex items-center justify-center">
    <!-- 遮罩 -->
    <div class="absolute inset-0 bg-black/50" @click="emit('cancel')" />

    <!-- 弹窗 -->
    <div class="relative bg-white rounded-2xl w-[85%] max-w-sm shadow-2xl overflow-hidden animate-scale-in">
      <!-- 图标 -->
      <div class="flex justify-center pt-6">
        <div class="w-16 h-16 bg-orange-100 rounded-full flex items-center justify-center">
          <i class="ri-question-line text-3xl text-orange-500" />
        </div>
      </div>

      <!-- 内容 -->
      <div class="px-6 py-4 text-center">
        <h3 class="text-lg font-bold text-gray-800 mb-2">确认关闭</h3>
        <p class="text-gray-500 text-sm leading-relaxed">
          <template v-if="hasActiveTicket">
            您当前有正在进行的咨询，关闭后可以稍后继续。<br/>
            确定要关闭吗？
          </template>
          <template v-else>
            确定要关闭客服窗口吗？
          </template>
        </p>
      </div>

      <!-- 按钮 -->
      <div class="px-6 pb-6 space-y-3">
        <!-- 有活跃工单时显示结束咨询按钮 -->
        <template v-if="hasActiveTicket">
          <button
            class="w-full py-3 bg-red-500 text-white rounded-xl font-medium hover:bg-red-600 active:scale-[0.98] transition-all"
            @click="emit('endConsultation')"
          >
            结束咨询
          </button>
          <button
            class="w-full py-3 bg-blue-500 text-white rounded-xl font-medium hover:bg-blue-600 active:scale-[0.98] transition-all"
            @click="emit('confirm')"
          >
            暂时离开（稍后继续）
          </button>
        </template>
        <template v-else>
          <button
            class="w-full py-3 bg-blue-500 text-white rounded-xl font-medium hover:bg-blue-600 active:scale-[0.98] transition-all"
            @click="emit('confirm')"
          >
            确定关闭
          </button>
        </template>
        <button
          class="w-full py-3 bg-gray-100 text-gray-600 rounded-xl font-medium hover:bg-gray-200 active:scale-[0.98] transition-all"
          @click="emit('cancel')"
        >
          取消
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.animate-scale-in {
  animation: scale-in 0.2s ease-out;
}

@keyframes scale-in {
  from {
    opacity: 0;
    transform: scale(0.9);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}
</style>
