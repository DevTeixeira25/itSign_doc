# API de Integracao

Guia de referencia para integrar sistemas externos com a API do ITSign.

Base local de desenvolvimento:

- `http://localhost:3001`

Base path:

- `/v1`

## Visao geral

A API expõe dois tipos de fluxo:

- Endpoints autenticados para operacao administrativa: cadastro local, upload de documento, criacao de envelope, listagens e consulta de codigo de verificacao.
- Endpoints publicos para experiencia do signatario: consulta por token de assinatura, assinatura por link, download do PDF assinado e verificacao publica por codigo.

## Autenticacao

Os endpoints protegidos exigem header:

```http
Authorization: Bearer <firebase_id_token>
```

O token esperado e um Firebase ID Token valido. O backend valida esse token e tenta localizar o usuario local pelo `firebase_uid` ou pelo e-mail do token.

### Respostas de autenticacao

Sem token:

```json
{
  "statusCode": 401,
  "error": "Unauthorized",
  "message": "Token ausente"
}
```

Token invalido ou expirado:

```json
{
  "statusCode": 401,
  "error": "Unauthorized",
  "message": "Token invalido ou expirado"
}
```

## Formato de erros

Erros de validacao:

```json
{
  "statusCode": 400,
  "error": "Validation Error",
  "message": "Dados invalidos",
  "details": {
    "campo": ["mensagem"]
  }
}
```

Erros de negocio:

```json
{
  "statusCode": 400,
  "error": "BadRequestError",
  "message": "Mensagem de negocio"
}
```

Erros inesperados:

```json
{
  "statusCode": 500,
  "error": "Internal Server Error",
  "message": "Erro interno do servidor"
}
```

## Health check

### `GET /health`

Verifica disponibilidade da API.

Exemplo:

```bash
curl http://localhost:3001/health
```

Resposta:

```json
{
  "service": "itsign-api",
  "status": "ok",
  "timestamp": "2026-03-12T16:49:54.591Z"
}
```

## Fluxo administrativo autenticado

Fluxo recomendado para sistemas integrados:

1. Obter Firebase ID Token no cliente autenticado.
2. Registrar o usuario local na API, se ainda nao existir.
3. Fazer upload do PDF.
4. Criar o envelope com destinatarios.
5. Enviar o envelope.
6. Consultar status e, quando concluido, obter o codigo de verificacao.

### 1. Registrar usuario local

### `POST /v1/auth/register`

Cria organizacao e usuario local a partir de um usuario ja autenticado no Firebase.

Auth:

- obrigatoria

Body:

```json
{
  "organizationName": "Empresa Exemplo LTDA",
  "name": "Maria Souza",
  "email": "maria@empresa.com"
}
```

Resposta `201`:

```json
{
  "user": {
    "id": "5fd0d5d4-8ec1-4b74-9b9d-4bb2d2a8d7ee",
    "organizationId": "3b5a89d0-0d18-4322-bdb0-faf0cb9fc0ff",
    "name": "Maria Souza",
    "email": "maria@empresa.com"
  }
}
```

Exemplo:

```bash
curl -X POST http://localhost:3001/v1/auth/register \
  -H "Authorization: Bearer <firebase_id_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "organizationName": "Empresa Exemplo LTDA",
    "name": "Maria Souza",
    "email": "maria@empresa.com"
  }'
```

### 2. Consultar perfil autenticado

### `GET /v1/auth/me`

Retorna o usuario local associado ao token.

Auth:

- obrigatoria

Resposta `200`:

```json
{
  "id": "5fd0d5d4-8ec1-4b74-9b9d-4bb2d2a8d7ee",
  "organizationId": "3b5a89d0-0d18-4322-bdb0-faf0cb9fc0ff",
  "name": "Maria Souza",
  "email": "maria@empresa.com"
}
```

### 3. Atualizar perfil

### `PATCH /v1/auth/me`

Auth:

- obrigatoria

Body:

```json
{
  "name": "Maria Souza Silva"
}
```

### 4. Upload de documento

### `POST /v1/documents`

Faz upload de um arquivo, calcula hash SHA-256 e registra o documento.

Auth:

- obrigatoria

Content-Type:

- `multipart/form-data`

Campo esperado:

- `file`: PDF ou outro documento suportado

Exemplo:

```bash
curl -X POST http://localhost:3001/v1/documents \
  -H "Authorization: Bearer <firebase_id_token>" \
  -F "file=@./contrato.pdf"
```

