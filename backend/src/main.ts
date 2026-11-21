import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';

const DEFAULT_CORS_ORIGIN = '*';

async function bootstrap() {
  // Loads repo root .env and backend/.env for local runs; deployed environments inject process.env directly.
  const repoRootEnv = resolve(__dirname, '..', '..', '.env');
  const backendEnv = resolve(__dirname, '..', '.env');
  for (const envPath of [repoRootEnv, backendEnv]) {
    if (existsSync(envPath)) {
      try {
        process.loadEnvFile(envPath);
      } catch {
        // Ignore malformed or unreadable optional env files.
      }
    }
  }

  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.setGlobalPrefix('api');

  // CORS_ORIGIN is a comma-separated list of frontend addresses, or * for any.
  const origins = (process.env.CORS_ORIGIN || DEFAULT_CORS_ORIGIN)
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  app.enableCors({ origin: origins.includes('*') ? true : origins });

  // Serve root /public (pose models + wasm) and built frontend SPA from the same port 3000 server.
  const repoRoot = resolve(__dirname, '..', '..');
  const rootPublicDir = join(repoRoot, 'public');
  const frontendDistDir = join(repoRoot, 'frontend', 'dist');

  if (existsSync(rootPublicDir)) {
    app.useStaticAssets(rootPublicDir);
  }
  if (existsSync(frontendDistDir)) {
    app.useStaticAssets(frontendDistDir);
    const indexHtml = join(frontendDistDir, 'index.html');
    app.use(
      (
        req: { method: string; path: string },
        res: { sendFile: (file: string) => void },
        next: () => void,
      ) => {
        if (req.method !== 'GET' || req.path.startsWith('/api')) {
          return next();
        }
        if (existsSync(indexHtml)) {
          return res.sendFile(indexHtml);
        }
        return next();
      },
    );
  }

  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port, '0.0.0.0');
  console.log(`LeLije server listening on http://0.0.0.0:${port}`);
}
bootstrap();
