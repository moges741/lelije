import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

// Contract A: the app imports the pose module only from ai/pose/index.js.
// Until that file exports createPoseEngine, `lelije-pose` resolves to a local
// stand-in with the same exports, so nothing in src/ changes when it lands.
const realPose = fileURLToPath(new URL('../ai/pose/index.js', import.meta.url))
const localPose = fileURLToPath(new URL('./src/lib/pose/mock.ts', import.meta.url))
const realPoseReady = existsSync(realPose) && readFileSync(realPose, 'utf8').includes('createPoseEngine')

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  return {
    plugins: [react()],
    resolve: {
      alias: { 'lelije-pose': realPoseReady ? realPose : localPose },
    },
    server: {
      host: '0.0.0.0',
      port: 3000,
      allowedHosts: true,
      fs: { allow: ['..'] },
      // Same-origin /api calls go to the Nest server (global prefix is already /api).
      proxy: {
        '/api': {
          target: env.VITE_API_PROXY || 'http://localhost:3000',
          changeOrigin: true,
        },
      },
    },
  }
})
