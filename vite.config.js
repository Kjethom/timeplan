import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

// Må stemme med navnet på GitHub-repoet.
const REPO_NAVN = 'timeplan'

export default defineConfig(({ command }) => ({
  base: command === 'build' ? `/${REPO_NAVN}/` : '/',
  plugins: [react(), tailwindcss()],
}))
