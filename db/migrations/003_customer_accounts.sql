-- Customer accounts: email and password sign-in, server-side sessions, password reset tokens.
-- Browsing and guest checkout never require an account.

alter table customers add column password_hash text;
alter table customers add column email_verified_at timestamptz;
alter table customers add column deleted_at timestamptz;
create unique index customers_email_lower_idx on customers (lower(email)) where email is not null;

-- Opaque session tokens. Only a SHA-256 of the token is stored, so a database leak cannot be replayed.
create table customer_sessions (
  id           uuid primary key default gen_random_uuid(),
  customer_id  uuid not null references customers(id) on delete cascade,
  token_hash   text not null unique,
  created_at   timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  expires_at   timestamptz not null,
  revoked_at   timestamptz
);
create index customer_sessions_customer_idx on customer_sessions(customer_id);

create table password_resets (
  id          uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers(id) on delete cascade,
  token_hash  text not null unique,
  expires_at  timestamptz not null,
  used_at     timestamptz,
  created_at  timestamptz not null default now()
);

create index carts_customer_idx on carts(customer_id, status);