Resposta `201`:

```json
{
  "id": "0af6bf2e-0ca7-4af3-a45c-d0e8de6739a0",
  "organizationId": "3b5a89d0-0d18-4322-bdb0-faf0cb9fc0ff",
  "fileName": "contrato.pdf",
  "mimeType": "application/pdf",
  "sha256Hash": "f8f9c0...",
  "createdAt": "2026-03-12T17:00:00.000Z"
}
```

### 5. Listar documentos

### `GET /v1/documents`

Auth:

- obrigatoria

Resposta:

```json
{
  "data": [
    {
      "id": "0af6bf2e-0ca7-4af3-a45c-d0e8de6739a0",
      "fileName": "contrato.pdf",
      "mimeType": "application/pdf",
      "sha256Hash": "f8f9c0..."
    }
  ]
}
```

### 6. Consultar documento

### `GET /v1/documents/:id`

Auth:

- obrigatoria

### 7. Download do documento

### `GET /v1/documents/:id/download`

Auth:

- obrigatoria

Retorna o arquivo. Se o documento ja estiver associado a um envelope com assinaturas aplicadas, a API tenta devolver a versao assinada.

## Envelopes

### `POST /v1/envelopes`

Cria um envelope em rascunho.

Auth:

- obrigatoria

Body:

```json
{
  "title": "Contrato de Prestacao de Servicos",
  "documentId": "0af6bf2e-0ca7-4af3-a45c-d0e8de6739a0",
  "recipients": [
    {
      "name": "Ana Cliente",
      "email": "ana@cliente.com",
      "role": "signer",
      "signingOrder": 1
    },
    {
      "name": "Carlos Diretor",
      "email": "carlos@empresa.com",
      "role": "approver",
      "signingOrder": 2
    }
  ],
  "expiresAt": "2026-12-31T23:59:59.000Z"
}
```

Observacoes:

- `role` aceita `signer`, `approver` e `viewer`.
- `recipients` aceita de 1 a 50 itens.
- `expiresAt` deve estar em formato ISO 8601.

Resposta `201`:

```json
{
  "id": "f9b53298-9a44-4d44-95d2-59bf9db0107c",
  "title": "Contrato de Prestacao de Servicos",
  "status": "draft",
  "documentId": "0af6bf2e-0ca7-4af3-a45c-d0e8de6739a0",
  "recipients": [
    {
      "id": "3d2dfc63-2de1-42e2-a455-58b955f1618f",
      "name": "Ana Cliente",
      "email": "ana@cliente.com",
      "role": "signer",
      "signingOrder": 1,
      "accessToken": "token_publico_do_destinatario"
    }
  ]
}
```

Nota:

- O retorno do envelope pode conter o `accessToken` do destinatario. Esse token e o link de assinatura publica e deve ser tratado como segredo.

### `POST /v1/envelopes/:id/send`

Move o envelope de rascunho para enviado.

Auth:

- obrigatoria

Exemplo:

```bash
curl -X POST http://localhost:3001/v1/envelopes/f9b53298-9a44-4d44-95d2-59bf9db0107c/send \
  -H "Authorization: Bearer <firebase_id_token>"
```

### `GET /v1/envelopes`

Lista envelopes da organizacao.

Auth:

- obrigatoria

Query params:

- `page` opcional, minimo `1`
- `pageSize` opcional, entre `1` e `100`

Exemplo:

```bash
curl "http://localhost:3001/v1/envelopes?page=1&pageSize=20" \
  -H "Authorization: Bearer <firebase_id_token>"
```

Resposta:

```json
{
  "data": [],
  "total": 0,
  "page": 1,
  "pageSize": 20
}
```

### `GET /v1/envelopes/:id`

Retorna detalhes do envelope.

Auth:

- obrigatoria

### `POST /v1/envelopes/:id/cancel`

Cancela o envelope.

Auth:

- obrigatoria

## Fluxo publico de assinatura por link

Esse fluxo e o mais simples para integracao com sistemas externos que desejam disparar assinatura para terceiros.

Fluxo:

1. Sistema autenticado cria o envelope.
2. Sistema obtém o `accessToken` do destinatario.
3. Sistema envia esse token por e-mail, SMS ou link interno.
4. Destinatario consulta o token via API publica.
5. Destinatario assina.
6. Destinatario pode baixar o PDF assinado.

