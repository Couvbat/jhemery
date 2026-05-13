<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { Badge } from '@/components/ui/badge'

const skills = [
  'HTML', 'CSS', 'JavaScript', 'TypeScript', 'PHP', 'Python', 'React', 'MySQL', 'MongoDB', 'Vue.js', 'NestJS', 'Node.js', 'Express', 'Docker', 'Git', 'Bash',
]

const fullText = "Jules Hémery — Full-Stack Developer, Musician & Gamer."
const displayed = ref('')
let i = 0
let timer: ReturnType<typeof setInterval>

onMounted(() => {
  timer = setInterval(() => {
    if (i < fullText.length) {
      displayed.value += fullText[i++]
    } else {
      clearInterval(timer)
    }
  }, 45)
})

onUnmounted(() => clearInterval(timer))
</script>

<template>
  <section id="about" class="min-h-screen flex items-center pt-14">
    <div class="max-w-5xl mx-auto px-4 py-20 w-full">
      <!-- Terminal window -->
      <div class="rounded border border-border bg-card overflow-hidden border-glow">
        <!-- Title bar -->
        <div class="flex items-center gap-2 px-4 py-2 bg-muted border-b border-border">
          <span class="w-3 h-3 rounded-full bg-red-500/80"></span>
          <span class="w-3 h-3 rounded-full bg-yellow-500/80"></span>
          <span class="w-3 h-3 rounded-full bg-green-500/80"></span>
          <span class="ml-3 text-xs text-muted-foreground">couvbat@portfolio ~ bash</span>
        </div>

        <!-- Terminal body -->
        <div class="p-6 md:p-10 space-y-6">
          <!-- whoami -->
          <div>
            <p class="text-muted-foreground text-sm">
              <span class="text-primary">couvbat</span>
              <span class="text-accent">@</span>
              <span class="text-secondary">portfolio</span>
              <span class="text-muted-foreground">:~$</span>
              <span class="ml-2 text-foreground">whoami</span>
            </p>
          </div>

          <!-- Name + typing effect -->
          <div>
            <h1 class="text-3xl md:text-5xl font-bold text-primary glow-green tracking-tight">
              {{ displayed }}<span class="animate-pulse">█</span>
            </h1>
          </div>

          <!-- cat about.txt -->
          <div>
            <p class="text-muted-foreground text-sm mb-3">
              <span class="text-primary">couvbat</span><span class="text-muted-foreground">:~$</span>
              <span class="ml-2 text-foreground">cat about.txt</span>
            </p>
            <div class="pl-4 border-l-2 border-primary/40 space-y-2 text-sm md:text-base">
              <p>
                Hey, I'm <span class="text-primary font-semibold">Jules Hémery</span>, aka
                <span class="text-accent font-semibold">Couvbat</span>.
              </p>
              <p class="text-muted-foreground">
                25 y/o Full-Stack Developer at
                <span class="text-primary font-semibold">In-Leed</span>, based in
                <span class="text-primary">France</span> — 2 years of experience building
                web apps with modern stacks. When I'm not shipping features I'm
                producing music, playing games w/friends, or tinkering with AI.
              </p>
              <p class="text-xs text-muted-foreground">
                🌐 French · English
              </p>
            </div>
          </div>

          <!-- ls skills/ -->
          <div>
            <p class="text-muted-foreground text-sm mb-3">
              <span class="text-primary">couvbat</span><span class="text-muted-foreground">:~$</span>
              <span class="ml-2 text-foreground">ls skills/</span>
            </p>
            <div class="flex flex-wrap gap-2">
              <Badge
                v-for="skill in skills"
                :key="skill"
                variant="outline"
                class="border-primary/50 text-primary hover:bg-primary/10 transition-colors"
              >
                {{ skill }}
              </Badge>
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>
