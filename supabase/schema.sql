-- Reflections database. Paste this whole file into Supabase → SQL Editor → New query → Run.

-- People
create table public.profiles (
  id uuid primary key references auth.users on delete cascade,
  username text unique not null,
  name text,
  bio text,
  link text,
  color text,
  created_at timestamptz not null default now()
);

-- Make a profile automatically when someone signs up
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, username, name)
  values (new.id,
          coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1)),
          new.raw_user_meta_data->>'name');
  return new;
end; $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Posts, reels, songs, films, remixes and duet verses
create table public.posts (
  id bigint generated always as identity primary key,
  author uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('photo','song','film','remix','duet')),
  title text,
  caption text,
  vibe text,
  lyrics jsonb,
  media_url text,
  background text,
  price_cents int,              -- set for exclusive (paid) posts
  parent_id bigint references public.posts(id) on delete set null,  -- remix or duet of
  likes int not null default 0,
  created_at timestamptz not null default now()
);

create table public.follows (
  follower uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  followee uuid not null references public.profiles(id) on delete cascade,
  primary key (follower, followee)
);

create table public.waitlist (
  id bigint generated always as identity primary key,
  email text not null unique,
  created_at timestamptz not null default now()
);

-- What the app's feed reads
create view public.feed with (security_invoker = on) as
  select p.*, pr.username, pr.name from public.posts p join public.profiles pr on pr.id = p.author;

-- Security rules
alter table public.profiles enable row level security;
alter table public.posts    enable row level security;
alter table public.follows  enable row level security;
alter table public.waitlist enable row level security;

create policy "profiles are public"        on public.profiles for select using (true);
create policy "edit your own profile"      on public.profiles for update using (auth.uid() = id);
create policy "posts are public"           on public.posts for select using (true);
create policy "post as yourself"           on public.posts for insert with check (auth.uid() = author);
create policy "edit your own posts"        on public.posts for update using (auth.uid() = author);
create policy "delete your own posts"      on public.posts for delete using (auth.uid() = author);
create policy "follows are public"         on public.follows for select using (true);
create policy "follow as yourself"         on public.follows for insert with check (auth.uid() = follower);
create policy "unfollow as yourself"       on public.follows for delete using (auth.uid() = follower);
create policy "anyone can join waitlist"   on public.waitlist for insert to anon, authenticated with check (true);

-- Public storage for finished songs (the AI function writes here)
insert into storage.buckets (id, name, public) values ('songs', 'songs', true)
  on conflict (id) do nothing;
