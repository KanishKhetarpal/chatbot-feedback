import 'dotenv/config';

import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import type { NextFunction, Request, Response } from 'express';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { frontendOrigins } from './common/origins';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const logger = new Logger('Bootstrap');

  app.useBodyParser('json', { limit: '5mb' });
  app.enableShutdownHooks();
  app.setGlobalPrefix('api/v1');

  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );

  // Behind Railway's proxy: trust exactly one hop so `req.ip` is the real client
  // and the per-IP throttle is not one shared bucket for the whole internet.
  app.set('trust proxy', 1);

  // The public chat routes can be embedded on other sites (the bot's
  // `allowedOrigins`), so CORS on that path answers whatever origin asked. The
  // real gate is the server-side origin check in WidgetService.
  app.use('/api/v1/widget', (req: Request, res: Response, next: NextFunction) => {
    res.setHeader('Access-Control-Allow-Origin', req.headers.origin ?? '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Vary', 'Origin');
    if (req.method === 'OPTIONS') {
      res.sendStatus(204);
      return;
    }
    next();
  });

  const origins = frontendOrigins();
  app.enableCors({
    origin: process.env.NODE_ENV === 'production' ? origins : '*',
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Chatbot Feedback API')
    .setDescription('Configure AI chatbots, share them, and review the recorded conversations.')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, swaggerConfig));

  if (!process.env.ANTHROPIC_API_KEY) {
    logger.warn('ANTHROPIC_API_KEY is not set — training and chat will fail until it is.');
  }

  const port = process.env.PORT ?? 3100;
  await app.listen(port);
  logger.log(`Chatbot Feedback API on http://localhost:${port}/api/v1`);
  logger.log(`Swagger docs at http://localhost:${port}/api/docs`);
  logger.log(`Allowed frontend origins: ${origins.join(', ')}`);
}

bootstrap();
