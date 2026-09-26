import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  // Relative assets let the same build work both at a domain root and in a
  // GitHub Pages project subdirectory (for example /pawer/).
  base: './',
  plugins: [react()],
})
