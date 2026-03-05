// Environment configuration with defaults for local development

export const config = {
  port: Number(process.env.PORT ?? 3001),
  host: process.env.HOST ?? "0.0.0.0",

  // Database
  databaseUrl:
    process.env.DATABASE_URL ??
    "postgres://postgres:postgres@localhost:5432/itsign",

  // JWT
  jwtSecret: process.env.JWT_SECRET ?? "itsign-dev-secret-change-in-production",
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? "8h",

  // Storage (local FS for dev, S3/MinIO in prod)
  storageDir: process.env.STORAGE_DIR ?? "./storage",

  // App
  webUrl: process.env.WEB_URL ?? "http://localhost:3005",
  apiUrl: process.env.API_URL ?? "http://localhost:3001",
} as const;
