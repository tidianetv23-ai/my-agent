-- Schema de la base pour l'assistant personnel.
-- A executer dans Supabase : SQL Editor > New query > coller > Run.

-- Tokens Google (une seule ligne, id = 1).
create table if not exists google_tokens (
  id integer primary key,
  refresh_token text,
  access_token text,
  expiry_date bigint,
  scope text,
  updated_at timestamptz default now()
);

-- Objectifs.
create table if not exists goals (
  id bigint generated always as identity primary key,
  title text not null,
  detail text,
  created_at timestamptz default now()
);

-- Habitudes a suivre.
create table if not exists habits (
  id bigint generated always as identity primary key,
  name text not null,
  cadence text not null default 'quotidienne',
  created_at timestamptz default now()
);

-- Journal des habitudes cochees (1 ligne par habitude et par jour).
create table if not exists habit_logs (
  id bigint generated always as identity primary key,
  habit_id bigint references habits(id) on delete cascade,
  day date not null,
  created_at timestamptz default now(),
  unique (habit_id, day)
);

-- Briefings generes.
create table if not exists briefings (
  id bigint generated always as identity primary key,
  date_label text,
  content jsonb not null,
  created_at timestamptz default now()
);

create index if not exists briefings_created_idx on briefings (created_at desc);
create index if not exists habit_logs_day_idx on habit_logs (day);