### `GET /v1/sign/:token`

Consulta o contexto de assinatura do destinatario.

Auth:

- nao exige

Resposta:

```json
{
  "recipientId": "3d2dfc63-2de1-42e2-a455-58b955f1618f",
  "recipientName": "Ana Cliente",
  "recipientEmail": "ana@cliente.com",
  "role": "signer",
  "envelopeTitle": "Contrato de Prestacao de Servicos",
  "documentFileName": "contrato.pdf",
  "envelopeStatus": "sent",
  "alreadySigned": false
}
```

### `POST /v1/sign/:token`

Assina o documento usando assinatura desenhada, digitada ou por upload de imagem.

Auth:

- nao exige

Body:

```json
{
  "signatureData": "data:image/png;base64,iVBORw0KGgoAAA...",
  "signatureType": "draw",
  "signaturePosition": {
    "page": 1,
    "x": 20,
    "y": 75,
    "width": 28,
    "height": 12
  }
}
```

Regras:

- `signatureType` aceita `draw`, `type` e `upload`.
- `signaturePosition.page` e 1-based.
- `x`, `y`, `width` e `height` usam escala percentual de `0` a `100`.

Resposta:

```json
{
  "signed": true,
  "envelopeCompleted": false,
  "recipientId": "3d2dfc63-2de1-42e2-a455-58b955f1618f",
  "verificationCode": null
}
```

### `GET /v1/sign/:token/download`

Permite baixar o PDF assinado.

Auth:

- nao exige

Regra:

- so funciona depois que o proprio destinatario do token ja tiver assinado.

Resposta de erro antes da assinatura:

```json
{
  "statusCode": 403,
  "error": "Forbidden",
  "message": "Voce precisa assinar o documento antes de fazer o download"
}
```

## Verificacao publica

### `GET /v1/verify/:code`

Valida publicamente um documento concluido pelo codigo de verificacao.

Auth:

- nao exige

Exemplo:

```bash
curl http://localhost:3001/v1/verify/ITSN-A3F8-BC12-D9E4
```

Resposta esperada:

```json
{
  "valid": true,
  "verificationCode": "ITSN-A3F8-BC12-D9E4",
  "integrityCheck": "PASS",
  "certificateHash": "abc123...",
  "document": {
    "fileName": "contrato.pdf",
    "sha256Hash": "f8f9c0..."
  },
  "envelope": {
    "title": "Contrato de Prestacao de Servicos"
  },
  "signatures": []
}
```

### `GET /v1/envelopes/:id/verification`

Retorna o codigo de verificacao do envelope.

Auth:

- obrigatoria

Regra:

- so existe quando o envelope ja estiver concluido e com certificado de conclusao gerado.

Resposta:

```json
{
  "verificationCode": "ITSN-A3F8-BC12-D9E4",
  "verificationUrl": ""
}
```

## Certificado digital ICP-Brasil

### `POST /v1/certificates/validate`

Valida um certificado `.pfx` ou `.p12` sem assinar.

Auth:

- nao exige

Content-Type:

- `multipart/form-data`

Campos:

- `file`: arquivo `.pfx` ou `.p12`
- `password`: senha do certificado

Exemplo:

```bash
curl -X POST http://localhost:3001/v1/certificates/validate \
  -F "file=@./certificado.pfx" \
  -F "password=123456"
```

Resposta:

```json
{
  "certificate": {
    "commonName": "Maria Souza",
    "cpf": "12345678901",
    "cnpj": null,
    "issuerCN": "Autoridade Certificadora",
    "isIcpBrasil": true
  },
  "validation": {
    "valid": true,
    "errors": [],
    "warnings": []
  }
}
```

### `POST /v1/sign-with-certificate`

Assina um documento com certificado digital.

Auth:

- nao exige

Content-Type:

- `multipart/form-data`

Campos:

- `certificate`: arquivo `.pfx` ou `.p12`
- `password`: senha do certificado
- `recipientToken`: token publico do destinatario
- `envelopeId`: aceito pela rota, mas a assinatura depende do `recipientToken`
- `signaturePosition`: JSON opcional

Exemplo:

```bash
curl -X POST http://localhost:3001/v1/sign-with-certificate \
  -F "certificate=@./certificado.pfx" \
  -F "password=123456" \
  -F "recipientToken=<token_publico>" \
  -F 'signaturePosition={"page":1,"x":20,"y":75,"width":28,"height":12}'
```

