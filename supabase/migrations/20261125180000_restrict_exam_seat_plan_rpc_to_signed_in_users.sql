-- Seat-plan writes use a SECURITY DEFINER function with an explicit school-role
-- check. Never expose that privileged RPC to anonymous callers.
revoke all on function public.save_school_exam_seat_plan(text,jsonb,jsonb) from public;
revoke all on function public.save_school_exam_seat_plan(text,jsonb,jsonb) from anon;
grant execute on function public.save_school_exam_seat_plan(text,jsonb,jsonb) to authenticated;
