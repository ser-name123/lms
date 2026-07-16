import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';

import { AppModule } from './app.module';

// A browser Origin never carries quotes, whitespace or a trailing slash, so any
// of those in CORS_ORIGIN silently match nothing — the request is simply refused
// with no allow-origin header. Normalise instead of trusting the dashboard field.
function allowedOrigins(): string[] | true {
  const raw = process.env.CORS_ORIGIN;
  if (!raw) return true; // unset: reflect any origin (local dev)

  const origins = raw
    .split(',')
    .map((o) =>
      o
        .trim()
        .replace(/^["']|["']$/g, '')
        .replace(/\/+$/, ''),
    )
    .filter(Boolean);

  return origins.length > 0 ? origins : true;
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Standard hardening headers (CSP off by default — this is a JSON API).
  app.use(helmet());

  app.setGlobalPrefix('api');
  const origins = allowedOrigins();
  console.log(
    `CORS origins: ${origins === true ? '(any)' : origins.join(' | ')}`,
  );
  app.enableCors({
    origin: origins,
    // Only allow credentialed cross-origin requests against an explicit
    // allowlist; never combine "reflect any origin" with credentials.
    credentials: origins !== true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // strip properties the DTO does not declare
      forbidNonWhitelisted: true, // and reject the request that sent them
      transform: true,
    }),
  );

  // API docs enumerate the whole surface — keep them out of production.
  if (process.env.NODE_ENV !== 'production') {
    const config = new DocumentBuilder()
      .setTitle('LMS API')
      .setDescription('Admin, teacher and student endpoints')
      .setVersion('1.0')
      .addBearerAuth()
      .build();

    SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, config));
  }

  const port = process.env.PORT ?? 5000;
  await app.listen(port);
  console.log(
    `API on http://localhost:${port}/api · docs on http://localhost:${port}/docs`,
  );
}

void bootstrap();
