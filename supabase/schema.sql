-- Reflections database.
-- Paste this whole file into Supabase → SQL Editor → New query → Run.
-- Run it on a new project. It creates every table, the security rules and the credit system.

-- ───────────── People ─────────────
create table public.profiles (
  id uuid primary key references auth.users on delete cascade,
  username text unique not null,
  name text,
  bio text,
  link text,
  color text,
  plan text not null default 'free' check (plan in ('free','creator')),
  credits int not null default 500,
  credits_refilled_at date not null default current_date,
  is_guest boolean not null default false,
  age_confirmed boolean not null default false,
  terms_accepted_at timestamptz,
  created_at timestamptz not null default now()
);

-- Make a profile automatically for every new account, including guests (anonymous sign-ins).
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare guest boolean := coalesce(new.is_anonymous, false);
begin
  insert into public.profiles (id, username, name, is_guest, credits, age_confirmed, terms_accepted_at)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1), 'guest_' || substr(new.id::text, 1, 8)),
    new.raw_user_meta_data->>'name',
    guest,
    case when guest then 30 else 500 end,                 -- guests get one free song
    coalesce((new.raw_user_meta_data->>'age_confirmed')::boolean, false),
    case when new.raw_user_meta_data->>'terms_accepted' = 'true' then now() end
  );
  return new;
end; $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ───────────── Credits (the server is the source of truth) ─────────────
create table public.credit_ledger (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  change int not null,
  reason text not null,
  created_at timestamptz not null default now()
);
create table public.generation_log (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('song','lyrics','video')),
  model text,
  cost int not null default 0,
  created_at timestamptz not null default now()
);
create index on public.generation_log (user_id, created_at desc);

-- Spends credits in one step. Refills monthly (500 free, 5,000 Creator). Returns the new balance, or -1 if not enough.
create function public.spend_credits(p_user uuid, p_amount int, p_reason text) returns int
language plpgsql security definer set search_path = public as $$
declare bal int; pl text; refilled date; guest boolean;
begin
  select credits, plan, credits_refilled_at, is_guest into bal, pl, refilled, guest
    from profiles where id = p_user for update;
  if not found then return -1; end if;
  if not guest and refilled < date_trunc('month', current_date)::date then
    bal := case when pl = 'creator' then 5000 else 500 end;
    update profiles set credits = bal, credits_refilled_at = current_date where id = p_user;
    insert into credit_ledger (user_id, change, reason) values (p_user, bal, 'monthly refill');
  end if;
  if bal < p_amount then return -1; end if;
  update profiles set credits = credits - p_amount where id = p_user returning credits into bal;
  insert into credit_ledger (user_id, change, reason) values (p_user, -p_amount, p_reason);
  return bal;
end; $$;
revoke execute on function public.spend_credits(uuid, int, text) from public, anon, authenticated;

-- ───────────── Posts ─────────────
create table public.posts (
  id bigint generated always as identity primary key,
  author uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('photo','song','film','remix','duet')),
  title text,
  caption text,
  vibe text,
  lyrics jsonb,
  media_url text,              -- public media only. Exclusive media lives in exclusive_media.
  background text,
  price_cents int,             -- set for exclusive (paid) posts
  parent_id bigint references public.posts(id) on delete set null,  -- remix or duet of
  created_at timestamptz not null default now(),
  check (price_cents is null or media_url is null)                   -- paid posts never expose media here
);

create table public.exclusive_media (
  post_id bigint primary key references public.posts(id) on delete cascade,
  media_url text not null
);
create table public.unlocks (             -- written only by the server after a successful payment
  user_id uuid not null references public.profiles(id) on delete cascade,
  post_id bigint not null references public.posts(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, post_id)
);
create table public.likes (
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  post_id bigint not null references public.posts(id) on delete cascade,
  reaction text not null default 'like' check (reaction in ('like','fire','cry','clap','drop','lol')),
  primary key (user_id, post_id)
);
create table public.comments (
  id bigint generated always as identity primary key,
  post_id bigint not null references public.posts(id) on delete cascade,
  author uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 500),
  created_at timestamptz not null default now()
);
create table public.follows (
  follower uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  followee uuid not null references public.profiles(id) on delete cascade,
  primary key (follower, followee)
);
create table public.messages (
  id bigint generated always as identity primary key,
  sender uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  recipient uuid not null references public.profiles(id) on delete cascade,
  body text,
  post_id bigint references public.posts(id) on delete set null,
  created_at timestamptz not null default now()
);
create table public.tips (                -- written only by the server after a successful payment
  id bigint generated always as identity primary key,
  from_user uuid references public.profiles(id) on delete set null,
  to_user uuid not null references public.profiles(id) on delete cascade,
  post_id bigint references public.posts(id) on delete set null,
  amount_cents int not null,
  note text,
  created_at timestamptz not null default now()
);
create table public.reports (
  id bigint generated always as identity primary key,
  reporter uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  post_id bigint references public.posts(id) on delete cascade,
  reason text not null,
  created_at timestamptz not null default now()
);
create table public.waitlist (
  id bigint generated always as identity primary key,
  email text not null unique check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  created_at timestamptz not null default now()
);

