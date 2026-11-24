import { useEffect,useMemo,useState,type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { CalendarDays,Plus,RefreshCw,ClipboardList,GraduationCap,Search,Save,Trash2 } from 'lucide-react'

type Standard={name:string;sections:string[]}
type Exam={id:string;academic_year:string;exam_name:string;standard_name:string;section_name:string;subject_name:string;exam_date:string;start_time:string|null;end_time:string|null;max_marks:number;pass_marks:number;instructions:string|null;is_published:boolean}
type Student={person_id:string;full_name:string;details:Record<string,any>}
type Mark={id:string;exam_schedule_id:string;student_person_id:string;marks_obtained:number;remarks:string|null}
type Props={schoolId:string;academicYear:string;standards:Standard[];page:string;userRole:string;notify:(message:string)=>void}
const yearNow=()=>{const d=new Date(),y=d.getMonth()>=3?d.getFullYear():d.getFullYear()-1;return y+'-'+String(y+1).slice(-2)}
const dateNow=()=>new Date().toISOString().slice(0,10)
const grade=(pct:number)=>pct>=90?'A1':pct>=80?'A2':pct>=70?'B1':pct>=60?'B2':pct>=50?'C1':pct>=40?'C2':pct>=35?'D':'E'
const pct=(got:number,max:number)=>max?got/max*100:0

export default function ExaminationManagement({schoolId,academicYear,standards,page,userRole,notify}:Props){
 const [exams,setExams]=useState<Exam[]>([])
 const [students,setStudents]=useState<Student[]>([])
 const [marks,setMarks]=useState<Mark[]>([])
 const [loading,setLoading]=useState(true)
 const [saving,setSaving]=useState(false)
 const [error,setError]=useState('')
 const [search,setSearch]=useState('')
 const [selectedExam,setSelectedExam]=useState('')
 const [resultExam,setResultExam]=useState('')
 const [form,setForm]=useState({academic_year:academicYear||yearNow(),exam_name:'Quarterly Examination',standard_name:'',section_name:'',subject_name:'',exam_date:dateNow(),start_time:'',end_time:'',max_marks:'100',pass_marks:'35',instructions:''})
 const [markDraft,setMarkDraft]=useState<Record<string,{marks:string;remarks:string}>>({})
 const [filterStandard,setFilterStandard]=useState('All')

 const load=async()=>{
  setLoading(true);setError('')
  const [examResult,studentResult,markResult]=await Promise.all([
   supabase.from('school_exam_schedules').select('id,academic_year,exam_name,standard_name,section_name,subject_name,exam_date,start_time,end_time,max_marks,pass_marks,instructions,is_published').eq('school_id',schoolId).order('exam_date',{ascending:false}),
   supabase.from('school_people').select('person_id,full_name,details').eq('school_id',schoolId).eq('record_type','Student').order('full_name'),
   supabase.from('school_exam_marks').select('id,exam_schedule_id,student_person_id,marks_obtained,remarks').eq('school_id',schoolId)
  ])
  if(examResult.error||studentResult.error||markResult.error){setError(examResult.error?.message||studentResult.error?.message||markResult.error?.message||'Could not load examination records.');setLoading(false);return}
  const e=(examResult.data||[]) as Exam[],m=(markResult.data||[]) as Mark[]
  setExams(e);setStudents((studentResult.data||[]) as Student[]);setMarks(m)
  if(!selectedExam&&e.length)setSelectedExam(e[0].id)
  if(!resultExam&&e.length)setResultExam(e[0].id)
  setLoading(false)
 }
 useEffect(()=>{void load()},[schoolId])
 const exam=exams.find(x=>x.id===selectedExam)
 const resultSelected=exams.find(x=>x.id===resultExam)
 const examStudents=useMemo(()=>exam?students.filter(s=>s.details.joining_standard===exam.standard_name&&(s.details.section||'')===exam.section_name):[],[exam,students])
 const examMarks=useMemo(()=>marks.filter(m=>m.exam_schedule_id===selectedExam),[marks,selectedExam])
 const markByStudent=useMemo(()=>new Map(examMarks.map(m=>[m.student_person_id,m])),[examMarks])
 const results=useMemo(()=>{
  if(!resultSelected)return []
  const subjectExams=exams.filter(e=>e.academic_year===resultSelected.academic_year&&e.exam_name===resultSelected.exam_name&&e.standard_name===resultSelected.standard_name&&e.section_name===resultSelected.section_name)
  return students.filter(s=>s.details.joining_standard===resultSelected.standard_name&&(s.details.section||'')===resultSelected.section_name).map(student=>{
   const rows=subjectExams.map(e=>({exam:e,mark:marks.find(m=>m.exam_schedule_id===e.id&&m.student_person_id===student.person_id)}))
   const obtained=rows.reduce((n,r)=>n+(r.mark?Number(r.mark.marks_obtained):0),0),maximum=rows.reduce((n,r)=>n+Number(r.exam.max_marks),0)
   const allEntered=rows.length>0&&rows.every(r=>!!r.mark),failed=rows.some(r=>r.mark&&Number(r.mark.marks_obtained)<Number(r.exam.pass_marks))
   return {student,rows,obtained,maximum,percentage:pct(obtained,maximum),allEntered,failed}
  })
 },[resultSelected,exams,students,marks])
 const filteredResults=results.filter(r=>(r.student.full_name+' '+r.student.person_id).toLowerCase().includes(search.toLowerCase()))
 const saveExam=async(e:FormEvent)=>{
  e.preventDefault()
  if(!form.standard_name||!form.section_name||!form.subject_name.trim()){notify('Choose standard, section and subject.');return}
  const max=Number(form.max_marks),pass=Number(form.pass_marks)
  if(max<=0||pass<0||pass>max){notify('Check maximum and passing marks.');return}
  setSaving(true)
  const user=await supabase.auth.getUser()
  const {error}=await supabase.from('school_exam_schedules').insert({school_id:schoolId,academic_year:form.academic_year,exam_name:form.exam_name.trim(),standard_name:form.standard_name,section_name:form.section_name,subject_name:form.subject_name.trim(),exam_date:form.exam_date,start_time:form.start_time||null,end_time:form.end_time||null,max_marks:max,pass_marks:pass,instructions:form.instructions.trim()||null,created_by:user.data.user?.id})
  setSaving(false)
  if(error){notify('Could not save exam schedule: '+error.message);return}
  notify('Exam schedule created.');setForm({...form,subject_name:'',instructions:''});await load()
 }
 const saveMarks=async()=>{
  if(!exam){notify('Select an examination first.');return}
  const user=await supabase.auth.getUser();if(!user.data.user){notify('Session expired. Sign in again.');return}
  const entries=examStudents.map(student=>({student,mark:markDraft[student.person_id]})).filter(x=>x.mark&&x.mark.marks.trim()!=='')
  if(!entries.length){notify('Enter marks for at least one student.');return}
  for(const x of entries){const n=Number(x.mark!.marks);if(!Number.isFinite(n)||n<0||n>Number(exam.max_marks)){notify('Marks must be between 0 and '+exam.max_marks+'.');return}}
  setSaving(true)
  for(const x of entries){
   const existing=markByStudent.get(x.student.person_id)
   const payload={marks_obtained:Number(x.mark!.marks),remarks:x.mark!.remarks.trim()||null,updated_at:new Date().toISOString()}
   const response=existing
    ?await supabase.from('school_exam_marks').update(payload).eq('school_id',schoolId).eq('id',existing.id)
    :await supabase.from('school_exam_marks').insert({school_id:schoolId,exam_schedule_id:exam.id,student_person_id:x.student.person_id,...payload,entered_by:user.data.user.id})
   if(response.error){setSaving(false);notify('Marks saved only partially. '+response.error.message);await load();return}
  }
  setSaving(false);setMarkDraft({});notify('Marks saved successfully.');await load()
 }
 const togglePublish=async(e:Exam)=>{
  const {error}=await supabase.from('school_exam_schedules').update({is_published:!e.is_published,updated_at:new Date().toISOString()}).eq('school_id',schoolId).eq('id',e.id)
  if(error){notify('Could not update publication status: '+error.message);return}notify(e.is_published?'Exam result unpublished.':'Exam schedule published.');await load()
 }
 const deleteExam=async(e:Exam)=>{
  if(!window.confirm('Delete '+e.exam_name+' - '+e.subject_name+' schedule? Existing marks for this schedule will also be deleted.'))return
  const {error}=await supabase.from('school_exam_schedules').delete().eq('school_id',schoolId).eq('id',e.id)
  if(error){notify('Could not delete exam: '+error.message);return}notify('Exam schedule deleted.');await load()
 }
 const exportResults=()=>{
  if(!resultSelected)return
  const rows=[['Admission no.','Student','Standard','Section','Exam','Obtained','Maximum','Percentage','Grade','Status'],...filteredResults.map(r=>[r.student.person_id,r.student.full_name,resultSelected.standard_name,resultSelected.section_name,resultSelected.exam_name,r.obtained,r.maximum,r.allEntered?r.percentage.toFixed(2):'',r.allEntered?grade(r.percentage):'Pending',r.allEntered?(r.failed?'Needs improvement':'Completed'):'Marks pending'])]
  const csv=rows.map(row=>row.map(v=>'"'+String(v??'').replaceAll('"','""')+'"').join(',')).join('\r\n')
  const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8;'})),a=document.createElement('a');a.href=url;a.download='exam-results-'+resultSelected.exam_name.replace(/\W+/g,'-')+'.csv';a.click();URL.revokeObjectURL(url)
 }
 const heading=page==='Exam Schedules'?'Exam schedules':page==='Marks Entry'?'Marks entry':page==='Student Results'?'Student results':'Academic performance'
 return <section className="workspace-panel exam-module">
 <style>{`
 .exam-module .ex-stats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin:18px 0}.exam-module .ex-stat{border:1px solid #e2ebe5;border-radius:14px;padding:16px;background:#fff}.exam-module .ex-stat span{color:#6c7b72;font-size:12px;font-weight:700}.exam-module .ex-stat strong{display:block;color:#183d2b;font-size:24px;margin-top:8px}
 .exam-module .ex-panel{border:1px solid #e3ebe6;border-radius:14px;padding:18px;background:#fff;margin-top:16px}.exam-module .ex-panel h3{margin:0 0 14px;color:#1d3a2b}.exam-module .ex-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}.exam-module label{display:grid;gap:6px;font-size:12px;color:#56685d;font-weight:700}.exam-module input,.exam-module select,.exam-module textarea{border:1px solid #dce7e0;border-radius:9px;padding:10px 11px;min-height:40px;background:#fff;color:#213b2c;min-width:0}.exam-module .wide{grid-column:span 2}.exam-module .ex-btn{border:0;border-radius:9px;background:#19764a;color:white;padding:10px 14px;font-weight:750;display:inline-flex;align-items:center;justify-content:center;gap:7px;cursor:pointer}.exam-module .ex-btn.secondary{background:#fff;color:#28533c;border:1px solid #dce7e0}.exam-module .ex-btn:disabled{opacity:.55;cursor:not-allowed}.exam-module .ex-toolbar{display:flex;gap:10px;align-items:end;flex-wrap:wrap;margin:14px 0}.exam-module .ex-table{overflow:auto;border:1px solid #e5ece7;border-radius:12px}.exam-module table{width:100%;border-collapse:collapse;min-width:650px}.exam-module th,.exam-module td{padding:11px 12px;text-align:left;border-bottom:1px solid #edf1ee;font-size:13px}.exam-module th{background:#f7faf8;color:#66766d;font-size:11px;text-transform:uppercase}.exam-module .ex-table input{max-width:115px;min-height:34px;padding:7px}.exam-module .muted{color:#75847b}.exam-module .empty{padding:24px;text-align:center;color:#718078}.exam-module .ex-actions{display:flex;gap:7px;flex-wrap:wrap}.exam-module .good{color:#16804a;font-weight:800}.exam-module .bad{color:#bd5555;font-weight:800}
 @media(max-width:720px){.exam-module .ex-stats{grid-template-columns:1fr 1fr}.exam-module .ex-grid{grid-template-columns:1fr}.exam-module .wide{grid-column:auto}.exam-module .ex-toolbar>*{flex:1}}
 `}</style>
 <div className="workspace-heading"><div><span className="section-eyebrow">ACADEMIC MANAGEMENT</span><h2>{heading}</h2><p>Schedule examinations, enter subject marks and calculate student results.</p></div><button className="ex-btn secondary" onClick={()=>void load()} disabled={loading}><RefreshCw size={15}/> Refresh</button></div>
 {error&&<div className="qr-error">{error}</div>}
 <div className="ex-stats"><div className="ex-stat"><span><CalendarDays size={14}/> Exam schedules</span><strong>{exams.length}</strong></div><div className="ex-stat"><span><GraduationCap size={14}/> Students visible</span><strong>{students.length}</strong></div><div className="ex-stat"><span><ClipboardList size={14}/> Marks recorded</span><strong>{marks.length}</strong></div></div>
 {(page==='Exam Schedules'||page==='Marks Entry')&&<>
  {userRole==='Admin'&&<div className="ex-panel"><h3><Plus size={17}/> Create exam schedule</h3><form onSubmit={saveExam}><div className="ex-grid">
   <label>Academic year<input value={form.academic_year} onChange={e=>setForm({...form,academic_year:e.target.value})} required/></label>
   <label>Examination name<input value={form.exam_name} onChange={e=>setForm({...form,exam_name:e.target.value})} placeholder="Quarterly Examination" required/></label>
   <label>Exam date<input type="date" value={form.exam_date} onChange={e=>setForm({...form,exam_date:e.target.value})} required/></label>
   <label>Standard<select value={form.standard_name} onChange={e=>{const s=standards.find(x=>x.name===e.target.value);setForm({...form,standard_name:e.target.value,section_name:s?.sections[0]||''})}} required><option value="">Select standard</option>{standards.map(s=><option key={s.name}>{s.name}</option>)}</select></label>
   <label>Section<select value={form.section_name} onChange={e=>setForm({...form,section_name:e.target.value})} required disabled={!form.standard_name}><option value="">Select section</option>{(standards.find(s=>s.name===form.standard_name)?.sections||[]).map(s=><option key={s}>{s}</option>)}</select></label>
   <label>Subject<input value={form.subject_name} onChange={e=>setForm({...form,subject_name:e.target.value})} placeholder="Mathematics" required/></label>
   <label>Maximum marks<input type="number" min="1" step="0.5" value={form.max_marks} onChange={e=>setForm({...form,max_marks:e.target.value})} required/></label>
   <label>Passing marks<input type="number" min="0" step="0.5" value={form.pass_marks} onChange={e=>setForm({...form,pass_marks:e.target.value})} required/></label>
   <label>Start time<input type="time" value={form.start_time} onChange={e=>setForm({...form,start_time:e.target.value})}/></label>
   <label>End time<input type="time" value={form.end_time} onChange={e=>setForm({...form,end_time:e.target.value})}/></label>
   <label className="wide">Instructions<input value={form.instructions} onChange={e=>setForm({...form,instructions:e.target.value})} placeholder="Optional instructions"/></label>
  </div><div style={{marginTop:14}}><button className="ex-btn" disabled={saving||loading}>{saving?'Saving…':'Save exam schedule'}</button></div></form></div>
  <div className="ex-panel"><h3>Exam timetable</h3><div className="ex-table"><table><thead><tr><th>Date</th><th>Exam</th><th>Class / Section</th><th>Subject</th><th>Time</th><th>Marks</th><th>Status</th><th>Actions</th></tr></thead><tbody>{loading?<tr><td colSpan={8} className="empty">Loading…</td></tr>:exams.length?exams.map(e=><tr key={e.id}><td>{e.exam_date}</td><td><b>{e.exam_name}</b><br/><small>{e.academic_year}</small></td><td>{e.standard_name} · {e.section_name}</td><td>{e.subject_name}</td><td>{e.start_time?.slice(0,5)||'—'}{e.end_time?' – '+e.end_time.slice(0,5):''}</td><td>{e.max_marks} / pass {e.pass_marks}</td><td className={e.is_published?'good':'muted'}>{e.is_published?'Published':'Draft'}</td><td><div className="ex-actions"><button className="ex-btn secondary" onClick={()=>{setSelectedExam(e.id);setMarkDraft({})}}>Marks</button>{userRole==='Admin'&&<><button className="ex-btn secondary" onClick={()=>void togglePublish(e)}>{e.is_published?'Unpublish':'Publish'}</button><button className="ex-btn secondary" onClick={()=>void deleteExam(e)} aria-label="Delete exam"><Trash2 size={14}/></button></>}</div></td></tr>):<tr><td colSpan={8} className="empty">No exams scheduled yet.</td></tr>}</tbody></table></div></div>
  <div className="ex-panel"><h3><ClipboardList size={17}/> Marks entry</h3><div className="ex-toolbar"><label>Choose exam<select value={selectedExam} onChange={e=>{setSelectedExam(e.target.value);setMarkDraft({})}}><option value="">Select exam</option>{exams.map(e=><option key={e.id} value={e.id}>{e.exam_name} · {e.standard_name}-{e.section_name} · {e.subject_name}</option>)}</select></label><span className="muted">Maximum: {exam?.max_marks??'—'} marks</span></div><div className="ex-table"><table><thead><tr><th>Admission no.</th><th>Student</th><th>Marks / {exam?.max_marks??'—'}</th><th>Remarks</th><th>Saved</th></tr></thead><tbody>{!exam?<tr><td colSpan={5} className="empty">Select an exam to enter marks.</td></tr>:examStudents.length?examStudents.map(student=>{const saved=markByStudent.get(student.person_id),draft=markDraft[student.person_id];return <tr key={student.person_id}><td>{student.person_id}</td><td>{student.full_name}</td><td><input type="number" min="0" max={exam.max_marks} step="0.5" value={draft?.marks??(saved?String(saved.marks_obtained):'')} onChange={e=>setMarkDraft(cur=>({...cur,[student.person_id]:{marks:e.target.value,remarks:draft?.remarks??saved?.remarks??''}}))}/></td><td><input value={draft?.remarks??saved?.remarks??''} placeholder="Optional" onChange={e=>setMarkDraft(cur=>({...cur,[student.person_id]:{marks:draft?.marks??(saved?String(saved.marks_obtained):''),remarks:e.target.value}}))}/></td><td className={saved?'good':'muted'}>{saved?'Saved':'Not entered'}</td></tr>}):<tr><td colSpan={5} className="empty">No students found in {exam.standard_name} · {exam.section_name}. Check student joining standard and section.</td></tr>}</tbody></table></div><div style={{marginTop:14}}><button className="ex-btn" onClick={()=>void saveMarks()} disabled={saving||!exam||!examStudents.length}><Save size={15}/>{saving?'Saving marks…':'Save marks'}</button></div></div>
 </>}
 {(page==='Student Results'||page==='Performance')&&<div className="ex-panel"><div className="ex-toolbar"><label>Exam / class<select value={resultExam} onChange={e=>setResultExam(e.target.value)}><option value="">Select exam</option>{exams.map(e=><option key={e.id} value={e.id}>{e.exam_name} · {e.standard_name}-{e.section_name} · {e.subject_name}</option>)}</select></label><label>Standard<select value={filterStandard} onChange={e=>setFilterStandard(e.target.value)}><option>All</option>{standards.map(s=><option key={s.name}>{s.name}</option>)}</select></label><div className="ex-search"><Search size={15}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search student"/></div><button className="ex-btn secondary" onClick={exportResults}>Export CSV</button></div>
  {!resultSelected?<div className="empty">No exam selected.</div>:<><div className="muted" style={{marginBottom:12}}>Results are grouped by {resultSelected.exam_name}, {resultSelected.standard_name} · {resultSelected.section_name}. Grades: A1 (90%+), A2 (80%+), B1 (70%+), B2 (60%+), C1 (50%+), C2 (40%+), D (35%+), E (below 35%).</div><div className="ex-table"><table><thead><tr><th>Admission no.</th><th>Student</th><th>Subjects entered</th><th>Marks</th><th>Percentage</th><th>Grade</th><th>Status</th></tr></thead><tbody>{filteredResults.length?filteredResults.map(r=><tr key={r.student.person_id}><td>{r.student.person_id}</td><td>{r.student.full_name}</td><td>{r.rows.filter(x=>x.mark).length}/{r.rows.length}</td><td>{r.obtained}/{r.maximum}</td><td>{r.allEntered?r.percentage.toFixed(1)+'%':'—'}</td><td>{r.allEntered?grade(r.percentage):'—'}</td><td className={r.allEntered?(r.failed?'bad':'good'):'muted'}>{r.allEntered?(r.failed?'Needs improvement':'Complete'):'Marks pending'}</td></tr>):<tr><td colSpan={7} className="empty">No students found for this exam.</td></tr>}</tbody></table></div></>}
 </div>}
 </section>
}
