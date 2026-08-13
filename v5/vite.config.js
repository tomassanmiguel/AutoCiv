import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'node:fs'
import path from 'node:path'

// The content dataset. This file is the SOURCE OF TRUTH for the content layer —
// techs, buildings, wonders and tier unlocks — and the editor at /editor.html
// writes it directly.
const CONTENT = path.resolve(import.meta.dirname, 'src/game/data/content.json')

/**
 * Dev-only content API, so the editor's Save button writes a real file instead
 * of downloading one you then have to move by hand.
 *
 * ⚠️ DEV SERVER ONLY. A production build has no server, so a built editor can
 * read the dataset but not save it. That is fine — it is an authoring tool, not
 * a game feature — but it does mean `npm run dev` has to be running to author.
 *
 * A write goes to a temp file and is then renamed, so an interrupted save
 * cannot leave a half-written dataset behind.
 */
function contentApi() {
  return {
    name: 'autociv-content-api',
    configureServer(server) {
      server.middlewares.use('/api/content', (req, res) => {
        if (req.method === 'GET') {
          const body = fs.existsSync(CONTENT) ? fs.readFileSync(CONTENT, 'utf8') : '{}'
          res.setHeader('Content-Type', 'application/json')
          res.end(body)
          return
        }
        if (req.method === 'PUT' || req.method === 'POST') {
          let raw = ''
          req.on('data', (c) => { raw += c })
          req.on('end', () => {
            try {
              const parsed = JSON.parse(raw) // reject malformed writes before touching disk
              const tmp = `${CONTENT}.tmp`
              fs.writeFileSync(tmp, JSON.stringify(parsed, null, 2) + '\n')
              fs.renameSync(tmp, CONTENT)
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({ ok: true, bytes: raw.length }))
            } catch (err) {
              res.statusCode = 400
              res.end(JSON.stringify({ ok: false, error: String(err) }))
            }
          })
          return
        }
        res.statusCode = 405
        res.end()
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), contentApi()],
  server: {
    watch: {
      // ⚠️ Visual Studio keeps `.vs/**/FileContentIndex/*.vsidx` LOCKED. Vite's
      // file watcher throws an unhandled `EBUSY` when it tries to watch one and
      // the dev server dies seconds after starting — which looked like "the
      // launcher doesn't work". Never watch editor scratch/metadata dirs.
      ignored: ['**/.vs/**', '**/.git/**', '**/node_modules/**'],
    },
  },
  build: {
    rollupOptions: {
      input: {
        main: path.resolve(import.meta.dirname, 'index.html'),
        editor: path.resolve(import.meta.dirname, 'editor.html'),
      },
    },
  },
})
