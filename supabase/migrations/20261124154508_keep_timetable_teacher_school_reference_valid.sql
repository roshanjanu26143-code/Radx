alter table public.school_academic_timetable drop constraint if exists school_academic_timetable_teacher_fk;
alter table public.school_academic_timetable add constraint school_academic_timetable_teacher_fk
 foreign key(school_id,teacher_person_id) references public.school_people(school_id,person_id) on delete restrict;