Resposta:

```json
{
  "signed": true,
  "envelopeCompleted": true,
  "recipientId": "3d2dfc63-2de1-42e2-a455-58b955f1618f",
  "verificationCode": "ITSN-A3F8-BC12-D9E4",
  "certificate": {
    "commonName": "Maria Souza",
    "cpf": "12345678901",
    "cnpj": null,
    "issuer": "AC Exemplo",
    "isIcpBrasil": true,
    "certType": "A1",
    "signatureLevel": "qualificada"
  },
  "warnings": []
}
```

## Gov.br

Existem dois cenarios:

- autenticado: um usuario logado inicia o fluxo OAuth2
- publico: um destinatario com `recipientToken` inicia o fluxo sem login

### `POST /v1/govbr/authorize`

Inicia o fluxo Gov.br autenticado.

Auth:

- obrigatoria

Body:

```json
{
  "envelopeId": "f9b53298-9a44-4d44-95d2-59bf9db0107c",
  "recipientToken": "<token_publico>",
  "documentTitle": "Contrato de Prestacao de Servicos",
  "returnPath": "/self-sign"
}
```

Resposta:

```json
{
  "authUrl": "https://sso.staging.acesso.gov.br/authorize?...",
  "sessionId": "sessao_govbr"
}
```

### `POST /v1/govbr/public-authorize`

Inicia o fluxo Gov.br publico para destinatario.

Auth:

- nao exige

Body:

```json
{
  "recipientToken": "<token_publico>",
  "returnPath": "/sign/<token_publico>"
}
```

### `GET /v1/govbr/callback`

Callback OAuth2 do Gov.br. Essa rota e usada pelo proprio provedor e redireciona para o frontend.

Nao deve ser chamada manualmente por integradores, exceto em ambiente de teste controlado.

### `GET /v1/govbr/session/:sessionId`

Consulta status da sessao Gov.br.

Auth:

- nao exige

Resposta:

```json
{
  "sessionId": "sessao_govbr",
  "status": "authenticated",
  "user": {
    "name": "Maria Souza",
    "cpf": "123.***.***-90",
    "email": "maria@empresa.com",
    "nivel": "prata"
  }
}
```

### `POST /v1/govbr/sign/:sessionId`

Conclui a assinatura usando a identidade Gov.br autenticada na sessao.

Auth:

- nao exige

Body:

```json
{
  "recipientToken": "<token_publico>",
  "signaturePosition": {
    "page": 1,
    "x": 20,
    "y": 75,
    "width": 28,
    "height": 12
  }
}
```

Resposta:

```json
{
  "signed": true,
  "envelopeCompleted": true,
  "recipientId": "3d2dfc63-2de1-42e2-a455-58b955f1618f",
  "verificationCode": "ITSN-A3F8-BC12-D9E4",
  "govbr": {
    "name": "Maria Souza",
    "cpf": "123.***.***-90",
    "nivel": "prata",
    "signatureLevel": "avancada",
    "legalBasis": "Lei 14.063/2020 ..."
  }
}
```

### `POST /v1/govbr/quick-sign`

Atalho de desenvolvimento para mock.

Auth:

- obrigatoria

Restricao:

- so funciona quando `GOVBR_MOCK=true`

Body:

```json
{
  "recipientToken": "<token_publico>"
}
```

## Boas praticas de integracao

- Trate `recipientToken` como credencial secreta de uso unico ou controlado.
- Guarde `documentId`, `envelopeId`, `recipientId` e `verificationCode` no seu sistema para rastreabilidade.
- Sempre consulte `GET /v1/envelopes/:id` ou `GET /v1/verify/:code` antes de atualizar o status local do processo.
- Use `GET /v1/envelopes/:id/verification` apenas quando o envelope estiver concluido.
- Em uploads multipart, nao force `Content-Type: application/json`.
- Em desenvolvimento, a API pode operar em modo memoria quando o PostgreSQL estiver indisponivel. Nesse caso, os dados nao persistem entre reinicios.

## Limitacoes atuais

- A API ainda nao publica um contrato OpenAPI/Swagger.
- Nao ha webhooks documentados neste repositorio.
- O fluxo de autenticacao administrativa depende de Firebase ID Token.
- O retorno exato de alguns endpoints pode incluir campos adicionais dependendo do modo de persistencia e da evolucao do backend.