-- What the app's feed reads (likes counted live)
create view public.feed with (security_invoker = on) as
  select p.*, pr.username, pr.name,
         (select count(*) from public.likes l where l.post_id = p.id) as likes
  from public.posts p join public.profiles pr on pr.id = p.author;

-- ───────────── Security rules ─────────────
alter table public.profiles        enable row level security;
alter table public.credit_ledger   enable row level security;
alter table public.generation_log  enable row level security;
alter table public.posts           enable row level security;
alter table public.exclusive_media enable row level security;
alter table public.unlocks         enable row level security;
alter table public.likes           enable row level security;
alter table public.comments        enable row level security;
alter table public.follows         enable row level security;
alter table public.messages        enable row level security;
alter table public.tips            enable row level security;
alter table public.reports         enable row level security;
alter table public.waitlist        enable row level security;

create policy "profiles are public"       on public.profiles for select using (true);
create policy "edit your own profile"     on public.profiles for update using (auth.uid() = id)
  with check (auth.uid() = id);
-- credits and plan can only change through the server
create function public.protect_profile_fields() returns trigger language plpgsql as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    new.credits := old.credits; new.plan := old.plan;
    new.credits_refilled_at := old.credits_refilled_at; new.is_guest := old.is_guest;
  end if;
  return new;
end; $$;
create trigger protect_profile_fields before update on public.profiles
  for each row execute function public.protect_profile_fields();

create policy "see your own credits"      on public.credit_ledger  for select using (auth.uid() = user_id);
create policy "see your own usage"        on public.generation_log for select using (auth.uid() = user_id);

create policy "posts are public"          on public.posts for select using (true);
create policy "post as yourself"          on public.posts for insert with check (auth.uid() = author);
create policy "edit your own posts"       on public.posts for update using (auth.uid() = author);
create policy "delete your own posts"     on public.posts for delete using (auth.uid() = author);

create policy "author or buyer sees exclusive media" on public.exclusive_media for select using (
  exists (select 1 from public.posts p where p.id = post_id and p.author = auth.uid())
  or exists (select 1 from public.unlocks u where u.post_id = exclusive_media.post_id and u.user_id = auth.uid()));
create policy "authors add exclusive media" on public.exclusive_media for insert with check (
  exists (select 1 from public.posts p where p.id = post_id and p.author = auth.uid()));
create policy "see your own unlocks"      on public.unlocks for select using (auth.uid() = user_id);

create policy "likes are public"          on public.likes for select using (true);
create policy "like as yourself"          on public.likes for insert with check (auth.uid() = user_id);
create policy "change your own like"      on public.likes for update using (auth.uid() = user_id);
create policy "unlike as yourself"        on public.likes for delete using (auth.uid() = user_id);

create policy "comments are public"       on public.comments for select using (true);
create policy "comment as yourself"       on public.comments for insert with check (auth.uid() = author);
create policy "delete your own comments"  on public.comments for delete using (auth.uid() = author);

create policy "follows are public"        on public.follows for select using (true);
create policy "follow as yourself"        on public.follows for insert with check (auth.uid() = follower);
create policy "unfollow as yourself"      on public.follows for delete using (auth.uid() = follower);

create policy "read your own messages"    on public.messages for select using (auth.uid() in (sender, recipient));
create policy "send as yourself"          on public.messages for insert with check (auth.uid() = sender);

create policy "see tips you sent or got"  on public.tips for select using (auth.uid() in (from_user, to_user));
create policy "report as yourself"        on public.reports for insert with check (auth.uid() = reporter);
create policy "anyone can join waitlist"  on public.waitlist for insert to anon, authenticated with check (true);

-- ───────────── Storage ─────────────
insert into storage.buckets (id, name, public) values ('songs', 'songs', true)  on conflict (id) do nothing;   -- public songs
insert into storage.buckets (id, name, public) values ('exclusive', 'exclusive', false) on conflict (id) do nothing; -- paid media, served by signed links
