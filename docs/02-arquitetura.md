# Arquitetura ITSign

## Aplicacoes

- `apps/web`: interface administrativa e assinatura via navegador.
- `apps/api`: API central para autenticacao, envelopes, documentos e auditoria.
- `apps/mobile`: app de assinatura e acompanhamento de status.
- `packages/shared-types`: contratos compartilhados entre web/api.

## Servicos de dominio (API)

- `auth`: login, refresh token, MFA.
- `organizations`: multi-tenant e permissao por papel.
- `documents`: upload, hash, versoes e armazenamento.
- `envelopes`: roteamento de assinatura e expiracao.
- `signatures`: capturas de assinatura e validacao.
- `audit`: eventos imutaveis e certificado de conclusao.

## Infraestrutura

- PostgreSQL para dados transacionais.
- Redis/BullMQ para lembretes e jobs assincronos.
- S3/MinIO para armazenamento de PDFs.
- Webhooks para integracoes externas.
