<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

interface Project {
  name: string
  description: string
  stack: string[]
  repo?: string
  live?: string
  status: 'production' | 'wip' | 'archived'
}

const projects: Project[] = [
  {
    name: 'jhemery-portfolio',
    description: 'This portfolio — built with NestJS, Vue 3, shadcn-vue and a cyberpunk terminal aesthetic.',
    stack: ['Vue 3', 'NestJS', 'TypeScript', 'TailwindCSS', 'shadcn-vue'],
    repo: 'https://github.com/Couvbat/jhemery',
    status: 'production',
  },
  {
    name: 'in-leed / work projects',
    description: 'Professional fullstack projects at In-Leed — web apps, REST APIs and internal tools built over 2 years.',
    stack: ['React', 'Node.js', 'Express', 'MongoDB', 'MySQL', 'PHP', 'Docker'],
    status: 'production',
  },
  {
    name: 'side-project (WIP)',
    description: 'Personal side project exploring AI-assisted tooling and automation. Details coming soon.',
    stack: ['TypeScript', 'Python', 'Node.js', 'AI'],
    status: 'wip',
  },
]

const statusColor: Record<Project['status'], string> = {
  production: 'text-primary border-primary/50',
  wip:        'text-yellow-400 border-yellow-400/50',
  archived:   'text-muted-foreground border-border',
}

interface GithubCommit {
  repo: string
  sha: string
  message: string
  url: string
  date: string
}

const githubCommits = ref<GithubCommit[] | null>(null)

function shortRepo(repo: string): string {
  return repo.split('/')[1] ?? repo
}

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime()
  const minutes = Math.floor(diffMs / 60000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

onMounted(async () => {
  const apiUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:3000'
  try {
    const res = await fetch(`${apiUrl}/github/activity`)
    if (!res.ok) throw new Error('GitHub activity unavailable')
    const data = await res.json()
    if (data.configured && data.commits?.length) {
      githubCommits.value = data.commits
    }
  } catch {
    // silently hide the card
  }
})
</script>

<template>
  <section id="projects" class="py-20 pt-24">
    <div class="max-w-5xl mx-auto px-4">
      <!-- Section header -->
      <div class="mb-10">
        <p class="text-muted-foreground text-sm mb-1">
          <span class="text-primary">couvbat</span><span class="text-muted-foreground">:~$</span>
          <span class="ml-2 text-foreground">ls -la projects/</span>
        </p>
        <h2 class="text-2xl md:text-3xl font-bold text-foreground glow-green">
          <span class="text-primary">#</span> Projects
        </h2>
      </div>

      <div class="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card
          v-for="p in projects"
          :key="p.name"
          class="bg-card border-border hover:border-primary/50 transition-colors group"
        >
          <CardHeader class="pb-2">
            <div class="flex items-start justify-between gap-2">
              <CardTitle class="text-base font-mono text-primary group-hover:glow-green transition-all">
                {{ p.name }}
              </CardTitle>
              <Badge variant="outline" :class="['text-xs shrink-0', statusColor[p.status]]">
                {{ p.status }}
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <CardDescription class="text-muted-foreground text-sm mb-4">
              {{ p.description }}
            </CardDescription>
            <div class="flex flex-wrap gap-1">
              <Badge
                v-for="tech in p.stack"
                :key="tech"
                variant="outline"
                class="text-xs border-muted text-muted-foreground"
              >
                {{ tech }}
              </Badge>
            </div>
          </CardContent>
          <CardFooter class="gap-2 flex-wrap">
            <Button
              v-if="p.repo"
              variant="outline"
              size="sm"
              as="a"
              :href="p.repo"
              target="_blank"
              class="text-xs border-border hover:border-primary hover:text-primary"
            >
              <svg xmlns="http://www.w3.org/2000/svg" class="w-3 h-3 mr-1" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/>
              </svg>
              GitHub
            </Button>
            <Button
              v-if="p.live"
              size="sm"
              as="a"
              :href="p.live"
              target="_blank"
              class="text-xs"
            >
              Live →
            </Button>
          </CardFooter>
        </Card>
      </div>

      <!-- Recent GitHub activity -->
      <div
        v-if="githubCommits && githubCommits.length"
        class="mt-4 rounded border border-border bg-card overflow-hidden"
      >
        <div class="flex items-center gap-2 px-4 py-2 bg-muted border-b border-border">
          <span class="w-3 h-3 rounded-full bg-red-500/80"></span>
          <span class="w-3 h-3 rounded-full bg-yellow-500/80"></span>
          <span class="w-3 h-3 rounded-full bg-green-500/80"></span>
          <span class="ml-3 text-xs text-muted-foreground">git log --oneline</span>
        </div>
        <div class="p-4 font-mono text-xs space-y-1.5">
          <a
            v-for="c in githubCommits"
            :key="c.sha"
            :href="c.url"
            target="_blank"
            rel="noopener noreferrer"
            class="flex items-center gap-2 hover:text-primary transition-colors"
          >
            <span class="text-primary shrink-0">{{ c.sha }}</span>
            <span class="text-foreground flex-1 truncate">{{ c.message }}</span>
            <span class="text-secondary shrink-0">{{ shortRepo(c.repo) }}</span>
            <span class="text-muted-foreground shrink-0 hidden sm:inline">{{ relativeTime(c.date) }}</span>
          </a>
        </div>
      </div>
    </div>
  </section>
</template>
