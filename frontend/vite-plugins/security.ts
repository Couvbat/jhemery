import type { Plugin } from 'vite'
import { buildSecurityTxt } from '../src/content/security'

/**
 * `security.txt` at the root, dated by the build, since its `Expires` counts from the
 * deploy. RFC 9116 wants it under `/.well-known/`, but the deploy's rsync excludes that
 * folder whole so that `--delete` never touches AutoSSL's challenges. `.htaccess` answers
 * the well-known path from this file instead, and the root one is the RFC's legacy
 * location anyway.
 */
export function securityPlugin(): Plugin {
  return {
    name: 'couvbat-security',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'security.txt', source: buildSecurityTxt() })
    },
    // Both paths in dev, where there is no `.htaccess` to rewrite the well-known one.
    configureServer(server) {
      for (const path of ['/security.txt', '/.well-known/security.txt']) {
        server.middlewares.use(path, (_req, res) => {
          res.setHeader('Content-Type', 'text/plain; charset=utf-8')
          res.end(buildSecurityTxt())
        })
      }
    },
  }
}
