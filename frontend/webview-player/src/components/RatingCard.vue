<script setup lang="ts">
import { ref } from 'vue'

const emit = defineEmits<{
  submit: [data: { rating: number; comment: string }]
}>()

const rating = ref(0)
const comment = ref('')
const isSubmitting = ref(false)
const isSubmitted = ref(false)
const showComment = ref(false)

function handleStarClick(n: number) {
  rating.value = n
  // 选择评分后自动展开评论区
  showComment.value = true
}

async function handleSubmit() {
  if (rating.value === 0 || isSubmitting.value) return
  isSubmitting.value = true
  emit('submit', { rating: rating.value, comment: comment.value })
}

// 提交成功后调用
function setSubmitted() {
  isSubmitted.value = true
  isSubmitting.value = false
}

defineExpose({ setSubmitted })
</script>

<template>
  <div class="mx-4 my-3">
    <!-- 未提交状态 -->
    <div v-if="!isSubmitted" class="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-2xl p-4 border border-blue-100 shadow-sm">
      <!-- 标题 -->
      <div class="flex items-center gap-2 mb-3">
        <div class="w-8 h-8 bg-yellow-100 rounded-full flex items-center justify-center">
          <i class="ri-star-smile-line text-lg text-yellow-500" />
        </div>
        <span class="text-gray-700 font-medium text-sm">请为本次服务评分</span>
      </div>

      <!-- 星级评分 -->
      <div class="flex justify-center gap-2 mb-2">
        <button
          v-for="n in 5"
          :key="n"
          class="p-1 transition-all active:scale-90 hover:scale-110"
          @click="handleStarClick(n)"
        >
          <i
            :class="n <= rating ? 'ri-star-fill text-yellow-400' : 'ri-star-line text-gray-300 hover:text-yellow-200'"
            class="text-3xl transition-colors"
          />
        </button>
      </div>

      <!-- 评分描述 -->
      <p v-if="rating > 0" class="text-center text-xs text-gray-500 mb-3">
        {{ rating === 5 ? '非常满意' : rating === 4 ? '满意' : rating === 3 ? '一般' : rating === 2 ? '不满意' : '非常不满意' }}
      </p>

      <!-- 展开的评论区 -->
      <Transition name="expand">
        <div v-if="showComment" class="space-y-3">
          <!-- 文字评论 -->
          <textarea
            v-model="comment"
            class="w-full bg-white border border-gray-200 rounded-xl p-3 h-16 resize-none text-sm focus:outline-none focus:border-blue-400 transition-colors placeholder-gray-400"
            placeholder="补充评价（可选）"
          />

          <!-- 提交按钮 -->
          <button
            :disabled="rating === 0 || isSubmitting"
            class="w-full py-2.5 bg-blue-500 text-white rounded-xl text-sm font-medium hover:bg-blue-600 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            @click="handleSubmit"
          >
            <i v-if="isSubmitting" class="ri-loader-4-line animate-spin" />
            <span>{{ isSubmitting ? '提交中...' : '提交评价' }}</span>
          </button>
        </div>
      </Transition>

      <!-- 未展开时的提示 -->
      <p v-if="!showComment && rating === 0" class="text-center text-xs text-gray-400 mt-1">
        点击星星进行评分
      </p>
    </div>

    <!-- 已提交状态 -->
    <div v-else class="bg-gradient-to-br from-green-50 to-emerald-50 rounded-2xl p-4 border border-green-100 shadow-sm">
      <div class="flex items-center justify-center gap-2">
        <div class="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center">
          <i class="ri-check-line text-lg text-green-500" />
        </div>
        <span class="text-green-700 font-medium text-sm">感谢您的评价！</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.expand-enter-active,
.expand-leave-active {
  transition: all 0.3s ease;
  overflow: hidden;
}

.expand-enter-from,
.expand-leave-to {
  opacity: 0;
  max-height: 0;
}

.expand-enter-to,
.expand-leave-from {
  opacity: 1;
  max-height: 200px;
}
</style>
