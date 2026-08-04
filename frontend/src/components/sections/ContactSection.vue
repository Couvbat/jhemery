<script setup lang="ts">
import { ref } from 'vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import SectionHeader from '@/components/SectionHeader.vue'
import { socials } from '@/content'
import { useLocale } from '@/i18n'
import { api, ApiError } from '@/lib/api'

const { t, m } = useLocale()

const form = ref({ name: '', email: '', subject: '', message: '' })
const status = ref<'idle' | 'sending' | 'success' | 'error'>('idle')
/** Server-side reason (rate limit, validation, SMTP), as the terminal's `mail` shows it. */
const errorDetail = ref('')

async function submit() {
  if (!form.value.name || !form.value.email || !form.value.message) return
  status.value = 'sending'
  errorDetail.value = ''
  try {
    await api.contact(form.value)
    status.value = 'success'
    form.value = { name: '', email: '', subject: '', message: '' }
  } catch (err) {
    status.value = 'error'
    errorDetail.value = err instanceof ApiError ? err.message : ''
  }
}
</script>

<template>
  <section id="contact" class="py-20 pt-24 pb-32">
    <div class="max-w-5xl mx-auto px-4">
      <SectionHeader section="contact" tone="green" />

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
                <Label for="name" class="text-xs text-muted-foreground"
                  >--{{ t(m.contact.name) }}</Label
                >
                <Input
                  id="name"
                  v-model="form.name"
                  :placeholder="t(m.contact.namePlaceholder)"
                  required
                  class="bg-input border-border focus:border-primary text-sm"
                />
              </div>
              <div class="space-y-1">
                <Label for="email" class="text-xs text-muted-foreground"
                  >--{{ t(m.contact.email) }}</Label
                >
                <Input
                  id="email"
                  v-model="form.email"
                  type="email"
                  :placeholder="t(m.contact.emailPlaceholder)"
                  required
                  class="bg-input border-border focus:border-primary text-sm"
                />
              </div>
            </div>

            <div class="space-y-1">
              <Label for="subject" class="text-xs text-muted-foreground"
                >--{{ t(m.contact.subject) }}</Label
              >
              <Input
                id="subject"
                v-model="form.subject"
                :placeholder="t(m.contact.subjectPlaceholder)"
                class="bg-input border-border focus:border-primary text-sm"
              />
            </div>

            <div class="space-y-1">
              <Label for="message" class="text-xs text-muted-foreground"
                >--{{ t(m.contact.message) }}</Label
              >
              <Textarea
                id="message"
                v-model="form.message"
                :placeholder="t(m.contact.messagePlaceholder)"
                required
                rows="5"
                class="bg-input border-border focus:border-primary text-sm resize-none"
              />
            </div>

            <!-- Status messages -->
            <div
              v-if="status === 'success'"
              class="text-xs text-primary border border-primary/30 rounded p-3"
            >
              {{ t(m.contact.success) }}
            </div>
            <div
              v-if="status === 'error'"
              class="text-xs text-destructive border border-destructive/30 rounded p-3"
            >
              ✗ {{ t(m.contact.error) }}
              <span v-if="errorDetail" class="block mt-1 opacity-70">{{ errorDetail }}</span>
            </div>

            <Button
              type="submit"
              :disabled="status === 'sending'"
              class="w-full bg-primary text-primary-foreground hover:bg-primary/90"
            >
              <span v-if="status === 'sending'">{{ t(m.contact.sending) }}</span>
              <span v-else>{{ t(m.contact.send) }}</span>
            </Button>
          </form>
        </div>

        <!-- Social links -->
        <div class="space-y-4">
          <p class="text-sm text-muted-foreground">
            {{ t(m.contact.directLine) }}
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
              <span class="text-foreground group-hover:text-primary transition-colors text-sm">{{
                s.handle
              }}</span>
              <span class="ml-auto text-muted-foreground group-hover:text-primary transition-colors"
                >→</span
              >
            </a>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>
