import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.setGlobalPrefix('api');
  app.enableCors({
    origin: process.env.CORS_ORIGIN?.split(',') ?? true,
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // strip properties the DTO does not declare
      forbidNonWhitelisted: true, // and reject the request that sent them
      transform: true,
    }),
  );

  const config = new DocumentBuilder()
    .setTitle('LMS API')
    .setDescription('Admin, teacher and student endpoints')
    .setVersion('1.0')
    .addBearerAuth()
    .build();

  SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, config));

  const port = process.env.PORT ?? 5000;
  await app.listen(port);
  console.log(`API on http://localhost:${port}/api · docs on http://localhost:${port}/docs`);
}

void bootstrap();
