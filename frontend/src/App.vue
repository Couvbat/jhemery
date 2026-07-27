<script setup lang="ts">
import { defineAsyncComponent } from 'vue'
import { RouterView } from 'vue-router'
import NavBar from '@/components/NavBar.vue'

const ThreeBackground = defineAsyncComponent(() => import('@/components/ThreeBackground.vue'))
</script>

<template>
  <ThreeBackground />
  <NavBar />
  <RouterView />
</template>

