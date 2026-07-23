import { NestFactory } from '@nestjs/core';
import { AppModule } from './src/app.module';
import { StudentsService } from './src/students/students.service';
import * as dotenv from 'dotenv';
dotenv.config();

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const service = app.get(StudentsService);
  
  console.log('Fetching students list from service...');
  const res = await service.list({ page: 1, limit: 200 });
  console.log('Result:', JSON.stringify(res, null, 2));
  
  await app.close();
}

main().catch(console.error);
