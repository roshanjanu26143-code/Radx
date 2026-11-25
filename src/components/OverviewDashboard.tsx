import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import {
  Activity, ArrowRight, BookOpen, Bus, CalendarDays, CheckCircle2,
  CircleAlert, ClipboardCheck, CreditCard, GraduationCap, RefreshCw, Users, Wallet
} from 'lucide-react'

type PersonRow = { record_type: string; details: Record<string, unknown> | null }
type AttendanceSession = { id: string; attendance_date: string }
type AttendanceMark = { session_id: string; attendance_status: string }
type FeeStructure = { standard_name: string; amount: number | string; is_active: boolean; academic_year: string }
type Payment = { paid_amount: number | string; paid_on: string; academic_year: string }
type BusRow = { status: string }
type ExamRow = { id: string; exam_date: string; is_published: boolean }
type AuditRow = { action: string; entity_type: string; created_at: string }

const today = () => {
  const d = new Date()
  return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-')
}
const money = (value: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(value)
const count = (value: number) => new Intl.NumberFormat('en-IN').format(value)

function Donut({ parts, center, caption }: { parts: { label: string; value: number; color: string }[]; center: string; caption: string }) {
  const total = parts.reduce((sum, part) => sum + part.value, 0)
  let cursor = 0
  const stops = total > 0 ? parts.map(part => {
    const start = cursor
    cursor += (part.value / total) * 100
    return `${part.color} ${start}% ${cursor}%`
  }).join(', ') : '#edf1ed 0% 100%'
  return <div className="overview-donut-layout">
    <div className="overview-donut" style={{ background: `conic-gradient(${stops})` }}>
      <div className="overview-donut-hole"><strong>{center}</strong><span>{caption}</span></div>
    </div>
    <div className="overview-legend">
      {parts.map(part => <div className="overview-legend-row" key={part.label}><i style={{ background: part.color }}/><span>{part.label}</span><b>{count(part.value)}</b></div>)}
      {total === 0 && <span className="overview-empty-hint">No records yet</span>}
    </div>
  </div>
}

function Metric({ label, value, icon: Icon, tone, helper }: { label: string; value: string; icon: typeof Users; tone: string; helper: string }) {
  return <article className="overview-metric"><span className={'overview-metric-icon ' + tone}><Icon size={18}/></span><span className="overview-metric-label">{label}</span><strong>{value}</strong><small>{helper}</small></article>
}

export default function OverviewDashboard({ schoolId, schoolName, academicYear, onNavigate }: {
  schoolId: string; schoolName: string; academicYear: string; onNavigate: (parent: string, child: string) => void
}) {
  const [people, setPeople] = useState<PersonRow[]>([])
  const [attendanceSessions, setAttendanceSessions] = useState<AttendanceSession[]>([])
  const [attendanceMarks, setAttendanceMarks] = useState<AttendanceMark[]>([])
  const [teacherPresent, setTeacherPresent] = useState(0)
  const [feeStructures, setFeeStructures] = useState<FeeStructure[]>([])
  const [payments, setPayments] = useState<Payment[]>([])
  const [buses, setBuses] = useState<BusRow[]>([])
  const [routeCount, setRouteCount] = useState(0)
  const [allotmentCount, setAllotmentCount] = useState(0)
  const [subjectCount, setSubjectCount] = useState(0)
  const [timetableCount, setTimetableCount] = useState(0)
  const [exams, setExams] = useState<ExamRow[]>([])
  const [sectionCount, setSectionCount] = useState(0)
  const [audit, setAudit] = useState<AuditRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    const day = today()
    const results = await Promise.all([
      supabase.from('school_people').select('record_type,details').eq('school_id', schoolId),
      supabase.from('school_attendance_sessions').select('id,attendance_date').eq('school_id', schoolId).eq('attendance_date', day),
      supabase.from('school_teacher_attendance').select('id').eq('school_id', schoolId).eq('attendance_date', day),
      supabase.from('school_fee_structures').select('standard_name,amount,is_active,academic_year').eq('school_id', schoolId).eq('academic_year', academicYear),
      supabase.from('school_fee_payments').select('paid_amount,paid_on,academic_year').eq('school_id', schoolId).eq('academic_year', academicYear),
      supabase.from('school_transport_buses').select('status').eq('school_id', schoolId),
      supabase.from('school_transport_routes').select('id').eq('school_id', schoolId).eq('is_active', true),
      supabase.from('school_transport_allotments').select('id').eq('school_id', schoolId).eq('status', 'active'),
      supabase.from('school_academic_subjects').select('id').eq('school_id', schoolId).eq('academic_year', academicYear).eq('is_active', true),
      supabase.from('school_academic_timetable').select('id').eq('school_id', schoolId).eq('academic_year', academicYear),
      supabase.from('school_exam_schedules').select('id,exam_date,is_published').eq('school_id', schoolId).eq('academic_year', academicYear),
      supabase.from('school_workspace_state').select('standards').eq('school_id', schoolId).maybeSingle(),
      supabase.from('school_audit_logs').select('action,entity_type,created_at').eq('school_id', schoolId).order('created_at', { ascending: false }).limit(5)
    ])
    const failed = results.find(result => result.error && !['school_audit_logs'].includes(''))
    if (failed?.error) {
      setError(failed.error.message)
      setLoading(false)
      return
    }
    const [peopleRes, sessionsRes, teacherRes, structuresRes, paymentsRes, busesRes, routesRes, allotmentsRes, subjectsRes, timetableRes, examsRes, workspaceRes, auditRes] = results
    const sessions = (sessionsRes.data || []) as AttendanceSession[]
    setPeople((peopleRes.data || []) as PersonRow[])
    setAttendanceSessions(sessions)
    setTeacherPresent(teacherRes.data?.length || 0)
    setFeeStructures((structuresRes.data || []) as FeeStructure[])
    setPayments((paymentsRes.data || []) as Payment[])
    setBuses((busesRes.data || []) as BusRow[])
    setRouteCount(routesRes.data?.length || 0)
    setAllotmentCount(allotmentsRes.data?.length || 0)
    setSubjectCount(subjectsRes.data?.length || 0)
    setTimetableCount(timetableRes.data?.length || 0)
    setExams((examsRes.data || []) as ExamRow[])
    const standards = Array.isArray(workspaceRes.data?.standards) ? workspaceRes.data.standards as { sections?: string[] }[] : []
    setSectionCount(standards.reduce((sum, row) => sum + (Array.isArray(row.sections) ? row.sections.length : 0), 0))
    setAudit((auditRes.data || []) as AuditRow[])
    if (sessions.length) {
      const marksRes = await supabase.from('school_attendance_marks').select('session_id,attendance_status').eq('school_id', schoolId).in('session_id', sessions.map(row => row.id))
      if (marksRes.error) setError(marksRes.error.message)
      setAttendanceMarks((marksRes.data || []) as AttendanceMark[])
    } else setAttendanceMarks([])
    setLoading(false)
  }, [schoolId, academicYear])

  useEffect(() => { void load() }, [load])

  const studentCount = people.filter(row => row.record_type === 'Student').length
  const teacherCount = people.filter(row => row.record_type === 'Teacher').length
  const staffCount = people.filter(row => row.record_type === 'Staff').length
  const driverCount = people.filter(row => row.record_type === 'Driver & Cleaner').length
  const present = attendanceMarks.filter(row => row.attendance_status === 'PRESENT').length
  const absent = attendanceMarks.filter(row => row.attendance_status === 'ABSENT').length
  const attendanceTotal = present + absent
  const attendanceRate = attendanceTotal ? Math.round((present / attendanceTotal) * 100) : 0
  const collected = payments.reduce((sum, row) => sum + Number(row.paid_amount || 0), 0)
  const activeStructures = feeStructures.filter(row => row.is_active)
  const expected = activeStructures.reduce((sum, fee) => {
    const enrolled = people.filter(person => {
      if (person.record_type !== 'Student') return false
      const details = person.details || {}
      const standard = String(details.standard_name || details.standard || details.class_name || details.grade || '')
      return standard === fee.standard_name
    }).length
    return sum + Number(fee.amount || 0) * enrolled
  }, 0)
  const outstanding = Math.max(expected - collected, 0)
  const activeBuses = buses.filter(row => row.status === 'active').length
  const inactiveBuses = buses.length - activeBuses
  const upcomingExams = exams.filter(row => row.exam_date >= today()).length
  const publishedExams = exams.filter(row => row.is_published).length
  const peopleTotal = studentCount + teacherCount + staffCount + driverCount
  const currencyCollected = money(collected)
  const attendanceSubmissions = attendanceSessions.length
  const nextExams = useMemo(() => [...exams].filter(row => row.exam_date >= today()).sort((a, b) => a.exam_date.localeCompare(b.exam_date)).slice(0, 3), [exams])

  return <div className="overview-dashboard">
    <div className="overview-welcome">
      <div><span className="section-eyebrow"><i className="overview-live-dot"/> SCHOOL PERFORMANCE SNAPSHOT</span><h2>Good day, {schoolName}</h2><p>One clear view of your school's academic, attendance, finance and transport operations.</p></div>
      <button className="overview-refresh" onClick={() => void load()} disabled={loading}><RefreshCw size={15} className={loading ? 'overview-spin' : ''}/>{loading ? 'Refreshing' : 'Refresh data'}</button>
    </div>
    {error && <div className="overview-error"><CircleAlert size={16}/><span>Some dashboard data could not be loaded: {error}</span></div>}
    <div className="overview-metrics">
      <Metric label="Total students" value={count(studentCount)} icon={GraduationCap} tone="green" helper="Registered student profiles"/>
      <Metric label="Teachers" value={count(teacherCount)} icon={Users} tone="blue" helper="Registered teaching staff"/>
      <Metric label="Today's attendance" value={attendanceTotal ? attendanceRate + '%' : '—'} icon={ClipboardCheck} tone="violet" helper={attendanceTotal ? count(present) + ' present · ' + count(absent) + ' absent' : 'No attendance submitted yet'}/>
      <Metric label="Fee collection" value={currencyCollected} icon={Wallet} tone="amber" helper="Collected this academic year"/>
    </div>
    <div className="overview-section-title"><div><span className="section-eyebrow">MODULE PERFORMANCE</span><h3>School operations at a glance</h3></div><span className="overview-year-pill"><CalendarDays size={13}/>{academicYear}</span></div>
    <div className="overview-module-grid">
      <section className="overview-module-card">
        <header><span className="overview-module-icon academic"><BookOpen size={17}/></span><div><h3>Academic</h3><p>Learning structure & assessments</p></div><button onClick={() => onNavigate('Academic','Standard')}>Details <ArrowRight size={13}/></button></header>
        <div className="overview-module-kpis"><div><strong>{count(sectionCount)}</strong><span>Sections</span></div><div><strong>{count(subjectCount)}</strong><span>Subjects</span></div><div><strong>{count(timetableCount)}</strong><span>Periods</span></div><div><strong>{count(upcomingExams)}</strong><span>Upcoming exams</span></div></div>
        <Donut center={count(exams.length)} caption="exams" parts={[{label:'Published',value:publishedExams,color:'#26845d'},{label:'Draft',value:Math.max(exams.length-publishedExams,0),color:'#e6b66b'}]}/>
      </section>
      <section className="overview-module-card">
        <header><span className="overview-module-icon attendance"><ClipboardCheck size={17}/></span><div><h3>Attendance</h3><p>Today's student & teacher check-ins</p></div><button onClick={() => onNavigate('Academic','Attendance Reports')}>Details <ArrowRight size={13}/></button></header>
        <div className="overview-module-kpis"><div><strong>{count(present)}</strong><span>Present</span></div><div><strong>{count(absent)}</strong><span>Absent</span></div><div><strong>{count(attendanceSubmissions)}</strong><span>Class sessions</span></div><div><strong>{count(teacherPresent)}</strong><span>Teachers in</span></div></div>
        <Donut center={attendanceTotal ? attendanceRate+'%' : '—'} caption="present" parts={[{label:'Present',value:present,color:'#26845d'},{label:'Absent',value:absent,color:'#e58d79'}]}/>
        {!attendanceTotal && <p className="overview-card-note">No student attendance has been submitted today.</p>}
      </section>
      <section className="overview-module-card">
        <header><span className="overview-module-icon finance"><CreditCard size={17}/></span><div><h3>Finance</h3><p>Fee collection & outstanding estimate</p></div><button onClick={() => onNavigate('Finance','Fees')}>Details <ArrowRight size={13}/></button></header>
        <div className="overview-module-kpis"><div><strong>{currencyCollected}</strong><span>Collected</span></div><div><strong>{money(outstanding)}</strong><span>Outstanding*</span></div><div><strong>{count(activeStructures.length)}</strong><span>Fee heads</span></div><div><strong>{count(payments.length)}</strong><span>Payments</span></div></div>
        <Donut center={expected ? Math.round(Math.min(collected/expected,1)*100)+'%' : '—'} caption="collected" parts={[{label:'Collected',value:Math.min(collected,expected || collected),color:'#26845d'},{label:'Outstanding*',value:outstanding,color:'#e6b66b'}]}/>
        <p className="overview-card-note">*Outstanding is an estimate from active fee structures and matched student standards.</p>
      </section>
      <section className="overview-module-card">
        <header><span className="overview-module-icon transport"><Bus size={17}/></span><div><h3>Transport</h3><p>Fleet, routes & student allotments</p></div><button onClick={() => onNavigate('Transport','Live tracking')}>Details <ArrowRight size={13}/></button></header>
        <div className="overview-module-kpis"><div><strong>{count(buses.length)}</strong><span>Total buses</span></div><div><strong>{count(activeBuses)}</strong><span>Active</span></div><div><strong>{count(routeCount)}</strong><span>Routes</span></div><div><strong>{count(allotmentCount)}</strong><span>Students</span></div></div>
        <Donut center={count(buses.length)} caption="buses" parts={[{label:'Active',value:activeBuses,color:'#26845d'},{label:'Inactive',value:inactiveBuses,color:'#e58d79'}]}/>
        {buses.length===0 && <p className="overview-card-note">No buses registered yet. Live GPS status appears after device setup.</p>}
      </section>
    </div>
    <div className="overview-bottom-grid">
      <section className="overview-recent-card"><header><div><span className="section-eyebrow">LATEST UPDATES</span><h3>Recent school activity</h3></div><Activity size={17}/></header>
        {audit.length ? audit.map((row,index)=><div className="overview-activity-row" key={row.created_at+index}><span className="overview-activity-dot"/><div><strong>{row.action.replace(/_/g,' ')}</strong><span>{row.entity_type.replace(/_/g,' ')}</span></div><time>{new Date(row.created_at).toLocaleString('en-IN',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'})}</time></div>) : <div className="overview-no-activity"><CheckCircle2 size={18}/><span>No recent audit activity available.</span></div>}
      </section>
      <section className="overview-recent-card"><header><div><span className="section-eyebrow">ACADEMIC CALENDAR</span><h3>Upcoming examinations</h3></div><CalendarDays size={17}/></header>
        {nextExams.length ? nextExams.map(exam=><div className="overview-exam-row" key={exam.id}><span className="overview-exam-date">{new Date(exam.exam_date+'T00:00:00').toLocaleDateString('en-IN',{day:'2-digit',month:'short'})}</span><div><strong>Scheduled examination</strong><span>{exam.is_published?'Published':'Draft'} · {exam.exam_date}</span></div><span className={'overview-status '+(exam.is_published?'published':'draft')}>{exam.is_published?'Published':'Draft'}</span></div>) : <div className="overview-no-activity"><CalendarDays size={18}/><span>No upcoming exams scheduled.</span></div>}
      </section>
    </div>
    <div className="overview-footnote"><span><i/> Live data from your school's records</span><span>{count(peopleTotal)} people · {count(staffCount)} staff · {count(driverCount)} drivers / cleaners</span></div>
    {loading && <div className="overview-loading"><RefreshCw size={14} className="overview-spin"/> Syncing school data…</div>}
  </div>
}
