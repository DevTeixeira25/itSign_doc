# Sprint 1 (MVP)

## Objetivo

Entregar fluxo fim-a-fim: criar envelope com 1 signatario, assinar e concluir com auditoria.

## Backlog tecnico

1. Estruturar API com modulo de `auth` e `envelopes`.
2. Criar esquema inicial do banco e migracoes.
3. Implementar upload de documento e hash SHA-256.
4. Criar endpoint de criacao de envelope.
5. Criar endpoint de assinatura (token unico por destinatario).
6. Registrar eventos em `audit_logs` para todas as transicoes.
7. Gerar `completion_certificate` ao concluir envelope.
8. Criar tela web de envio e status do envelope.
9. Criar tela mobile de inbox e assinatura simples.
10. Adicionar testes de integracao do fluxo principal.
