# Setup local

## Requisitos

- Node.js 22+
- pnpm 10+
- Flutter 3+
- PostgreSQL 16+

## Instalar dependencias

```bash
pnpm install
```

## Rodar web + api

```bash
pnpm dev
```

- Web: http://localhost:3000
- API: http://localhost:3001/health

## Rodar mobile

```bash
cd apps/mobile
flutter pub get
flutter run
```

## Banco de dados

Aplicar script inicial:

- `infra/db/001_init.sql`
