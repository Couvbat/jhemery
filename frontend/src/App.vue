<script setup lang="ts">
import { RouterView } from 'vue-router'
import NavBar from '@/components/NavBar.vue'
import ThreeBackground from '@/components/ThreeBackground.vue'
</script>

<template>
  <ThreeBackground />
  <NavBar />
  <RouterView />
</template>

