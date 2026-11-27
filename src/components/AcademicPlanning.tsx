import { lazy, Suspense, useEffect, useMemo, useState, type FormEvent } from 'react'
import { BookOpen, CalendarDays, Plus, RefreshCw, Trash2, Pencil, Sparkles } from 'lucide-react'
const AITimetableScheduler = lazy(() => import('./AITimetableScheduler'))
import { supabase } from '../lib/supabase'
import TimeRangePicker from './TimeRangePicker'

type Standard = { name: string; sections: string[]; groups?: string[]; groupSections?: Record<string,string[]> }
type Teacher = { id: string; name: string }
type Subject = { id: string; academic_year: string; standard_name: string; subject_code: string | null; subject_name: string; subject_type: string; is_active: boolean }
type TeacherAssignment = { teacher_person_id:string; standard_name:string; section_name:string; subject_name:string|null; is_active:boolean }
type TimetableRow = { id: string; academic_year: string; standard_name: string; section_name: string; day_of_week: number; period_number: number; start_time: string; end_time: string; subject_id: string; teacher_person_id: string | null; room_label: string | null; room_id:string|null; room_type:string; subject?: Subject }
type PeriodGridRow = {id:string;period_number:number;period_label:string;start_time:string;end_time:string;is_break:boolean;is_active:boolean}
type Props = { schoolId: string; academicYear: string; standards: Standard[]; teachers: Teacher[]; page: string; userRole: string; allowedPages: string[]; notify: (message: string) => void }
const days = [{id:1,label:'Monday'},{id:2,label:'Tuesday'},{id:3,label:'Wednesday'},{id:4,label:'Thursday'},{id:5,label:'Friday'},{id:6,label:'Saturday'}]
const timeLabel = (value:string) => value?.slice(0,5) || '—'

