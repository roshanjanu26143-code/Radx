-- Add group-aware subject catalog entries for Standards 11 and 12.
-- Existing rows are retained with an empty group_name, meaning shared across all groups.
alter table public.school_academic_subjects
  add column if not exists group_name text not null default '';

alter table public.school_academic_subjects
  drop constraint if exists school_academic_subjects_unique;

alter table public.school_academic_subjects
  add constraint school_academic_subjects_unique
  unique (school_id, academic_year, standard_name, group_name, subject_name);
