<script setup lang="ts">
import HeroSection    from '@/components/sections/HeroSection.vue'
import ProjectsSection from '@/components/sections/ProjectsSection.vue'
import MusicSection   from '@/components/sections/MusicSection.vue'
import GamingSection  from '@/components/sections/GamingSection.vue'
import HardwareSection from '@/components/sections/HardwareSection.vue'
import ContactSection from '@/components/sections/ContactSection.vue'
import SiteFooter     from '@/components/SiteFooter.vue'
import { Separator }  from '@/components/ui/separator'
</script>

<template>
  <main class="scanlines">
    <HeroSection />
    <Separator class="opacity-20" />
    <ProjectsSection />
    <Separator class="opacity-20" />
    <MusicSection />
    <Separator class="opacity-20" />
    <GamingSection />
    <Separator class="opacity-20" />
    <HardwareSection />
    <Separator class="opacity-20" />
    <ContactSection />
    <SiteFooter />
  </main>
</template>
