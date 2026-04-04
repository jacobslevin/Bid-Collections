import react from '@vitejs/plugin-react'

// Vite 2.x has no `defineConfig` export; use a plain object.
export default {
  plugins: [react()],
  server: {
    port: 5173
  }
}
