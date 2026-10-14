-- honeydoo staff (admin dashboard) accounts: invite-only, password + authenticator code, server-side sessions.

create table staff_users (
  id                uuid primary key default gen_random_uuid(),
  email             text not null,
  name              text not null,
  role              text not null default 'analyst' check (role in ('owner','analyst')),
  password_hash     text,
  totp_secret_enc   text,                 -- AES-256-GCM envelope, never plaintext
  totp_enabled_at   timestamptz,
  totp_last_step    bigint not null default 0,  -- blocks reuse of a code that already worked
  failed_attempts   int not null default 0,
  locked_until      timestamptz,
  last_login_at     timestamptz,
  disabled_at       timestamptz,
  invited_by        uuid references staff_users(id),
  created_at        timestamptz not null default now()
);
create unique index staff_users_email_idx on staff_users (lower(email));

create table staff_invites (
  id          uuid primary key default gen_random_uuid(),
  staff_id    uuid not null references staff_users(id) on delete cascade,
  token_hash  text not null unique,
  expires_at  timestamptz not null,
  used_at     timestamptz,
  created_at  timestamptz not null default now()
);

create table staff_sessions (
  id          uuid primary key default gen_random_uuid(),
  staff_id    uuid not null references staff_users(id) on delete cascade,
  token_hash  text not null unique,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null,
  revoked_at  timestamptz
);
create index staff_sessions_staff_idx on staff_sessions(staff_id);
