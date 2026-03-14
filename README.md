# ITSign

Monorepo do ITSign para Web, API e Mobile.

## Stack

- Web: Next.js + TypeScript
- API: Node.js + TypeScript (Fastify)
- Mobile: Flutter (Dart)
- Banco: PostgreSQL
- Storage: S3/MinIO

## Estrutura

```text
apps/
  web/
  api/
  mobile/
packages/
  shared-types/
infra/
  db/
docs/
```

## Como comecar

1. Instalar dependencias JS:

```bash
pnpm install
```

2. Subir Web + API em paralelo:

```bash
pnpm dev
```

3. Rodar mobile:

```bash
cd apps/mobile
flutter pub get
flutter run
```

## Roadmap MVP

1. Autenticacao e organizacao multi-tenant.
2. Upload de PDF e hash SHA-256.
3. Fluxo de envelope com assinatura por ordem.
4. Trilha de auditoria e certificado de conclusao.

## Documentacao

- Setup local: `docs/01-setup.md`
- Arquitetura: `docs/02-arquitetura.md`
- Sprint 1: `docs/03-sprint-1.md`
- API para integracao: `docs/04-api-integracao.md`
- Setup mobile: `docs/05-mobile-setup.md`
- Swagger UI (API local): `http://localhost:3001/docs`
