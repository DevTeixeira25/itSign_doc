-- ITSign initial schema (PostgreSQL)

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

create table organizations (
  id uuid primary key default gen_random_uuid(),
  name varchar(200) not null,
  created_at timestamptz not null default now()
);

create table users (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  name varchar(200) not null,
  email varchar(320) not null,
  password_hash text not null,
  created_at timestamptz not null default now(),
  unique (organization_id, email)
);

create table documents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  file_name varchar(500) not null,
  mime_type varchar(100) not null,
  storage_key text not null,
  sha256_hash char(64) not null,
  uploaded_by uuid not null references users(id),
  created_at timestamptz not null default now()
);

create table envelopes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  document_id uuid not null references documents(id),
  title varchar(255) not null,
  status varchar(30) not null default 'draft',
  message text,
  created_by uuid not null references users(id),
  expires_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create table recipients (
  id uuid primary key default gen_random_uuid(),
  envelope_id uuid not null references envelopes(id) on delete cascade,
  name varchar(200) not null,
  email varchar(320) not null,
  role varchar(20) not null,
  signing_order int not null,
  status varchar(20) not null default 'pending',
  access_token_hash text not null,
  signed_at timestamptz,
  created_at timestamptz not null default now()
);

create table signature_events (
  id uuid primary key default gen_random_uuid(),
  envelope_id uuid not null references envelopes(id) on delete cascade,
  recipient_id uuid references recipients(id) on delete set null,
  event_type varchar(60) not null,
  event_payload jsonb,
  occurred_at timestamptz not null default now()
);

create table audit_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  envelope_id uuid references envelopes(id) on delete set null,
  actor_user_id uuid references users(id) on delete set null,
  actor_email varchar(320),
  action varchar(80) not null,
  ip_address varchar(64),
  user_agent text,
  metadata jsonb,
  created_at timestamptz not null default now()
);

create table completion_certificates (
  id uuid primary key default gen_random_uuid(),
  envelope_id uuid not null unique references envelopes(id) on delete cascade,
  certificate_storage_key text not null,
  certificate_sha256 char(64) not null,
  generated_at timestamptz not null default now()
);

-- ── Indexes ────────────────────────────────────────────────
create index idx_users_email on users (email);
create index idx_envelopes_org_status on envelopes (organization_id, status);
create index idx_envelopes_created_by on envelopes (created_by);
create index idx_recipients_envelope_order on recipients (envelope_id, signing_order);
create index idx_recipients_token_hash on recipients (access_token_hash);
create index idx_audit_logs_org_created_at on audit_logs (organization_id, created_at desc);
create index idx_audit_logs_envelope on audit_logs (envelope_id);
create index idx_signature_events_envelope on signature_events (envelope_id);
