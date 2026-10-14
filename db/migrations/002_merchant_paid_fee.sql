-- Fee model: the merchant pays Honeydoo's flat per-order fee (Bites-style). Customers pay the shop's
-- regular prices plus tax only. orders.service_fee is kept for history and is 0 for new orders.
alter table orders add column merchant_fee int not null default 0 check (merchant_fee >= 0);
alter table orders add column merchant_fee_waived boolean not null default false;
-- Fee owed by the merchant but not collected through the processor (for example, app-fee permission
-- not granted). Invoiced separately.
alter table transactions add column fee_receivable int not null default 0;
comment on column merchants.service_fee_enabled is 'Honeydoo per-order merchant fee applies (admin can waive for promotions)';
comment on column merchants.service_fee_minor is 'Honeydoo per-order merchant fee in cents';
