import "dotenv/config";
import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix("api");
  const allowedOrigins = new Set([
    "http://localhost:3000",
    "http://localhost:3001",
    "https://admin-phi-dun-65.vercel.app",
    ...(process.env.CORS_ORIGINS || "")
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean),
  ]);
  app.enableCors({
    origin: (origin: string | undefined, callback: (error: Error | null, allow?: boolean) => void) => {
      callback(null, !origin || allowedOrigins.has(origin));
    },
    exposedHeaders: ["Content-Disposition"],
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );
  const port = Number(process.env.PORT || 4000);
  await app.listen(port);
  console.log(`PharmacyOS API listening on http://localhost:${port}/api`);
}

bootstrap();
