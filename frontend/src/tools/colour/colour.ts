// The colour maths moved to `lib/colour.ts` when the theme rules started using it, so
// `lib/` doesn't reach into a tool's folder. The panel and its spec still import from
// here.
export * from '@/lib/colour'
