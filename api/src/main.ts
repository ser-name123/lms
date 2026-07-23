import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { json, raw, urlencoded } from 'express';
import helmet from 'helmet';

import { AppModule } from './app.module';
import { isDroppedConnection } from './common/dropped-connection';

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

/*
 * A dropped pooled connection is survivable — the pool reconnects on the next
 * query — so it is logged and swallowed. Everything else is rethrown, so an
 * unhandled rejection still crashes loudly the way Node intends rather than
 * leaving the process running in an unknown state.
 */
process.on('unhandledRejection', (reason) => {
  if (isDroppedConnection(reason)) {
    console.warn(
      `[db] dropped connection, continuing: ${String((reason as any)?.message ?? reason)}`,
    );
    return;
  }
  throw reason;
});

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bodyParser: false });

  /*
   * The Stripe webhook is signed over the EXACT bytes Stripe sent. Parsing the
   * JSON and re-serialising it changes key order and whitespace, so the
   * signature no longer verifies and every genuine event is rejected — the
   * classic way this integration fails. Keep the raw Buffer for that one route
   * and parse everything else as usual.
   */
  app.use('/api/payments/webhook', raw({ type: 'application/json' }));

  // Increase payload limits to support base64 image uploads (e.g. logo, favicon)
  app.use(json({ limit: '10mb' }));
  app.use(urlencoded({ extended: true, limit: '10mb' }));

  // Serve only the upload folders that browsers must load via bare <img>/<a>
  // tags (which cannot carry an auth header): profile avatars and knowledgebase
  // learning materials. Receipts are deliberately NOT served here — they are
  // financial documents and are streamed through the auth-guarded
  // GET /api/expenses/receipt/:filename endpoint instead. Serving the whole
  // uploads/ dir statically used to expose every receipt to the open internet.
  const express = require('express');
  const path = require('path');
  const uploadsRoot = path.join(process.cwd(), 'uploads');
  for (const prefix of ['/uploads', '/api/uploads']) {
    app.use(`${prefix}/avatars`, express.static(path.join(uploadsRoot, 'avatars')));
    app.use(
      `${prefix}/knowledgebase`,
      express.static(path.join(uploadsRoot, 'knowledgebase')),
    );
    app.use(
      `${prefix}/student-docs`,
      express.static(path.join(uploadsRoot, 'student-docs')),
    );
    app.use(
      `${prefix}/assignments`,
      express.static(path.join(uploadsRoot, 'assignments')),
    );
    app.use(
      `${prefix}/assessments`,
      express.static(path.join(uploadsRoot, 'assessments')),
    );
  }

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
