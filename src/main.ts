import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
// import * as dotenv from 'dotenv';

// dotenv.config();

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  // Enable validation globally
  app.useGlobalPipes(new ValidationPipe());

  await app.listen(process.env.PORT ?? 3000, '0.0.0.0');
  console.log(`Application is running on: ${await app.getUrl()}`);
}
bootstrap();
