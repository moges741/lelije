import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

// Camera pose stays on the stand-in until Dagm's module is swapped in.
const localPose = fileURLToPath(new URL('./src/lib/pose/mock.ts', import.meta.url))

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  return {
    plugins: [react()],
    resolve: {
      alias: { 'lelije-pose': localPose },
    },
    server: {
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