export default function AcademicPlanning({schoolId,academicYear,standards,teachers,page,userRole,allowedPages,notify}:Props) {
 const [subjects,setSubjects]=useState<Subject[]>([])
 const [timetable,setTimetable]=useState<TimetableRow[]>([])
 const [teacherAssignments,setTeacherAssignments]=useState<TeacherAssignment[]>([])
 const [loading,setLoading]=useState(true)
 const [saving,setSaving]=useState(false)
 const [editingSubjectId,setEditingSubjectId]=useState('')
 const [editingSlotId,setEditingSlotId]=useState('')
 const [error,setError]=useState('')
 const [showAiScheduler,setShowAiScheduler]=useState(false)
 const [standardName,setStandardName]=useState(standards[0]?.name||'')
 const [sectionName,setSectionName]=useState(standards[0]?.sections[0]||'')
 const [selectedGroup,setSelectedGroup]=useState('')
 const [subjectForm,setSubjectForm]=useState({subject_name:'',subject_code:'',subject_type:'Core'})
 const [selectedSubjectStandards,setSelectedSubjectStandards]=useState<string[]>([])
 const [slot,setSlot]=useState({standard_name:standards[0]?.name||'',section_name:standards[0]?.sections[0]||'',group_name:'',day_of_week:'1',period_number:'1',start_time:'09:00',end_time:'09:45',subject_id:'',teacher_person_id:'',room_label:'',room_id:'',room_type:'classroom'})
 const [periodGrid,setPeriodGrid]=useState<PeriodGridRow[]>([])
 const [roomList,setRoomList]=useState<{id:string;room_name:string;room_type:string;capacity:number;is_active:boolean}[]>([])
 const isSubjects=page==='Subjects'
 const isAdmin=userRole==='Admin'
 const canManage=isAdmin||(userRole!=='Teacher'&&allowedPages.includes(page))
 const selectedStandard=standards.find(s=>s.name===standardName)
 const selectedIsHigher=standardName==='Standard 11'||standardName==='Standard 12'
 const selectedGroups=selectedIsHigher?(selectedStandard?.groups||[]):[]
 const sections=useMemo(()=>selectedIsHigher?(selectedStandard?.groupSections?.[selectedGroup]||[]):(selectedStandard?.sections||[]),[selectedStandard,selectedIsHigher,selectedGroup])
 const slotStandard=standards.find(s=>s.name===slot.standard_name)
 const slotIsHigher=slot.standard_name==='Standard 11'||slot.standard_name==='Standard 12'
 const slotGroups=slotIsHigher?(slotStandard?.groups||[]):[]
 const slotSections=useMemo(()=>slotIsHigher?(slotStandard?.groupSections?.[slot.group_name]||[]):(slotStandard?.sections||[]),[slotStandard,slotIsHigher,slot.group_name])
 const activeSubjects=useMemo(()=>subjects.filter(s=>s.is_active),[subjects])
 const timetableSubjects=useMemo(()=>activeSubjects.filter(s=>s.standard_name===slot.standard_name),[activeSubjects,slot.standard_name])
 const assignedTeachers=useMemo(()=>teachers.filter(t=>teacherAssignments.some(a=>a.teacher_person_id===t.id&&a.standard_name===slot.standard_name&&a.section_name===slot.section_name&&(!a.subject_name||a.subject_name===activeSubjects.find(s=>s.id===slot.subject_id)?.subject_name))),[teachers,teacherAssignments,slot.standard_name,slot.section_name,slot.subject_id,activeSubjects])
 const load=async()=>{
  setLoading(true);setError('')
  const {data:subjectData,error:subjectError}=await supabase.from('school_academic_subjects')
   .select('id,academic_year,standard_name,subject_code,subject_name,subject_type,is_active')
   .eq('school_id',schoolId).eq('academic_year',academicYear).order('standard_name').order('subject_name')
  if(subjectError){setError(subjectError.message);setLoading(false);return}
  const rows=(subjectData||[]) as Subject[]
  setSubjects(rows)
  if(page==='Timetable'){
   const [timetableResult,assignmentResult,periodGridResult,roomsResult]=await Promise.all([
    supabase.from('school_academic_timetable').select('id,academic_year,standard_name,section_name,day_of_week,period_number,start_time,end_time,subject_id,teacher_person_id,room_label,room_id,room_type').eq('school_id',schoolId).eq('academic_year',academicYear).order('day_of_week').order('period_number'),
    supabase.from('school_teacher_class_assignments').select('teacher_person_id,standard_name,section_name,subject_name,is_active').eq('school_id',schoolId).eq('is_active',true),
    supabase.from('school_timetable_periods').select('id,period_number,period_label,start_time,end_time,is_break,is_active').eq('school_id',schoolId).eq('academic_year',academicYear).order('period_number'),
    supabase.from('school_timetable_rooms').select('id,room_name,room_type,capacity,is_active').eq('school_id',schoolId).order('room_name')
   ])
   if(timetableResult.error||assignmentResult.error||periodGridResult.error||roomsResult.error){setError(timetableResult.error?.message||assignmentResult.error?.message||periodGridResult.error?.message||roomsResult.error?.message||'Could not load timetable data.');setLoading(false);return}
   setTeacherAssignments((assignmentResult.data||[]) as TeacherAssignment[])
   setPeriodGrid((periodGridResult.data||[]) as PeriodGridRow[])
   setRoomList((roomsResult.data||[]) as any[])
   setTimetable((timetableResult.data||[]).map((row:any)=>({...row,subject:rows.find(s=>s.id===row.subject_id)})) as TimetableRow[])
  }else{
   setTeacherAssignments([])
   setPeriodGrid([])
   setRoomList([])
   setTimetable([])
  }
  setLoading(false)
 }
 useEffect(()=>{void load()},[schoolId,academicYear,page])
 useEffect(()=>{if(selectedIsHigher&&!selectedGroups.includes(selectedGroup))setSelectedGroup(selectedGroups[0]||'');if(!selectedIsHigher&&selectedGroup)setSelectedGroup('')},[standardName,selectedGroups.join('|')])
 useEffect(()=>{if(!sections.includes(sectionName))setSectionName(sections[0]||'')},[sections,sectionName])
 useEffect(()=>{const nextGroups=slotIsHigher?slotGroups:[];const group=slotIsHigher?(nextGroups.includes(slot.group_name)?slot.group_name:nextGroups[0]||''):'';const list=slotIsHigher?(slotStandard?.groupSections?.[group]||[]):(slotStandard?.sections||[]);const next=list.includes(slot.section_name)?slot.section_name:list[0]||'';if(group!==slot.group_name||next!==slot.section_name)setSlot(current=>({...current,group_name:group,section_name:next}))},[slot.standard_name,slot.group_name,slot.section_name,standards])
 useEffect(()=>{const next=timetableSubjects[0]?.id||'';if(!timetableSubjects.some(s=>s.id===slot.subject_id)&&slot.subject_id!==next)setSlot(current=>({...current,subject_id:next}))},[timetableSubjects,slot.subject_id])
 useEffect(()=>{if(slot.teacher_person_id&&!assignedTeachers.some(t=>t.id===slot.teacher_person_id))setSlot(current=>({...current,teacher_person_id:''}))},[assignedTeachers,slot.teacher_person_id])
 const addSubject=async(e:FormEvent)=>{
  e.preventDefault()
  const name=subjectForm.subject_name.trim()
  const targetStandards=editingSubjectId?[standardName]:selectedSubjectStandards
  if(!name||!targetStandards.length){notify('Enter a subject name and select at least one standard.');return}
  setSaving(true)
  const user=await supabase.auth.getUser()
  const base={academic_year:academicYear,subject_name:name,subject_code:subjectForm.subject_code.trim()||null,subject_type:subjectForm.subject_type,updated_at:new Date().toISOString()}
  const response=editingSubjectId
   ?await supabase.from('school_academic_subjects').update({...base,standard_name:standardName}).eq('school_id',schoolId).eq('id',editingSubjectId)
   :await supabase.from('school_academic_subjects').upsert(targetStandards.map(standard=>({school_id:schoolId,...base,standard_name:standard,created_by:user.data.user?.id})),{onConflict:'school_id,academic_year,standard_name,subject_name',ignoreDuplicates:true})
  const error=response.error
  setSaving(false)
  if(error){notify('Could not save subject: '+error.message);return}
  setSubjectForm({subject_name:'',subject_code:'',subject_type:'Core'});setEditingSubjectId('');setSelectedSubjectStandards([])
  notify(editingSubjectId?'Subject updated.':'Subject added across '+targetStandards.length+' selected standards.')
  await load()
 }
 const toggleSubject=async(subject:Subject)=>{
  const {error}=await supabase.from('school_academic_subjects').update({is_active:!subject.is_active,updated_at:new Date().toISOString()}).eq('school_id',schoolId).eq('id',subject.id)
  if(error){notify('Could not update subject: '+error.message);return}
  notify(subject.is_active?'Subject archived.':'Subject activated.');await load()
 }
 const addSlot=async(e:FormEvent)=>{
  e.preventDefault()
  if(!slot.standard_name||!slot.section_name||!slot.subject_id||!slot.day_of_week){notify('Choose class, section, subject and day.');return}
  const configuredPeriod=periodGrid.find(p=>p.period_number===Number(slot.period_number))
  if(periodGrid.length&&(!configuredPeriod||!configuredPeriod.is_active||configuredPeriod.is_break)){notify('Choose an active teaching period from the configured weekly time grid.');return}
  const startTime=configuredPeriod?configuredPeriod.start_time.slice(0,5):slot.start_time
  const endTime=configuredPeriod?configuredPeriod.end_time.slice(0,5):slot.end_time
  if(endTime<=startTime){notify('Period end time must be after start time.');return}
  const subject=activeSubjects.find(s=>s.id===slot.subject_id)
  if(!subject||subject.standard_name!==slot.standard_name){notify('Selected subject does not belong to this standard.');return}
  if(slot.teacher_person_id){
   const conflict=timetable.find(r=>r.id!==editingSlotId&&r.teacher_person_id===slot.teacher_person_id&&r.day_of_week===Number(slot.day_of_week)&&r.start_time<endTime&&r.end_time>startTime)
   if(conflict){notify('Teacher has an overlapping period on '+days.find(d=>d.id===conflict.day_of_week)?.label+'.');return}
  }
  setSaving(true)
  const user=await supabase.auth.getUser()
  const payload={academic_year:academicYear,standard_name:slot.standard_name,section_name:slot.section_name,day_of_week:Number(slot.day_of_week),period_number:Number(slot.period_number),start_time:startTime,end_time:endTime,subject_id:slot.subject_id,teacher_person_id:slot.teacher_person_id||null,room_label:(roomList.find(r=>r.id===slot.room_id)?.room_name||slot.room_label.trim())||null,room_id:slot.room_id||null,room_type:roomList.find(r=>r.id===slot.room_id)?.room_type||slot.room_type||'classroom',updated_at:new Date().toISOString()}
  const response=editingSlotId?await supabase.from('school_academic_timetable').update(payload).eq('school_id',schoolId).eq('id',editingSlotId):await supabase.from('school_academic_timetable').insert({school_id:schoolId,...payload,created_by:user.data.user?.id})
  const error=response.error
  setSaving(false)
  if(error){notify(error.code==='23505'?'That period is already occupied for this class and section.':'Could not save timetable: '+error.message);return}
  setEditingSlotId('');notify(editingSlotId?'Timetable period updated.':'Timetable period saved.');await load()
 }
 const editSlot=(row:TimetableRow)=>{setEditingSlotId(row.id);setSlot({standard_name:row.standard_name,section_name:row.section_name,day_of_week:String(row.day_of_week),period_number:String(row.period_number),start_time:row.start_time.slice(0,5),end_time:row.end_time.slice(0,5),subject_id:row.subject_id,teacher_person_id:row.teacher_person_id||'',room_label:row.room_label||'',room_id:row.room_id||'',room_type:row.room_type||'classroom'})}
 const removeSlot=async(row:TimetableRow)=>{
  if(!window.confirm('Remove this timetable period?'))return
  const {error}=await supabase.from('school_academic_timetable').delete().eq('school_id',schoolId).eq('id',row.id)
  if(error){notify('Could not remove period: '+error.message);return}
  if(editingSlotId===row.id)setEditingSlotId('');notify('Timetable period removed.');await load()
 }
 const subjectName=(id:string)=>subjects.find(s=>s.id===id)?.subject_name||'Subject'
 const teacherName=(id:string|null)=>teachers.find(t=>t.id===id)?.name||'Teacher not allotted'
 const selectedClassRows=timetable.filter(r=>r.standard_name===slot.standard_name&&r.section_name===slot.section_name)
 if(page==='Timetable'&&showAiScheduler)return <Suspense fallback={<section className="workspace-panel"><p>Loading AI timetable tools…</p></section>}><AITimetableScheduler schoolId={schoolId} academicYear={academicYear} standards={standards} teachers={teachers} notify={notify} canManage={canManage} onClose={()=>{setShowAiScheduler(false);void load()}}/></Suspense>
 return <div className="academic-planning">
  <section className="workspace-panel">
   <div className="workspace-heading"><div><span className="section-eyebrow">{isSubjects?'SUBJECT CATALOGUE':'WEEKLY CLASS PLAN'}</span><h2>{isSubjects?'Subjects Management':'Timetable & Period Management'}</h2><p>{isSubjects?'Create and maintain subjects for each standard and academic year.':'Build the weekly timetable by class, section, period, subject and teacher.'}</p></div><div className="academic-form-actions"><span className="count-pill">{academicYear}</span>{!isSubjects&&canManage&&<button type="button" className="primary-action" onClick={()=>setShowAiScheduler(true)}><Sparkles size={15}/> AI Timetable Scheduler</button>}</div></div>
   {error&&<div className="qr-error">{error}</div>}
   {isSubjects?<><div className="academic-filter-row"><label>Standard<select value={standardName} onChange={e=>{setStandardName(e.target.value);setSelectedGroup('')}}>{standards.map(s=><option key={s.name}>{s.name}</option>)}</select></label>{selectedIsHigher&&<label>Academic group<select value={selectedGroup} onChange={e=>setSelectedGroup(e.target.value)}><option value=''>Select group</option>{selectedGroups.map(g=><option key={g}>{g}</option>)}</select></label>}<span className="count-pill">{activeSubjects.filter(s=>s.standard_name===standardName).length} active subjects</span></div>
    {canManage&&<form className="people-form" onSubmit={addSubject}><div className="people-form-grid"><label>Subject name<input value={subjectForm.subject_name} onChange={e=>setSubjectForm(v=>({...v,subject_name:e.target.value}))} placeholder="e.g. Mathematics" required/></label><label>Subject code (optional)<input value={subjectForm.subject_code} onChange={e=>setSubjectForm(v=>({...v,subject_code:e.target.value.toUpperCase()}))} placeholder="MATH-01"/></label><label>Subject category<select value={subjectForm.subject_type} onChange={e=>setSubjectForm(v=>({...v,subject_type:e.target.value}))}><option>Core</option><option>Language</option><option>Elective</option><option>Co-curricular</option><option>Practical / Lab</option></select></label></div>{!editingSubjectId&&<div className="subject-standard-picker"><b>Apply this subject to standards</b><div className="subject-standard-options">{standards.map(s=><label key={s.name}><input type="checkbox" checked={selectedSubjectStandards.includes(s.name)} onChange={e=>setSelectedSubjectStandards(current=>e.target.checked?[...current,s.name]:current.filter(x=>x!==s.name))}/>{s.name}</label>)}</div><span className="field-hint">Create the subject once, then make it available to every selected standard.</span></div>}<div className="academic-form-actions"><button className="primary-action" disabled={saving||(!editingSubjectId&&!selectedSubjectStandards.length)}>{saving?'Saving…':<><Plus size={15}/> {editingSubjectId?'Save changes':'Add subject'}</>}</button>{editingSubjectId&&<button type="button" className="secondary-action" onClick={()=>{setEditingSubjectId('');setSelectedSubjectStandards([]);setSubjectForm({subject_name:'',subject_code:'',subject_type:'Core'})}}>Cancel</button>}</div></form>}
    <div className="academic-subject-grid">{subjects.filter(s=>s.standard_name===standardName).map(s=><article className={'academic-subject-card'+(!s.is_active?' is-inactive':'')} key={s.id}><div className="academic-subject-icon"><BookOpen size={18}/></div><div className="academic-subject-copy"><b>{s.subject_name}</b><span>{s.subject_code||'No code'} · {s.subject_type}</span></div><span className="academic-status">{s.is_active?'Active':'Archived'}</span>{canManage&&<><button className="icon-button" title="Edit subject" onClick={()=>{setEditingSubjectId(s.id);setStandardName(s.standard_name);setSelectedSubjectStandards([s.standard_name]);setSubjectForm({subject_name:s.subject_name,subject_code:s.subject_code||'',subject_type:s.subject_type})}}><Pencil size={15}/></button><button className="icon-button" title={s.is_active?'Archive subject':'Activate subject'} onClick={()=>void toggleSubject(s)}><Trash2 size={15}/></button></>}</article>)}{!loading&&!subjects.some(s=>s.standard_name===standardName)&&<div className="empty-module"><BookOpen size={24}/><b>No subjects yet</b><span>Add the subjects taught in {standardName}.</span></div>}</div>
   </>:<><div className="academic-filter-row"><label>Standard<select value={slot.standard_name} onChange={e=>setSlot(v=>({...v,standard_name:e.target.value,group_name:'',section_name:''}))}>{standards.map(s=><option key={s.name}>{s.name}</option>)}</select></label>{slotIsHigher&&<label>Academic group<select value={slot.group_name} onChange={e=>setSlot(v=>({...v,group_name:e.target.value,section_name:''}))}><option value=''>Select group</option>{slotGroups.map(g=><option key={g}>{g}</option>)}</select></label>}<label>Section<select value={slot.section_name} onChange={e=>setSlot(v=>({...v,section_name:e.target.value}))}>{slotSections.map(s=><option key={s}>{s}</option>)}</select></label><span className="count-pill">{selectedClassRows.length} scheduled periods</span></div>
    {canManage&&<form className="people-form" onSubmit={addSlot}><div className="people-form-grid"><label>Day<select value={slot.day_of_week} onChange={e=>setSlot(v=>({...v,day_of_week:e.target.value}))}>{days.map(d=><option key={d.id} value={d.id}>{d.label}</option>)}</select></label>{periodGrid.length?<label>Period<select value={slot.period_number} onChange={e=>{const selected=periodGrid.find(p=>p.period_number===Number(e.target.value));setSlot(v=>({...v,period_number:e.target.value,start_time:selected?.start_time.slice(0,5)||v.start_time,end_time:selected?.end_time.slice(0,5)||v.end_time}))}} required>{periodGrid.map(p=><option key={p.id} value={p.period_number} disabled={!p.is_active||p.is_break}>{p.period_label} · {p.start_time.slice(0,5)}–{p.end_time.slice(0,5)}{p.is_break?' · Break':''}</option>)}</select></label>:<><label>Period number<input type="number" min="1" max="12" value={slot.period_number} onChange={e=>setSlot(v=>({...v,period_number:e.target.value}))} required/></label><div className="time-range-field"><span>Time range</span><TimeRangePicker start={slot.start_time} end={slot.end_time} onSave={(start,end)=>setSlot(v=>({...v,start_time:start,end_time:end}))}/></div></>}<label>Subject<select value={slot.subject_id} onChange={e=>setSlot(v=>({...v,subject_id:e.target.value}))} required><option value="">Choose subject</option>{timetableSubjects.map(s=><option key={s.id} value={s.id}>{s.subject_name}</option>)}</select></label><label>Teacher<select value={slot.teacher_person_id} onChange={e=>setSlot(v=>({...v,teacher_person_id:e.target.value}))}><option value="">Not allotted</option>{assignedTeachers.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select></label>{roomList.length?<label>Room / lab<select value={slot.room_id} onChange={e=>{const room=roomList.find(r=>r.id===e.target.value);setSlot(v=>({...v,room_id:e.target.value,room_type:room?.room_type||'classroom',room_label:room?.room_name||''}))}} required><option value="">Choose registered room</option>{roomList.filter(r=>r.is_active).map(r=><option key={r.id} value={r.id}>{r.room_name} · {r.capacity} seats · {r.room_type.replace(/_/g,' ')}</option>)}</select></label>:<label>Room / classroom<input value={slot.room_label} onChange={e=>setSlot(v=>({...v,room_label:e.target.value}))} placeholder="Register rooms in AI Scheduler"/></label>}</div><div className="academic-form-actions"><button className="primary-action" disabled={saving||!slotSections.length||!timetableSubjects.length||!assignedTeachers.length}>{saving?'Saving…':<><Plus size={15}/> {editingSlotId?'Update period':'Add period'}</>}</button>{editingSlotId&&<button type="button" className="secondary-action" onClick={()=>{setEditingSlotId('');setSlot(v=>({...v,teacher_person_id:'',room_label:'',room_id:'',room_type:'classroom'}))}}>Cancel</button>}</div>{periodGrid.length>0&&<span className="field-hint">Period times are controlled by the AI Scheduler weekly time grid.</span>}{!timetableSubjects.length&&<span className="field-hint">Add active subjects for this standard before creating its timetable.</span>}{timetableSubjects.length>0&&!assignedTeachers.length&&<span className="field-hint">No teacher is allotted to this class and subject yet. Use Academic → Teacher Allotment first.</span>}</form>}
    <div className="academic-timetable-list">{days.map(day=>{const rows=timetable.filter(r=>r.day_of_week===day.id&&r.standard_name===slot.standard_name&&r.section_name===slot.section_name).sort((a,b)=>a.period_number-b.period_number);return <section className="academic-day" key={day.id}><div className="academic-day-heading"><b>{day.label}</b><span>{rows.length} periods</span></div>{rows.length?rows.map(row=><article className="academic-period-row" key={row.id}><span className="period-number">{row.period_number}</span><div className="period-time"><b>{timeLabel(row.start_time)} – {timeLabel(row.end_time)}</b><span>Period {row.period_number}</span></div><div className="period-subject"><b>{row.subject?.subject_name||subjectName(row.subject_id)}</b><span>{teacherName(row.teacher_person_id)}{row.room_label?' · '+row.room_label:''}</span></div>{canManage&&<div className="academic-row-actions"><button className="icon-button" onClick={()=>editSlot(row)} aria-label="Edit timetable period"><Pencil size={15}/></button><button className="icon-button" onClick={()=>void removeSlot(row)} aria-label="Remove timetable period"><Trash2 size={15}/></button></div>}</article>):<div className="academic-day-empty">No periods scheduled</div>}</section>})}</div>
   </>}
   <div className="academic-footer"><span>{loading?<><RefreshCw size={13}/> Loading academic records…</>:<><CalendarDays size={13}/> Saved to the school database · {subjects.length} subjects · {timetable.length} periods</>}</span></div>
  </section>
 </div>
}
