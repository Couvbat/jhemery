<script setup lang="ts">
import { ref } from 'vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'

const form = ref({ name: '', email: '', subject: '', message: '' })
const status = ref<'idle' | 'sending' | 'success' | 'error'>('idle')
const errorMsg = ref('')

const socials = [
  { label: 'GitHub',   handle: '@Couvbat',          href: 'https://github.com/Couvbat' },
  { label: 'LinkedIn', handle: 'Jules Hémery',       href: 'https://www.linkedin.com/in/jules-h%C3%A9mery-338134195/' },
  { label: 'Email',    handle: 'contact@jhemery.fr', href: 'mailto:contact@jhemery.fr' },
]

async function submit() {
  if (!form.value.name || !form.value.email || !form.value.message) return
  status.value = 'sending'
  errorMsg.value = ''
  const apiUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:3000'
  try {
    const res = await fetch(`${apiUrl}/contact`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form.value),
    })
    if (!res.ok) throw new Error('Server error')
    status.value = 'success'
    form.value = { name: '', email: '', subject: '', message: '' }
  } catch (e) {
    status.value = 'error'
    errorMsg.value = 'Failed to send message. Please try again or reach out directly by email.'
  }
}
</script>

<template>
  <section id="contact" class="py-20 pt-24 pb-32">
    <div class="max-w-5xl mx-auto px-4">
      <div class="mb-10">
        <p class="text-muted-foreground text-sm mb-1">
          <span class="text-primary">couvbat</span><span class="text-muted-foreground">:~$</span>
          <span class="ml-2 text-foreground">ssh contact@jhemery.fr</span>
        </p>
        <h2 class="text-2xl md:text-3xl font-bold glow-green">
          <span class="text-primary">#</span> Contact
        </h2>
      </div>

      <div class="grid gap-8 md:grid-cols-2">
        <!-- Contact form -->
        <div class="rounded border border-border bg-card overflow-hidden border-glow">
          <div class="flex items-center gap-2 px-4 py-2 bg-muted border-b border-border">
            <span class="w-3 h-3 rounded-full bg-red-500/80"></span>
            <span class="w-3 h-3 rounded-full bg-yellow-500/80"></span>
            <span class="w-3 h-3 rounded-full bg-green-500/80"></span>
            <span class="ml-3 text-xs text-muted-foreground">send-message.sh</span>
          </div>

          <form @submit.prevent="submit" class="p-6 space-y-4">
            <div class="grid grid-cols-2 gap-4">
              <div class="space-y-1">
                <Label for="name" class="text-xs text-muted-foreground">--name</Label>
                <Input
                  id="name"
                  v-model="form.name"
                  placeholder="Jules"
                  required
                  class="bg-input border-border focus:border-primary text-sm"
                />
              </div>
              <div class="space-y-1">
                <Label for="email" class="text-xs text-muted-foreground">--email</Label>
                <Input
                  id="email"
                  v-model="form.email"
                  type="email"
                  placeholder="you@example.com"
                  required
                  class="bg-input border-border focus:border-primary text-sm"
                />
              </div>
            </div>

            <div class="space-y-1">
              <Label for="subject" class="text-xs text-muted-foreground">--subject</Label>
              <Input
                id="subject"
                v-model="form.subject"
                placeholder="Hello there"
                class="bg-input border-border focus:border-primary text-sm"
              />
            </div>

            <div class="space-y-1">
              <Label for="message" class="text-xs text-muted-foreground">--message</Label>
              <Textarea
                id="message"
                v-model="form.message"
                placeholder="Your message..."
                required
                rows="5"
                class="bg-input border-border focus:border-primary text-sm resize-none"
              />
            </div>

            <!-- Status messages -->
            <div v-if="status === 'success'" class="text-xs text-primary border border-primary/30 rounded p-3">
              ✓ Message sent! I'll get back to you shortly.
            </div>
            <div v-if="status === 'error'" class="text-xs text-destructive border border-destructive/30 rounded p-3">
              ✗ {{ errorMsg }}
            </div>

            <Button
              type="submit"
              :disabled="status === 'sending'"
              class="w-full bg-primary text-primary-foreground hover:bg-primary/90"
            >
              <span v-if="status === 'sending'">Sending…</span>
              <span v-else>$ send --message</span>
            </Button>
          </form>
        </div>

        <!-- Social links -->
        <div class="space-y-4">
          <p class="text-sm text-muted-foreground">
            Prefer a direct line? Find me here:
          </p>

          <div class="space-y-3">
            <a
              v-for="s in socials"
              :key="s.label"
              :href="s.href"
              target="_blank"
              rel="noopener noreferrer"
              class="flex items-center gap-4 p-4 rounded border border-border bg-card hover:border-primary/50 hover:bg-card/80 transition-all group"
            >
              <span class="text-primary font-mono text-sm w-20 shrink-0">{{ s.label }}</span>
              <span class="text-foreground group-hover:text-primary transition-colors text-sm">{{ s.handle }}</span>
              <span class="ml-auto text-muted-foreground group-hover:text-primary transition-colors">→</span>
            </a>
          </div>

          <div class="pt-4 border-t border-border">
            <p class="text-xs text-muted-foreground font-mono">
              <span class="text-primary">$</span> echo "Open to freelance &amp; new opportunities"
            </p>
            <p class="text-xs text-foreground font-mono pl-4 mt-1">
              Open to freelance &amp; new opportunities
            </p>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>
