-- Attendance writes remain Admin-only until teacher-to-person and class allotments are mapped.
drop policy if exists "Assigned teachers can create attendance sessions" on public.school_attendance_sessions;
drop policy if exists "Assigned teachers can insert attendance marks" on public.school_attendance_marks;
