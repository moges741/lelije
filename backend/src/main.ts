import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  // Loads backend/.env for local runs; a deployed server sets real environment variables instead.
  try {
    process.loadEnvFile();
  } catch {
    // No .env file: use the environment as it is.
  }

  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api');
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
