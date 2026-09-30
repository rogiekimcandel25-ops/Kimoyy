-- Scholarship Monitoring System schema. Run in Supabase > SQL Editor.
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  role text not null default 'scholar' check (role in ('admin','staff','scholar'))
);

create table if not exists scholarship_programs (
  id uuid primary key default gen_random_uuid(),
  program_name text not null unique,
  required_gwa numeric(4,2) not null,
  min_units int not null default 0 check (min_units >= 0),
  allow_failing_grade boolean not null default false,
  active boolean not null default true
);

create table if not exists scholars (
  id uuid primary key default gen_random_uuid(),
  student_id text not null unique check (length(trim(student_id)) > 0),
  full_name text not null,
  degree_program text,
  year_level int check (year_level between 1 and 8),
  scholarship_id uuid not null references scholarship_programs(id),
  status text not null default 'Active' check (status in
    ('Active','Pending Submission','For Verification','Compliant','With Deficiency',
     'Probationary','For Renewal','Renewed','Disqualified'))
);

create table if not exists grade_submissions (
  id uuid primary key default gen_random_uuid(),
  scholar_id uuid not null references scholars(id) on delete cascade,
  academic_year text not null,
  semester text not null check (semester in ('1st','2nd','Summer')),
  gwa numeric(4,2) not null,
  units_enrolled int not null check (units_enrolled >= 0),
  failed_subjects int not null default 0 check (failed_subjects >= 0),
  incomplete_subjects int not null default 0 check (incomplete_subjects >= 0),
  submission_status text not null default 'Pending' check (submission_status in ('Pending','Verified','Returned')),
  evaluation text check (evaluation in ('Compliant','With Deficiency')),
  evaluation_notes text,
  submitted_at timestamptz not null default now(),
  verified_by uuid references profiles(id),
  verified_at timestamptz,
  unique (scholar_id, academic_year, semester)   -- BR-03
);

-- Auto-create a profile (role 'scholar') for every new auth user.
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles(id, full_name) values (new.id, coalesce(new.raw_user_meta_data->>'full_name', new.email));
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function handle_new_user();

create or replace function is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and role in ('admin','staff'))
$$;

alter table profiles enable row level security;
alter table scholarship_programs enable row level security;
alter table scholars enable row level security;
alter table grade_submissions enable row level security;

create policy "own profile" on profiles for select using (id = auth.uid() or is_staff());
create policy "staff all programs" on scholarship_programs for all using (is_staff()) with check (is_staff());
create policy "staff all scholars" on scholars for all using (is_staff()) with check (is_staff());
create policy "staff all submissions" on grade_submissions for all using (is_staff()) with check (is_staff());

-- Sample programs (adjust GWA to your grading scale; see README)
insert into scholarship_programs(program_name, required_gwa, min_units, allow_failing_grade) values
 ('University Academic Scholarship', 1.75, 15, false),
 ('Government Merit Scholarship', 2.00, 12, false),
 ('Private Endowment Grant', 2.50, 12, true)
on conflict do nothing;

-- After creating your first user, promote them:
-- update profiles set role = 'admin' where id = (select id from auth.users where email = 'you@example.com');
