import { useEffect, useMemo, useState } from 'react'
import { CalendarDays, Download, RefreshCw, Users, UserCheck, Percent } from 'lucide-react'
import { supabase } from '../lib/supabase'

type AttendanceSession = {
 id: string
 attendance_date: string
 session_code: string
 standard_name: string
 section_name: string
 teacher_person_id: string
 submitted_at: string | null
}
type AttendanceMark = { id: string; session_id: string; student_person_id: string; attendance_status: string }
type TeacherAttendance = { id:string; attendance_date:string; session_code:string; teacher_person_id:string; checked_in_for_standard:string; checked_in_for_section:string; attendance_status:string; checked_in_at:string }
type Student = { person_id: string; full_name: string; details: Record<string, unknown> }
type ReportRow = AttendanceMark & { student_name: string; roll_number: string }
type AcademicSubmission = { id:string; academic_year:string; report_period:string|null; standard_name:string; section_name:string; status:string; submitted_at:string; record_count:number; review_note:string|null }

const monthStart = (value: string) => value + '-01'
const monthEnd = (value: string) => {
 const [year, month] = value.split('-').map(Number)
 const lastDay = new Date(year, month, 0).getDate()
 return year + '-' + String(month).padStart(2, '0') + '-' + String(lastDay).padStart(2, '0')
}
const csvCell = (value: unknown) => '"' + String(value ?? '').replace(/"/g, '""') + '"'

export default function AttendanceReports({ schoolId, userRole }: { schoolId: string; userRole: string }) {
 const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7))
 const [standard, setStandard] = useState('All')
 const [section, setSection] = useState('All')
 const [sessions, setSessions] = useState<AttendanceSession[]>([])
 const [marks, setMarks] = useState<AttendanceMark[]>([])
 const [teacherAttendance, setTeacherAttendance] = useState<TeacherAttendance[]>([])
 const [students, setStudents] = useState<Student[]>([])
 const [selectedSession, setSelectedSession] = useState('')
 const [loading, setLoading] = useState(true)
 const [refreshing, setRefreshing] = useState(false)
 const [error, setError] = useState('')
 const [submissions,setSubmissions] = useState<AcademicSubmission[]>([])
 const [submissionBusy,setSubmissionBusy] = useState(false)
 const [reviewNote,setReviewNote] = useState('')

 const load = async () => {
  setLoading(true); setRefreshing(true); setError('')
  const [sessionResult, teacherResult, submissionResult] = await Promise.all([
   supabase.from('school_attendance_sessions').select('id,attendance_date,session_code,standard_name,section_name,teacher_person_id,submitted_at').eq('school_id',schoolId).gte('attendance_date',monthStart(month)).lte('attendance_date',monthEnd(month)).order('attendance_date',{ascending:false}),
   supabase.from('school_teacher_attendance').select('id,attendance_date,session_code,teacher_person_id,checked_in_for_standard,checked_in_for_section,attendance_status,checked_in_at').eq('school_id',schoolId).gte('attendance_date',monthStart(month)).lte('attendance_date',monthEnd(month)).order('attendance_date',{ascending:false}),
   supabase.from('school_academic_submissions').select('id,academic_year,report_period,standard_name,section_name,status,submitted_at,record_count,review_note').eq('school_id',schoolId).eq('submission_type','attendance_report').eq('report_period',month).order('submitted_at',{ascending:false})
  ])
  if(submissionResult.error){setError(submissionResult.error.message);setSubmissions([])}else setSubmissions((submissionResult.data||[]) as AcademicSubmission[])
  if(sessionResult.error){setError(sessionResult.error.message);setSessions([]);setMarks([]);setStudents([]);setTeacherAttendance([]);setLoading(false);setRefreshing(false);return}
  if(teacherResult.error){setError(teacherResult.error.message);setTeacherAttendance([])}
  const nextSessions=(sessionResult.data||[]) as AttendanceSession[]
  const nextTeacherAttendance=(teacherResult.data||[]) as TeacherAttendance[]
  setSessions(nextSessions);setTeacherAttendance(nextTeacherAttendance)
  const sessionIds=nextSessions.map(row=>row.id)
  let nextMarks:AttendanceMark[]=[]
  if(sessionIds.length){
   const {data:markData,error:markError}=await supabase.from('school_attendance_marks').select('id,session_id,student_person_id,attendance_status').eq('school_id',schoolId).in('session_id',sessionIds)
   if(markError){setError(markError.message);setMarks([]);setStudents([]);setLoading(false);setRefreshing(false);return}
   nextMarks=(markData||[]) as AttendanceMark[]
  }
  setMarks(nextMarks)
  const personIds=[...new Set([...nextMarks.map(row=>row.student_person_id),...nextSessions.map(row=>row.teacher_person_id),...nextTeacherAttendance.map(row=>row.teacher_person_id)])]
  if(personIds.length){
   const {data:peopleData,error:peopleError}=await supabase.from('school_people').select('person_id,full_name,details').eq('school_id',schoolId).in('person_id',personIds)
   if(peopleError)setError(peopleError.message)
   setStudents((peopleData||[]) as Student[])
  }else setStudents([])
  setSelectedSession(current=>current&&sessionIds.includes(current)?current:'')
  setLoading(false);setRefreshing(false)
 }

 useEffect(() => { void load() }, [schoolId, month])

 const standards = useMemo(() => ['All', ...new Set([...sessions.map(row => row.standard_name), ...teacherAttendance.map(row => row.checked_in_for_standard)])], [sessions, teacherAttendance])
 const sections = useMemo(() => ['All', ...new Set([...sessions.filter(row => standard === 'All' || row.standard_name === standard).map(row => row.section_name), ...teacherAttendance.filter(row => standard === 'All' || row.checked_in_for_standard === standard).map(row => row.checked_in_for_section)])], [sessions, teacherAttendance, standard])
 const filteredSessions = useMemo(() => sessions.filter(row => (standard === 'All' || row.standard_name === standard) && (section === 'All' || row.section_name === section)), [sessions, standard, section])
 const filteredTeacherAttendance = useMemo(() => teacherAttendance.filter(row => (standard === 'All' || row.checked_in_for_standard === standard) && (section === 'All' || row.checked_in_for_section === section)), [teacherAttendance, standard, section])
 const filteredIds = useMemo(() => new Set(filteredSessions.map(row => row.id)), [filteredSessions])
 const filteredMarks = useMemo(() => marks.filter(row => filteredIds.has(row.session_id)), [marks, filteredIds])
 const presentCount = filteredMarks.filter(row => row.attendance_status.toUpperCase() === 'PRESENT').length
 const absentCount = filteredMarks.filter(row => row.attendance_status.toUpperCase() === 'ABSENT').length
 const attendanceRate = filteredMarks.length ? Math.round((presentCount / filteredMarks.length) * 1000) / 10 : 0
 const selected = filteredSessions.find(row => row.id === selectedSession)
 const selectedMarks = selected ? filteredMarks.filter(row => row.session_id === selected.id) : []
 const studentById = useMemo(() => new Map(students.map(row => [row.person_id, row])), [students])
 const detailRows: ReportRow[] = selectedMarks.map(row => {
  const student = studentById.get(row.student_person_id)
  return { ...row, student_name: student?.full_name || row.student_person_id, roll_number: String(student?.details?.roll_number || '') }
 }).sort((a, b) => a.roll_number.localeCompare(b.roll_number, undefined, { numeric: true }) || a.student_name.localeCompare(b.student_name))

 const academicYearForMonth = (value:string) => { const [year,monthNumber]=value.split('-').map(Number); const start=monthNumber>=4?year:year-1; return start+'-'+String(start+1).slice(-2) }
 const submitAttendanceReport = async () => {
  if(standard==='All'||section==='All'){setError('Choose one standard and one section before submitting its report.');return}
  const scoped=filteredSessions.filter(row=>row.standard_name===standard&&row.section_name===section)
  if(!scoped.length){setError('There are no completed attendance sessions for this standard and section in the selected month.');return}
  setSubmissionBusy(true);setError('')
  const sessionIds=scoped.map(row=>row.id)
  const count=marks.filter(row=>sessionIds.includes(row.session_id)).length
  const {error:saveError}=await supabase.from('school_academic_submissions').insert({school_id:schoolId,submission_type:'attendance_report',academic_year:academicYearForMonth(month),report_period:month,standard_name:standard,section_name:section,status:'submitted',record_count:count,source_session_ids:sessionIds})
  setSubmissionBusy(false)
  if(saveError){setError(saveError.code==='23505'?'This monthly attendance report has already been submitted.':saveError.message);return}
  await load()
 }
 const reviewSubmission = async (row:AcademicSubmission,status:'approved'|'returned') => {
  setSubmissionBusy(true);setError('')
  const {data:userData}=await supabase.auth.getUser()
  const {error:reviewError}=await supabase.from('school_academic_submissions').update({status,reviewed_by:userData.user?.id,reviewed_at:new Date().toISOString(),review_note:reviewNote.trim()||null,updated_at:new Date().toISOString()}).eq('school_id',schoolId).eq('id',row.id)
  setSubmissionBusy(false)
  if(reviewError){setError(reviewError.message);return}
  setReviewNote('');await load()
 }

 const exportCsv = () => {
  const rows = filteredMarks.map(mark => {
   const session = sessions.find(item => item.id === mark.session_id)
   const student = studentById.get(mark.student_person_id)
   return [session?.attendance_date, session?.session_code, session?.standard_name, session?.section_name, session ? (studentById.get(session.teacher_person_id)?.full_name || session.teacher_person_id) : '', student?.details?.roll_number || '', student?.full_name || mark.student_person_id, mark.attendance_status]
  })
  const teacherRows = filteredTeacherAttendance.map(row => [row.attendance_date,row.session_code,row.checked_in_for_standard,row.checked_in_for_section,studentById.get(row.teacher_person_id)?.full_name || row.teacher_person_id,'','TEACHER CHECK-IN',row.attendance_status])
  const content = [['Date', 'Session', 'Standard', 'Section', 'Teacher', 'Roll number', 'Student', 'Status'], ...rows, ...teacherRows].map(row => row.map(csvCell).join(',')).join(String.fromCharCode(13,10))
  const url = URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8;' }))
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'attendance-report-' + month + '.csv'; anchor.click(); URL.revokeObjectURL(url)
 }

 return <section className="workspace-panel attendance-report">
  <style>{`
   .attendance-report .report-toolbar{display:flex;gap:12px;align-items:end;flex-wrap:wrap;margin:18px 0}
   .attendance-report .report-toolbar label{display:grid;gap:6px;color:#53635b;font-size:12px;font-weight:700}
   .attendance-report .report-toolbar input,.attendance-report .report-toolbar select{min-height:42px;border:1px solid #dce7e0;border-radius:10px;padding:0 12px;background:#fff;color:#20352a}
   .attendance-report .report-actions{display:flex;gap:8px;margin-left:auto}
   .attendance-report .report-actions button,.attendance-report .report-select-button{border:1px solid #dce7e0;background:#fff;border-radius:10px;padding:10px 13px;color:#234333;font-weight:700;display:inline-flex;align-items:center;gap:7px;cursor:pointer}
   .attendance-report .report-stats{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:12px;margin:18px 0}
   .attendance-report .report-stat{border:1px solid #e4ece7;border-radius:14px;padding:16px;background:#fff}
   .attendance-report .report-stat span{display:flex;align-items:center;gap:7px;color:#68776f;font-size:12px;font-weight:700}
   .attendance-report .report-stat strong{display:block;font-size:26px;color:#183d2b;margin-top:9px}
   .attendance-report .report-stat small{color:#87938d}
   .attendance-report .report-table-wrap{overflow:auto;border:1px solid #e5ece7;border-radius:12px}
   .attendance-report table{width:100%;border-collapse:collapse;min-width:620px}
   .attendance-report th,.attendance-report td{padding:12px 14px;text-align:left;border-bottom:1px solid #edf1ee;font-size:13px}
   .attendance-report th{background:#f7faf8;color:#66766d;font-size:11px;text-transform:uppercase;letter-spacing:.05em}
   .attendance-report tbody tr:last-child td{border-bottom:0}
   .attendance-report .report-row-button{border:0;background:transparent;color:#24734a;font-weight:700;cursor:pointer;padding:0}
   .attendance-report .status-present{color:#16834b;font-weight:800}.attendance-report .status-absent{color:#c34c4c;font-weight:800}
   .attendance-report .report-empty{padding:30px;text-align:center;color:#748178}
   .attendance-report .report-detail{margin-top:22px}
   .attendance-report .report-detail h3{margin:0 0 12px;color:#1c3829}
   @media(max-width:760px){.attendance-report .report-stats{grid-template-columns:repeat(2,minmax(0,1fr))}.attendance-report .report-actions{margin-left:0}}
  `}</style>
  <div className="workspace-heading"><div><span className="section-eyebrow">ATTENDANCE ANALYTICS</span><h2>Attendance Report</h2><p>{userRole === 'Teacher' ? 'Review submitted attendance for your assigned classes.' : 'Completed class QR attendance sessions are submitted here automatically. Review each standard, section and student register, then export the monthly report.'} Monthly totals update from saved attendance records.</p></div></div>
  <div className="report-toolbar">
   <label>Month<input type="month" value={month} onChange={event => setMonth(event.target.value)}/></label>
   <label>Standard<select value={standard} onChange={event => { setStandard(event.target.value); setSection('All') }}>{standards.map(value => <option key={value}>{value}</option>)}</select></label>
   <label>Section<select value={section} onChange={event => setSection(event.target.value)}>{sections.map(value => <option key={value}>{value}</option>)}</select></label>
   <div className="report-actions"><button type="button" onClick={() => void load()} disabled={refreshing}><RefreshCw size={15}/>{refreshing ? 'Refreshing…' : 'Refresh'}</button><button type="button" onClick={exportCsv} disabled={!filteredMarks.length&&!filteredTeacherAttendance.length}><Download size={15}/> Export CSV</button></div>
  </div>
  <div className="report-stats">
   <div className="report-stat"><span><CalendarDays size={15}/> Sessions</span><strong>{filteredSessions.length}</strong><small>Recorded attendance sessions</small></div>
   <div className="report-stat"><span><Users size={15}/> Students marked</span><strong>{filteredMarks.length}</strong><small>Across selected sessions</small></div>
   <div className="report-stat"><span><UserCheck size={15}/> Present</span><strong>{presentCount}</strong><small>Present student marks</small></div>
   <div className="report-stat"><span><Percent size={15}/> Attendance rate</span><strong>{attendanceRate}%</strong><small>{absentCount} absent marks</small></div>
   <div className="report-stat"><span><UserCheck size={15}/> Teachers present</span><strong>{filteredTeacherAttendance.length}</strong><small>Verified QR check-ins</small></div>
  </div>
  {error && <div className="qr-error">{error}</div>}
  <div className="workspace-panel" style={{marginTop:18,padding:16,border:'1px solid #e4ece7',borderRadius:14}}>
   <div className="workspace-heading"><div><h3>Standard report submission</h3><p>Submit the selected month's completed QR attendance register to Academic Staff for review.</p></div><button type="button" className="primary-action" onClick={()=>void submitAttendanceReport()} disabled={submissionBusy||userRole==='Teacher'||standard==='All'||section==='All'||!filteredSessions.length}>{submissionBusy?'Submitting…':'Submit standard report'}</button></div>
   {userRole==='Teacher'&&<p className="people-form-note">Teachers can view reports. A Standard Coordinator or authorized Academic role submits the monthly report.</p>}
   <div className="report-table-wrap"><table><thead><tr><th>Academic year</th><th>Month</th><th>Standard</th><th>Section</th><th>Records</th><th>Submitted</th><th>Status</th><th>Review</th></tr></thead><tbody>{submissions.map(row=><tr key={row.id}><td>{row.academic_year}</td><td>{row.report_period||'—'}</td><td>{row.standard_name}</td><td>{row.section_name}</td><td>{row.record_count}</td><td>{new Date(row.submitted_at).toLocaleString('en-IN')}</td><td><b>{row.status.replace('_',' ')}</b></td><td>{row.review_note||'—'}{(row.status==='submitted'||row.status==='under_review')&&userRole!=='Teacher'&&<div style={{display:'flex',gap:6,marginTop:6}}><input aria-label="Review note" value={reviewNote} onChange={e=>setReviewNote(e.target.value)} placeholder="Optional note" style={{maxWidth:160}}/><button type="button" className="report-select-button" disabled={submissionBusy} onClick={()=>void reviewSubmission(row,'approved')}>Approve</button><button type="button" className="report-select-button" disabled={submissionBusy} onClick={()=>void reviewSubmission(row,'returned')}>Return</button></div>}</td></tr>)}{!submissions.length&&<tr><td colSpan={8} className="report-empty">No monthly attendance report submissions for this month.</td></tr>}</tbody></table></div>
  </div>
  <div className="workspace-heading" style={{marginTop:24}}><div><h3>Teacher attendance</h3><p>Teacher check-in is recorded after identity and assigned-section verification.</p></div></div>
  {filteredTeacherAttendance.length ? <div className="report-table-wrap"><table><thead><tr><th>Date</th><th>Session</th><th>Teacher</th><th>Checked in for</th><th>Check-in time</th><th>Status</th></tr></thead><tbody>{filteredTeacherAttendance.map(row=><tr key={row.id}><td>{new Date(row.attendance_date+'T00:00:00').toLocaleDateString('en-IN')}</td><td>{row.session_code}</td><td>{studentById.get(row.teacher_person_id)?.full_name || row.teacher_person_id}</td><td>{row.checked_in_for_standard} · {row.checked_in_for_section}</td><td>{new Date(row.checked_in_at).toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'})}</td><td className="status-present">{row.attendance_status}</td></tr>)}</tbody></table></div> : <div className="report-empty">No teacher QR check-ins recorded for this month and filter selection.</div>}
  <div className="workspace-heading" style={{marginTop:24}}><div><h3>Session register</h3><p>Select a session to view its student register.</p></div></div>
  {loading ? <div className="report-empty">Loading attendance records…</div> : filteredSessions.length ? <div className="report-table-wrap"><table><thead><tr><th>Date</th><th>Standard</th><th>Section</th><th>Session</th><th>Class teacher</th><th>Students</th><th>Present</th><th>Absent</th><th>Submitted</th><th>Details</th></tr></thead><tbody>{filteredSessions.map(session => {
   const rows = marks.filter(row => row.session_id === session.id)
   const present = rows.filter(row => row.attendance_status.toUpperCase() === 'PRESENT').length
   const absent = rows.filter(row => row.attendance_status.toUpperCase() === 'ABSENT').length
   return <tr key={session.id}><td>{new Date(session.attendance_date + 'T00:00:00').toLocaleDateString('en-IN')}</td><td>{session.standard_name}</td><td>{session.section_name}</td><td>{session.session_code}</td><td>{studentById.get(session.teacher_person_id)?.full_name || session.teacher_person_id}</td><td>{rows.length}</td><td className="status-present">{present}</td><td className="status-absent">{absent}</td><td>{session.submitted_at?new Date(session.submitted_at).toLocaleString('en-IN',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}):'Not submitted'}</td><td><button className="report-row-button" onClick={() => setSelectedSession(session.id)}>{selectedSession === session.id ? 'Selected' : 'View register'}</button></td></tr>
  })}</tbody></table></div> : <div className="report-empty">No attendance sessions were recorded for this month and filter selection.</div>}
  {selected && <div className="report-detail"><div className="workspace-heading"><div><h3>Student register</h3><p>{new Date(selected.attendance_date + 'T00:00:00').toLocaleDateString('en-IN')} · {selected.standard_name} · Section {selected.section_name} · {selected.session_code} · Class teacher: {studentById.get(selected.teacher_person_id)?.full_name || selected.teacher_person_id}</p></div></div>
   {detailRows.length ? <div className="report-table-wrap"><table><thead><tr><th>Date</th><th>Roll number</th><th>Student name</th><th>Attendance</th></tr></thead><tbody>{detailRows.map(row => <tr key={row.id}><td>{new Date(selected.attendance_date+'T00:00:00').toLocaleDateString('en-IN')}</td><td>{row.roll_number || '—'}</td><td>{row.student_name}</td><td className={row.attendance_status.toUpperCase() === 'PRESENT' ? 'status-present' : 'status-absent'}>{row.attendance_status}</td></tr>)}</tbody></table></div> : <div className="report-empty">No student marks found for this session.</div>}
  </div>}
  <p className="people-form-note" style={{marginTop:16}}>Monthly percentage = present marks ÷ all recorded student marks. This is a session-based percentage, not a unique-student monthly average.</p>
 </section>
}
