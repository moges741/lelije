import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

// Contract A: the app imports the pose module only from ai/pose/index.js.
// Until that file is on main, `lelije-pose` resolves to a local stand-in
// with the same exports, so nothing in src/ changes when it lands.
const realPose = fileURLToPath(new URL('../ai/pose/index.js', import.meta.url))
const localPose = fileURLToPath(new URL('./src/lib/pose/mock.ts', import.meta.url))

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  return {
    plugins: [react()],
    resolve: {
      alias: { 'lelije-pose': existsSync(realPose) ? realPose : localPose },
    },
    server: {
      fs: { allow: ['..'] },
      // Point VITE_API_PROXY at the Backend dev server to use real endpoints.
      proxy: env.VITE_API_PROXY ? { '/api': env.VITE_API_PROXY } : undefined,
    },
  }
})
