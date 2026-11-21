import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

const DEFAULT_CORS_ORIGIN = 'http://localhost:5173';

async function bootstrap() {
  // Loads backend/.env for local runs; a deployed server sets real environment variables instead.
  try {
    process.loadEnvFile();
  } catch {
    // No .env file: use the environment as it is.
  }

  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api');

  // CORS_ORIGIN is a comma-separated list of frontend addresses, or * for any.
  const origins = (process.env.CORS_ORIGIN || DEFAULT_CORS_ORIGIN)
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  app.enableCors({ origin: origins.includes('*') ? '*' : origins });

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
