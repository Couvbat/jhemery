// The ffmpeg.wasm wrapper's own worker, bundled by Vite under a name of ours.
//
// Left alone, `@ffmpeg/ffmpeg` spawns `new Worker(new URL('./worker.js',
// import.meta.url))` from inside node_modules — Vite does bundle that, but as an
// anonymous `worker-*.js` the precache glob in vite.config.ts cannot single out.
// Handing the wrapper this file's URL instead (`classWorkerURL`) gives the chunk a
// stable name to exclude. It is a `.js` on purpose: the package's `worker.d.ts` pulls
// the `webworker` lib into any TypeScript program that imports it, which collides
// with the `dom` lib the rest of the app is checked against.
import '@ffmpeg/ffmpeg/worker'
