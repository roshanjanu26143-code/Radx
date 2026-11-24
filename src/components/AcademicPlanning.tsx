import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { BookOpen, CalendarDays, Plus, RefreshCw, Trash2 } from 'lucide-react'
import { supabase } from '../lib/supabase'

type Standard = { name: string; sections: string[] }
type Teacher = { id: string; name: string }
type Subject = { id: string; academic_year: string; standard_name: string; subject_code: string | null; subject_name: string; subject_type: string; is_active: boolean }
type TimetableRow = { id: string; academic_year: string; standard_name: string; section_name: string; day_of_week: number; period_number: number; start_time: string; end_time: string; subject_id: string; teacher_person_id: string | null; room_label: string | null; subject?: Subject }
type Props = { schoolId: string; academicYear: string; standards: Standard[]; teachers: Teacher[]; page: string; userRole: string; notify: (message: string) => void }
const days = [{id:1,label:'Monday'},{id:2,label:'Tuesday'},{id:3,label:'Wednesday'},{id:4,label:'Thursday'},{id:5,label:'Friday'},{id:6,label:'Saturday'}]
const timeLabel = (value:string) => value?.slice(0,5) || '—'

export default function AcademicPlanning({schoolId,academicYear,standards,teachers,page,userRole,notify}:Props) {
 const [subjects,setSubjects]=useState<Subject[]>([])
 const [timetable,setTimetable]=useState<TimetableRow[]>([])
 const [loading,setLoading]=useState(true)
 const [saving,setSaving]=useState(false)
 const [error,setError]=useState('')
 const [standardName,setStandardName]=useState(standards[0]?.name||'')
 const [sectionName,setSectionName]=useState(standards[0]?.sections[0]||'')
 const [subjectForm,setSubjectForm]=useState({subject_name:'',subject_code:'',subject_type:'Core'})
 const [slot,setSlot]=useState({standard_name:standards[0]?.name||'',section_name:standards[0]?.sections[0]||'',day_of_week:'1',period_number:'1',start_time:'09:00',end_time:'09:45',subject_id:'',teacher_person_id:'',room_label:''})
 const isSubjects=page==='Subjects'
 const isAdmin=userRole==='Admin'
 const sections=useMemo(()=>standards.find(s=>s.name===standardName)?.sections||[],[standards,standardName])
 const slotSections=useMemo(()=>standards.find(s=>s.name===slot.standard_name)?.sections||[],[standards,slot.standard_name])
 const activeSubjects=useMemo(()=>subjects.filter(s=>s.is_active),[subjects])
 const timetableSubjects=useMemo(()=>activeSubjects.filter(s=>s.standard_name===slot.standard_name),[activeSubjects,slot.standard_name])
 const load=async()=>{
  setLoading(true);setError('')
  const [subjectResult,timetableResult]=await Promise.all([
   supabase.from('school_academic_subjects').select('id,academic_year,standard_name,subject_code,subject_name,subject_type,is_active').eq('school_id',schoolId).eq('academic_year',academicYear).order('standard_name').order('subject_name'),
   supabase.from('school_academic_timetable').select('id,academic_year,standard_name,section_name,day_of_week,period_number,start_time,end_time,subject_id,teacher_person_id,room_label').eq('school_id',schoolId).eq('academic_year',academicYear).order('day_of_week').order('period_number')
  ])
  if(subjectResult.error||timetableResult.error){setError(subjectResult.error?.message||timetableResult.error?.message||'Could not load academic data.');setLoading(false);return}
  const rows=(subjectResult.data||[]) as Subject[]
  setSubjects(rows)
  setTimetable((timetableResult.data||[]).map((row:any)=>({...row,subject:rows.find(s=>s.id===row.subject_id)})) as TimetableRow[])
  setLoading(false)
 }
 useEffect(()=>{void load()},[schoolId,academicYear])
 useEffect(()=>{if(!sections.includes(sectionName))setSectionName(sections[0]||'')},[sections,sectionName])
 useEffect(()=>{const list=standards.find(s=>s.name===slot.standard_name)?.sections||[];if(!list.includes(slot.section_name))setSlot(current=>({...current,section_name:list[0]||''}))},[slot.standard_name,slot.section_name,standards])
 useEffect(()=>{if(!timetableSubjects.some(s=>s.id===slot.subject_id))setSlot(current=>({...current,subject_id:timetableSubjects[0]?.id||''}))},[timetableSubjects,slot.subject_id])
 const addSubject=async(e:FormEvent)=>{
  e.preventDefault()
  const name=subjectForm.subject_name.trim()
  if(!name||!standardName){notify('Choose a standard and enter a subject name.');return}
  setSaving(true)
  const user=await supabase.auth.getUser()
  const {error}=await supabase.from('school_academic_subjects').insert({school_id:schoolId,academic_year:academicYear,standard_name:standardName,subject_name:name,subject_code:subjectForm.subject_code.trim()||null,subject_type:subjectForm.subject_type,created_by:user.data.user?.id})
  setSaving(false)
  if(error){notify(error.code==='23505'?'This subject already exists for the selected standard.':'Could not save subject: '+error.message);return}
  setSubjectForm({subject_name:'',subject_code:'',subject_type:'Core'});notify('Subject added to '+standardName+'.');await load()
 }
 const toggleSubject=async(subject:Subject)=>{
  const {error}=await supabase.from('school_academic_subjects').update({is_active:!subject.is_active,updated_at:new Date().toISOString()}).eq('school_id',schoolId).eq('id',subject.id)
  if(error){notify('Could not update subject: '+error.message);return}
  notify(subject.is_active?'Subject archived.':'Subject activated.');await load()
 }
 const addSlot=async(e:FormEvent)=>{
  e.preventDefault()
  if(!slot.standard_name||!slot.section_name||!slot.subject_id||!slot.day_of_week){notify('Choose class, section, subject and day.');return}
  if(slot.end_time<=slot.start_time){notify('Period end time must be after start time.');return}
  const subject=activeSubjects.find(s=>s.id===slot.subject_id)
  if(!subject||subject.standard_name!==slot.standard_name){notify('Selected subject does not belong to this standard.');return}
  if(slot.teacher_person_id){
   const conflict=timetable.find(r=>r.teacher_person_id===slot.teacher_person_id&&r.day_of_week===Number(slot.day_of_week)&&r.start_time<slot.end_time&&r.end_time>slot.start_time)
   if(conflict){notify('Teacher has an overlapping period on '+days.find(d=>d.id===conflict.day_of_week)?.label+'.');return}
  }
  setSaving(true)
  const user=await supabase.auth.getUser()
  const {error}=await supabase.from('school_academic_timetable').insert({school_id:schoolId,academic_year:academicYear,standard_name:slot.standard_name,section_name:slot.section_name,day_of_week:Number(slot.day_of_week),period_number:Number(slot.period_number),start_time:slot.start_time,end_time:slot.end_time,subject_id:slot.subject_id,teacher_person_id:slot.teacher_person_id||null,room_label:slot.room_label.trim()||null,created_by:user.data.user?.id})
  setSaving(false)
  if(error){notify(error.code==='23505'?'That period is already occupied for this class and section.':'Could not save timetable: '+error.message);return}
  notify('Timetable period saved.');await load()
 }
 const removeSlot=async(row:TimetableRow)=>{
  if(!window.confirm('Remove this timetable period?'))return
  const {error}=await supabase.from('school_academic_timetable').delete().eq('school_id',schoolId).eq('id',row.id)
  if(error){notify('Could not remove period: '+error.message);return}
  notify('Timetable period removed.');await load()
 }
 const subjectName=(id:string)=>subjects.find(s=>s.id===id)?.subject_name||'Subject'
 const teacherName=(id:string|null)=>teachers.find(t=>t.id===id)?.name||'Teacher not allotted'
 const selectedClassRows=timetable.filter(r=>r.standard_name===slot.standard_name&&r.section_name===slot.section_name)
 return <div className="academic-planning">
  <section className="workspace-panel">
   <div className="workspace-heading"><div><span className="section-eyebrow">{isSubjects?'SUBJECT CATALOGUE':'WEEKLY CLASS PLAN'}</span><h2>{isSubjects?'Subjects Management':'Timetable & Period Management'}</h2><p>{isSubjects?'Create and maintain subjects for each standard and academic year.':'Build the weekly timetable by class, section, period, subject and teacher.'}</p></div><span className="count-pill">{academicYear}</span></div>
   {error&&<div className="qr-error">{error}</div>}
   {isSubjects?<><div className="academic-filter-row"><label>Standard<select value={standardName} onChange={e=>setStandardName(e.target.value)}>{standards.map(s=><option key={s.name}>{s.name}</option>)}</select></label><span className="count-pill">{activeSubjects.filter(s=>s.standard_name===standardName).length} active subjects</span></div>
    {isAdmin&&<form className="people-form" onSubmit={addSubject}><div className="people-form-grid"><label>Subject name<input value={subjectForm.subject_name} onChange={e=>setSubjectForm(v=>({...v,subject_name:e.target.value}))} placeholder="e.g. Mathematics" required/></label><label>Subject code (optional)<input value={subjectForm.subject_code} onChange={e=>setSubjectForm(v=>({...v,subject_code:e.target.value.toUpperCase()}))} placeholder="MATH-01"/></label><label>Subject category<select value={subjectForm.subject_type} onChange={e=>setSubjectForm(v=>({...v,subject_type:e.target.value}))}><option>Core</option><option>Language</option><option>Elective</option><option>Co-curricular</option></select></label></div><button className="primary-action" disabled={saving||!standardName}>{saving?'Saving…':<><Plus size={15}/> Add subject</>}</button></form>}
    <div className="academic-subject-grid">{subjects.filter(s=>s.standard_name===standardName).map(s=><article className={'academic-subject-card'+(!s.is_active?' is-inactive':'')} key={s.id}><div className="academic-subject-icon"><BookOpen size={18}/></div><div className="academic-subject-copy"><b>{s.subject_name}</b><span>{s.subject_code||'No code'} · {s.subject_type}</span></div><span className="academic-status">{s.is_active?'Active':'Archived'}</span>{isAdmin&&<button className="icon-button" title={s.is_active?'Archive subject':'Activate subject'} onClick={()=>void toggleSubject(s)}><Trash2 size={15}/></button>}</article>)}{!loading&&!subjects.some(s=>s.standard_name===standardName)&&<div className="empty-module"><BookOpen size={24}/><b>No subjects yet</b><span>Add the subjects taught in {standardName}.</span></div>}</div>
   </>:<><div className="academic-filter-row"><label>Standard<select value={slot.standard_name} onChange={e=>setSlot(v=>({...v,standard_name:e.target.value}))}>{standards.map(s=><option key={s.name}>{s.name}</option>)}</select></label><label>Section<select value={slot.section_name} onChange={e=>setSlot(v=>({...v,section_name:e.target.value}))}>{slotSections.map(s=><option key={s}>{s}</option>)}</select></label><span className="count-pill">{selectedClassRows.length} scheduled periods</span></div>
    {isAdmin&&<form className="people-form" onSubmit={addSlot}><div className="people-form-grid"><label>Day<select value={slot.day_of_week} onChange={e=>setSlot(v=>({...v,day_of_week:e.target.value}))}>{days.map(d=><option key={d.id} value={d.id}>{d.label}</option>)}</select></label><label>Period number<input type="number" min="1" max="12" value={slot.period_number} onChange={e=>setSlot(v=>({...v,period_number:e.target.value}))} required/></label><label>Start time<input type="time" value={slot.start_time} onChange={e=>setSlot(v=>({...v,start_time:e.target.value}))} required/></label><label>End time<input type="time" value={slot.end_time} onChange={e=>setSlot(v=>({...v,end_time:e.target.value}))} required/></label><label>Subject<select value={slot.subject_id} onChange={e=>setSlot(v=>({...v,subject_id:e.target.value}))} required><option value="">Choose subject</option>{timetableSubjects.map(s=><option key={s.id} value={s.id}>{s.subject_name}</option>)}</select></label><label>Teacher<select value={slot.teacher_person_id} onChange={e=>setSlot(v=>({...v,teacher_person_id:e.target.value}))}><option value="">Not allotted</option>{teachers.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select></label><label>Room / classroom<input value={slot.room_label} onChange={e=>setSlot(v=>({...v,room_label:e.target.value}))} placeholder="Room 101"/></label></div><button className="primary-action" disabled={saving||!slotSections.length||!timetableSubjects.length}>{saving?'Saving…':<><Plus size={15}/> Add period</>}</button>{!timetableSubjects.length&&<span className="field-hint">Add active subjects for this standard before creating its timetable.</span>}</form>}
    <div className="academic-timetable-list">{days.map(day=>{const rows=timetable.filter(r=>r.day_of_week===day.id&&r.standard_name===slot.standard_name&&r.section_name===slot.section_name).sort((a,b)=>a.period_number-b.period_number);return <section className="academic-day" key={day.id}><div className="academic-day-heading"><b>{day.label}</b><span>{rows.length} periods</span></div>{rows.length?rows.map(row=><article className="academic-period-row" key={row.id}><span className="period-number">{row.period_number}</span><div className="period-time"><b>{timeLabel(row.start_time)} – {timeLabel(row.end_time)}</b><span>Period {row.period_number}</span></div><div className="period-subject"><b>{row.subject?.subject_name||subjectName(row.subject_id)}</b><span>{teacherName(row.teacher_person_id)}{row.room_label?' · '+row.room_label:''}</span></div>{isAdmin&&<button className="icon-button" onClick={()=>void removeSlot(row)} aria-label="Remove timetable period"><Trash2 size={15}/></button>}</article>):<div className="academic-day-empty">No periods scheduled</div>}</section>})}</div>
   </>}
   <div className="academic-footer"><span>{loading?<><RefreshCw size={13}/> Loading academic records…</>:<><CalendarDays size={13}/> Saved to the school database · {subjects.length} subjects · {timetable.length} periods</>}</span></div>
  </section>
 </div>
}
