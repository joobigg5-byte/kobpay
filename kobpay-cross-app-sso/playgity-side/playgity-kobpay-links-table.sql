-- Run this in PLAYGITY's own Supabase project (xjoiauahkfixvsuhwcmz),
-- NOT the shared kobpay-sovereign-rail project.

create table public.kobpay_identity_links (
  kobpay_user_id uuid primary key,
  playgity_user_id uuid not null,
  phone text not null,
  created_at timestamptz not null default now()
);

comment on table public.kobpay_identity_links is
  'Maps a KobPay identity (from the shared kobpay-sovereign-rail project) to this app''s own local user record. Populated automatically by the kobpay-sso-exchange Edge Function on first login.';

-- Lock this down — only the Edge Function (using the service role key,
-- which bypasses RLS) should ever touch this table.
alter table public.kobpay_identity_links enable row level security;
