<script setup lang="ts">
/** The bash-window chrome every tool panel sits in — the same frame the hero, the
 *  contact form and the 404 use, so a tool reads as part of the site, not an app
 *  embedded in it. */
defineProps<{ title: string }>()
</script>

<template>
  <div class="rounded border border-border bg-card overflow-hidden border-glow">
    <div class="flex items-center gap-2 px-4 py-2 bg-muted border-b border-border">
      <span class="w-3 h-3 rounded-full bg-red-500/80"></span>
      <span class="w-3 h-3 rounded-full bg-yellow-500/80"></span>
      <span class="w-3 h-3 rounded-full bg-green-500/80"></span>
      <span class="ml-3 text-xs text-muted-foreground">{{ title }}</span>
      <div class="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
        <slot name="status" />
      </div>
    </div>
    <div class="p-4 md:p-6 space-y-4 text-sm">
      <slot />
    </div>
  </div>
</template>
