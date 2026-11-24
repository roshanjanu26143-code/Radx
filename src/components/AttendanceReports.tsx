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
type Student = { person_id: string; full_name: string; details: Record<string, unknown> }
type ReportRow = AttendanceMark & { student_name: string; roll_number: string }

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
 const [students, setStudents] = useState<Student[]>([])
 const [selectedSession, setSelectedSession] = useState('')
 const [loading, setLoading] = useState(true)
 const [refreshing, setRefreshing] = useState(false)
 const [error, setError] = useState('')

 const load = async () => {
  setLoading(true); setRefreshing(true); setError('')
  const { data: sessionData, error: sessionError } = await supabase
   .from('school_attendance_sessions')
   .select('id,attendance_date,session_code,standard_name,section_name,teacher_person_id,submitted_at')
   .eq('school_id', schoolId)
   .gte('attendance_date', monthStart(month))
   .lte('attendance_date', monthEnd(month))
   .order('attendance_date', { ascending: false })
  if (sessionError) { setError(sessionError.message); setSessions([]); setMarks([]); setStudents([]); setLoading(false); setRefreshing(false); return }
  const nextSessions = (sessionData || []) as AttendanceSession[]
  setSessions(nextSessions)
  if (!nextSessions.length) { setMarks([]); setStudents([]); setSelectedSession(''); setLoading(false); setRefreshing(false); return }
  const sessionIds = nextSessions.map(row => row.id)
  const { data: markData, error: markError } = await supabase
   .from('school_attendance_marks')
   .select('id,session_id,student_person_id,attendance_status')
   .eq('school_id', schoolId)
   .in('session_id', sessionIds)
  if (markError) { setError(markError.message); setMarks([]); setStudents([]); setLoading(false); setRefreshing(false); return }
  const nextMarks = (markData || []) as AttendanceMark[]
  setMarks(nextMarks)
  const personIds = [...new Set([...nextMarks.map(row => row.student_person_id), ...nextSessions.map(row => row.teacher_person_id)])]
  if (personIds.length) {
   const { data: peopleData, error: peopleError } = await supabase
    .from('school_people')
    .select('person_id,full_name,details')
    .eq('school_id', schoolId)
    .in('person_id', personIds)
   if (peopleError) setError(peopleError.message)
   setStudents((peopleData || []) as Student[])
  } else setStudents([])
  setSelectedSession(current => current && sessionIds.includes(current) ? current : '')
  setLoading(false); setRefreshing(false)
 }

 useEffect(() => { void load() }, [schoolId, month])

 const standards = useMemo(() => ['All', ...new Set(sessions.map(row => row.standard_name))], [sessions])
 const sections = useMemo(() => ['All', ...new Set(sessions.filter(row => standard === 'All' || row.standard_name === standard).map(row => row.section_name))], [sessions, standard])
 const filteredSessions = useMemo(() => sessions.filter(row => (standard === 'All' || row.standard_name === standard) && (section === 'All' || row.section_name === section)), [sessions, standard, section])
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

 const exportCsv = () => {
  const rows = filteredMarks.map(mark => {
   const session = sessions.find(item => item.id === mark.session_id)
   const student = studentById.get(mark.student_person_id)
   return [session?.attendance_date, session?.session_code, session?.standard_name, session?.section_name, session ? (studentById.get(session.teacher_person_id)?.full_name || session.teacher_person_id) : '', student?.details?.roll_number || '', student?.full_name || mark.student_person_id, mark.attendance_status]
  })
  const content = [['Date', 'Session', 'Standard', 'Section', 'Teacher', 'Roll number', 'Student', 'Status'], ...rows].map(row => row.map(csvCell).join(',')).join('\r\n')
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
   .attendance-report .report-stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin:18px 0}
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
  <div className="workspace-heading"><div><span className="section-eyebrow">ATTENDANCE ANALYTICS</span><h2>Attendance reports</h2><p>{userRole === 'Teacher' ? 'Review attendance for your assigned classes.' : 'Review school-wide attendance sessions and student-level present / absent details.'} Monthly totals update from saved attendance records.</p></div></div>
  <div className="report-toolbar">
   <label>Month<input type="month" value={month} onChange={event => setMonth(event.target.value)}/></label>
   <label>Standard<select value={standard} onChange={event => { setStandard(event.target.value); setSection('All') }}>{standards.map(value => <option key={value}>{value}</option>)}</select></label>
   <label>Section<select value={section} onChange={event => setSection(event.target.value)}>{sections.map(value => <option key={value}>{value}</option>)}</select></label>
   <div className="report-actions"><button type="button" onClick={() => void load()} disabled={refreshing}><RefreshCw size={15}/>{refreshing ? 'Refreshing…' : 'Refresh'}</button><button type="button" onClick={exportCsv} disabled={!filteredMarks.length}><Download size={15}/> Export CSV</button></div>
  </div>
  <div className="report-stats">
   <div className="report-stat"><span><CalendarDays size={15}/> Sessions</span><strong>{filteredSessions.length}</strong><small>Recorded attendance sessions</small></div>
   <div className="report-stat"><span><Users size={15}/> Students marked</span><strong>{filteredMarks.length}</strong><small>Across selected sessions</small></div>
   <div className="report-stat"><span><UserCheck size={15}/> Present</span><strong>{presentCount}</strong><small>Present student marks</small></div>
   <div className="report-stat"><span><Percent size={15}/> Attendance rate</span><strong>{attendanceRate}%</strong><small>{absentCount} absent marks</small></div>
  </div>
  {error && <div className="qr-error">{error}</div>}
  <div className="workspace-heading" style={{marginTop:24}}><div><h3>Session register</h3><p>Select a session to view its student register.</p></div></div>
  {loading ? <div className="report-empty">Loading attendance records…</div> : filteredSessions.length ? <div className="report-table-wrap"><table><thead><tr><th>Date</th><th>Standard</th><th>Section</th><th>Session</th><th>Class teacher</th><th>Students</th><th>Present</th><th>Absent</th><th>Details</th></tr></thead><tbody>{filteredSessions.map(session => {
   const rows = marks.filter(row => row.session_id === session.id)
   const present = rows.filter(row => row.attendance_status.toUpperCase() === 'PRESENT').length
   const absent = rows.filter(row => row.attendance_status.toUpperCase() === 'ABSENT').length
   return <tr key={session.id}><td>{new Date(session.attendance_date + 'T00:00:00').toLocaleDateString('en-IN')}</td><td>{session.standard_name}</td><td>{session.section_name}</td><td>{session.session_code}</td><td>{studentById.get(session.teacher_person_id)?.full_name || session.teacher_person_id}</td><td>{rows.length}</td><td className="status-present">{present}</td><td className="status-absent">{absent}</td><td><button className="report-row-button" onClick={() => setSelectedSession(session.id)}>{selectedSession === session.id ? 'Selected' : 'View register'}</button></td></tr>
  })}</tbody></table></div> : <div className="report-empty">No attendance sessions were recorded for this month and filter selection.</div>}
  {selected && <div className="report-detail"><div className="workspace-heading"><div><h3>Student register</h3><p>{new Date(selected.attendance_date + 'T00:00:00').toLocaleDateString('en-IN')} · {selected.standard_name} · Section {selected.section_name} · {selected.session_code} · Class teacher: {studentById.get(selected.teacher_person_id)?.full_name || selected.teacher_person_id}</p></div></div>
   {detailRows.length ? <div className="report-table-wrap"><table><thead><tr><th>Roll number</th><th>Student name</th><th>Attendance</th></tr></thead><tbody>{detailRows.map(row => <tr key={row.id}><td>{row.roll_number || '—'}</td><td>{row.student_name}</td><td className={row.attendance_status.toUpperCase() === 'PRESENT' ? 'status-present' : 'status-absent'}>{row.attendance_status}</td></tr>)}</tbody></table></div> : <div className="report-empty">No student marks found for this session.</div>}
  </div>}
  <p className="people-form-note" style={{marginTop:16}}>Monthly percentage = present marks ÷ all recorded student marks. This is a session-based percentage, not a unique-student monthly average.</p>
 </section>
}
