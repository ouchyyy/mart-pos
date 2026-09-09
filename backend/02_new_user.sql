-- ============================================================
-- FILE 2 of 7 — GIVE EVERY NEW SIGNUP A PROFILE
--
-- Supabase creates the login in its own auth.users table. This
-- watches for that and makes the matching profiles row, so the
-- shop knows their name and what they may do.
--
-- It is its own file because it is short, self-contained, and
-- the one most likely to need re-running on its own: if signup
-- ever fails with "Database error creating new user", this is
-- the file to run again.
-- ============================================================

-- Two details here are easy to miss, and both break signup:
--
-- "security definer" runs the function with the owner's rights,
-- so it can write to profiles even though the person signing up
-- has no rights yet.
--
-- "set search_path = public" tells it which schema to look in.
-- Supabase runs this from its own auth schema, so without that
-- line it cannot find the profiles table and every signup fails.
create function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, new.raw_user_meta_data->>'full_name');
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();
