<script setup lang="ts">
defineProps<{
  workingHours: string
  offlineReason?: string
}>()

const emit = defineEmits<{
  continueAi: []
  saveTicket: []
}>()
</script>

<template>
  <Transition name="fade">
    <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-6">
      <div class="bg-white w-full max-w-sm rounded-2xl shadow-2xl p-6 flex flex-col gap-4 animate-[bounce_0.2s_ease-out]">
        <div class="text-center">
          <div class="w-12 h-12 bg-orange-100 text-orange-600 rounded-full flex items-center justify-center mx-auto mb-3">
            <i class="ri-customer-service-2-line text-2xl" />
          </div>
          <h3 class="text-lg font-bold text-gray-800">当前无在线客服</h3>
          <p class="text-gray-500 text-xs mt-1">{{ offlineReason || '暂无在线客服' }}</p>
          <div class="mt-4 bg-gray-50 rounded-xl p-3">
            <p class="text-gray-600 text-sm">
              <i class="ri-time-line mr-1" />
              客服工作时间
            </p>
            <p class="text-gray-800 font-medium mt-1">{{ workingHours }}</p>
          </div>
          <p class="text-gray-500 mt-3 text-sm leading-relaxed">
            您可以选择继续AI咨询，或保存工单稍后联系人工客服。
          </p>
        </div>
        <div class="flex flex-col gap-3 mt-2">
          <button
            class="w-full bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-xl font-bold shadow-lg shadow-blue-200 active:scale-95 transition-all"
            @click="emit('continueAi')"
          >
            继续AI咨询
          </button>
          <button
            class="w-full bg-white border border-orange-300 text-orange-600 hover:bg-orange-50 py-3 rounded-xl font-bold active:scale-95 transition-all"
            @click="emit('saveTicket')"
          >
            保存工单稍后咨询
          </button>
        </div>
      </div>
    </div>
  </Transition>
</template>
