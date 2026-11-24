create table if not exists public.school_fee_structures (
  id uuid primary key default gen_random_uuid(),
  school_id text not null,
  academic_year text not null,
  standard_name text not null,
  fee_name text not null,
  amount numeric(12,2) not null check (amount > 0),
  due_date date,
  is_active boolean not null default true,
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint school_fee_structures_school_id_id_unique unique (school_id, id)
);

create index if not exists school_fee_structures_school_year_idx
  on public.school_fee_structures (school_id, academic_year, standard_name, is_active);

create table if not exists public.school_fee_payments (
  id uuid primary key default gen_random_uuid(),
  school_id text not null,
  fee_structure_id uuid not null,
  student_person_id text not null,
  academic_year text not null,
  receipt_number text not null,
  paid_amount numeric(12,2) not null check (paid_amount > 0),
  payment_method text not null check (payment_method in ('Cash','UPI','Bank Transfer','Card','Cheque')),
  transaction_reference text,
  paid_on date not null default current_date,
  notes text,
  received_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint school_fee_payments_receipt_unique unique (school_id, receipt_number),
  constraint school_fee_payments_structure_fk foreign key (school_id, fee_structure_id)
    references public.school_fee_structures(school_id, id) on delete restrict,
  constraint school_fee_payments_student_fk foreign key (school_id, student_person_id)
    references public.school_people(school_id, person_id) on delete restrict
);

create index if not exists school_fee_payments_school_student_idx
  on public.school_fee_payments (school_id, student_person_id, academic_year, paid_on desc);
create index if not exists school_fee_payments_school_structure_idx
  on public.school_fee_payments (school_id, fee_structure_id);

alter table public.school_fee_structures enable row level security;
alter table public.school_fee_payments enable row level security;

grant select, insert, update, delete on public.school_fee_structures to authenticated;
grant select, insert on public.school_fee_payments to authenticated;

create policy "Finance users read fee structures"
on public.school_fee_structures for select to authenticated
using (
  exists (select 1 from public.school_tenants t
    where t.school_id = school_fee_structures.school_id and t.admin_user_id = (select auth.uid()))
  or exists (select 1 from public.school_user_roles r
    where r.school_id = school_fee_structures.school_id
      and r.user_id = (select auth.uid()) and r.status = 'active'
      and r.allowed_pages && array['Finance','Fees','Fees Structure','Pending Fees']::text[])
);

create policy "Finance users create fee structures"
on public.school_fee_structures for insert to authenticated
with check (
  exists (select 1 from public.school_tenants t
    where t.school_id = school_fee_structures.school_id and t.admin_user_id = (select auth.uid()))
  or exists (select 1 from public.school_user_roles r
    where r.school_id = school_fee_structures.school_id
      and r.user_id = (select auth.uid()) and r.status = 'active'
      and r.allowed_pages && array['Fees Structure']::text[])
);

create policy "Finance users update fee structures"
on public.school_fee_structures for update to authenticated
using (
  exists (select 1 from public.school_tenants t
    where t.school_id = school_fee_structures.school_id and t.admin_user_id = (select auth.uid()))
  or exists (select 1 from public.school_user_roles r
    where r.school_id = school_fee_structures.school_id
      and r.user_id = (select auth.uid()) and r.status = 'active'
      and 'Fees Structure' = any(r.allowed_pages))
)
with check (
  exists (select 1 from public.school_tenants t
    where t.school_id = school_fee_structures.school_id and t.admin_user_id = (select auth.uid()))
  or exists (select 1 from public.school_user_roles r
    where r.school_id = school_fee_structures.school_id
      and r.user_id = (select auth.uid()) and r.status = 'active'
      and 'Fees Structure' = any(r.allowed_pages))
);

create policy "Finance users delete fee structures"
on public.school_fee_structures for delete to authenticated
using (
  exists (select 1 from public.school_tenants t
    where t.school_id = school_fee_structures.school_id and t.admin_user_id = (select auth.uid()))
);

create policy "Finance users read fee payments"
on public.school_fee_payments for select to authenticated
using (
  exists (select 1 from public.school_tenants t
    where t.school_id = school_fee_payments.school_id and t.admin_user_id = (select auth.uid()))
  or exists (select 1 from public.school_user_roles r
    where r.school_id = school_fee_payments.school_id
      and r.user_id = (select auth.uid()) and r.status = 'active'
      and r.allowed_pages && array['Finance','Fees','Pending Fees']::text[])
);

create policy "Cashiers and admins record fee payments"
on public.school_fee_payments for insert to authenticated
with check (
  received_by = (select auth.uid())
  and (
    exists (select 1 from public.school_tenants t
      where t.school_id = school_fee_payments.school_id and t.admin_user_id = (select auth.uid()))
    or exists (select 1 from public.school_user_roles r
      where r.school_id = school_fee_payments.school_id
        and r.user_id = (select auth.uid()) and r.status = 'active'
        and r.allowed_pages && array['Finance','Fees']::text[])
  )
);
