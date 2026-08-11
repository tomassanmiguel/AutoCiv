import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// v4 is a single-entry app for now. The content editor (a second Vite entry with
// a dev-only /api/content middleware, as in v3) will be re-added when we build the
// re-scoped editor — see v4/docs/design.md §12. Until then the game runs on
// hard-coded placeholder content (v4/docs/techs.md).
export default defineConfig({
  plugins: [react()],
  server: {
    watch: {
      // Visual Studio keeps `.vs/**/FileContentIndex/*.vsidx` LOCKED; watching it
      // throws EBUSY and kills the dev server. Never watch editor scratch dirs.
      ignored: ['**/.vs/**', '**/.git/**', '**/node_modules/**'],
    },
  },
})
