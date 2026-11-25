import { useEffect,useMemo,useState,type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import AIExamScheduler from './AIExamScheduler'
import { CalendarDays,Plus,RefreshCw,ClipboardList,GraduationCap,Search,Save,Trash2 } from 'lucide-react'

type Standard={name:string;sections:string[]}
type Exam={id:string;academic_year:string;exam_name:string;standard_name:string;section_name:string;subject_name:string;exam_date:string;start_time:string|null;end_time:string|null;duration_minutes:number;max_marks:number;pass_marks:number;instructions:string|null;is_published:boolean;is_ai_locked:boolean}
type Student={person_id:string;full_name:string;details:Record<string,any>}
type Mark={id:string;exam_schedule_id:string;student_person_id:string;marks_obtained:number;remarks:string|null}
type Props={schoolId:string;schoolName:string;academicYear:string;standards:Standard[];page:string;userRole:string;allowedPages:string[];notify:(message:string)=>void}
const yearNow=()=>{const d=new Date(),y=d.getMonth()>=3?d.getFullYear():d.getFullYear()-1;return y+'-'+String(y+1).slice(-2)}
const dateNow=()=>new Date().toISOString().slice(0,10)
const grade=(pct:number)=>pct>=90?'A1':pct>=80?'A2':pct>=70?'B1':pct>=60?'B2':pct>=50?'C1':pct>=40?'C2':pct>=35?'D':'E'
const pct=(got:number,max:number)=>max?got/max*100:0
const parseCsv=(input:string)=>{const lines=input.replace(/^\uFEFF/,'').split(/\r?\n/).filter(line=>line.trim());return lines.map(line=>{const cells:string[]=[];let value='',quoted=false;for(let i=0;i<line.length;i++){const ch=line[i];if(ch==='"'&&quoted&&line[i+1]==='"'){value+='"';i++}else if(ch==='"'){quoted=!quoted}else if(ch===','&&!quoted){cells.push(value.trim());value=''}else value+=ch}cells.push(value.trim());return cells})}

export default function ExaminationManagement({schoolId,schoolName,academicYear,standards,page,userRole,allowedPages,notify}:Props){
 const [exams,setExams]=useState<Exam[]>([])
 const [students,setStudents]=useState<Student[]>([])
 const [marks,setMarks]=useState<Mark[]>([])
 const [subjectCatalog,setSubjectCatalog]=useState<{id:string;academic_year:string;standard_name:string;subject_name:string;is_active:boolean}[]>([])
 const [loading,setLoading]=useState(true)
 const [saving,setSaving]=useState(false)
 const [error,setError]=useState('')
 const [search,setSearch]=useState('')
 const [selectedExam,setSelectedExam]=useState('')
 const [resultExam,setResultExam]=useState('')
 const [reportCardStudentId,setReportCardStudentId]=useState('')
 const [form,setForm]=useState({academic_year:academicYear||yearNow(),exam_name:'Quarterly Examination',standard_name:'',section_name:'',subject_name:'',exam_date:dateNow(),start_time:'',end_time:'',duration_minutes:'180',max_marks:'100',pass_marks:'35',instructions:''})
 const [markDraft,setMarkDraft]=useState<Record<string,{marks:string;remarks:string}>>({})
 const [showAiScheduler,setShowAiScheduler]=useState(false)
 const [uploadExamName,setUploadExamName]=useState('')
 const [uploadStandard,setUploadStandard]=useState('')
 const [uploadSection,setUploadSection]=useState('')
 const [marksFile,setMarksFile]=useState<File|null>(null)
 const canEnterMarks=userRole==='Admin'||allowedPages.includes('Marks Entry')||allowedPages.includes('Performance')
 const canManageSchedules=userRole==='Admin'||(userRole!=='Teacher'&&allowedPages.includes('Exam Schedules'))

 const load=async()=>{
  setLoading(true);setError('')
  const [examResult,studentResult,markResult,subjectResult]=await Promise.all([
   supabase.from('school_exam_schedules').select('id,academic_year,exam_name,standard_name,section_name,subject_name,exam_date,start_time,end_time,duration_minutes,max_marks,pass_marks,instructions,is_published,is_ai_locked').eq('school_id',schoolId).order('exam_date',{ascending:false}),
   supabase.from('school_people').select('person_id,full_name,details').eq('school_id',schoolId).eq('record_type','Student').order('full_name'),
   supabase.from('school_exam_marks').select('id,exam_schedule_id,student_person_id,marks_obtained,remarks').eq('school_id',schoolId),
   supabase.from('school_academic_subjects').select('id,academic_year,standard_name,subject_name,is_active').eq('school_id',schoolId).eq('is_active',true).order('subject_name')
  ])
  if(examResult.error||studentResult.error||markResult.error||subjectResult.error){setError(examResult.error?.message||studentResult.error?.message||markResult.error?.message||subjectResult.error?.message||'Could not load examination records.');setLoading(false);return}
  const e=(examResult.data||[]) as Exam[],m=(markResult.data||[]) as Mark[]
  setExams(e);setStudents((studentResult.data||[]) as Student[]);setMarks(m);setSubjectCatalog((subjectResult.data||[]) as {id:string;academic_year:string;standard_name:string;subject_name:string;is_active:boolean}[])
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
  const classResults=students.filter(s=>s.details.joining_standard===resultSelected.standard_name&&(s.details.section||'')===resultSelected.section_name).map(student=>{
   const rows=subjectExams.map(e=>({exam:e,mark:marks.find(m=>m.exam_schedule_id===e.id&&m.student_person_id===student.person_id)}))
   const obtained=rows.reduce((n,r)=>n+(r.mark?Number(r.mark.marks_obtained):0),0),maximum=rows.reduce((n,r)=>n+Number(r.exam.max_marks),0)
   const allEntered=rows.length>0&&rows.every(r=>!!r.mark),failed=rows.some(r=>r.mark&&pct(Number(r.mark.marks_obtained),Number(r.exam.max_marks))<=40)
   return {student,rows,obtained,maximum,percentage:pct(obtained,maximum),allEntered,failed,rank:0}
  })
  const ranked=[...classResults].filter(r=>r.allEntered).sort((a,b)=>b.obtained-a.obtained)
  let previousTotal:number|null=null,currentRank=0
  ranked.forEach((row,index)=>{if(previousTotal===null||row.obtained!==previousTotal)currentRank=index+1;row.rank=currentRank;previousTotal=row.obtained})
  return classResults
 },[resultSelected,exams,students,marks])
 const filteredResults=results.filter(r=>(r.student.full_name+' '+r.student.person_id).toLowerCase().includes(search.toLowerCase()))
 const uploadSchedules=exams.filter(e=>e.exam_name===uploadExamName&&e.standard_name===uploadStandard&&e.section_name===uploadSection).sort((a,b)=>a.subject_name.localeCompare(b.subject_name))
 const uploadClassStudents=students.filter(s=>s.details.joining_standard===uploadStandard&&(s.details.section||'')===uploadSection).sort((a,b)=>a.full_name.localeCompare(b.full_name))
 const reportCard=filteredResults.find(r=>r.student.person_id===reportCardStudentId)
 const saveExam=async(e:FormEvent)=>{
  e.preventDefault()
  if(!form.standard_name||!form.section_name||!form.subject_name.trim()){notify('Choose standard, section and subject.');return}
  const max=Number(form.max_marks),pass=Number(form.pass_marks)
  if(max<=0||pass<0||pass>max){notify('Check maximum and passing marks.');return}
  setSaving(true)
  const user=await supabase.auth.getUser()
  const {error}=await supabase.from('school_exam_schedules').insert({school_id:schoolId,academic_year:form.academic_year,exam_name:form.exam_name.trim(),standard_name:form.standard_name,section_name:form.section_name,subject_name:form.subject_name.trim(),exam_date:form.exam_date,start_time:form.start_time||null,end_time:form.end_time||null,duration_minutes:Number(form.duration_minutes),max_marks:max,pass_marks:pass,instructions:form.instructions.trim()||null,created_by:user.data.user?.id})
  setSaving(false)
  if(error){notify('Could not save exam schedule: '+error.message);return}
  notify('Exam schedule created.');setForm({...form,subject_name:'',instructions:''});await load()
 }
 const saveMarks=async()=>{
  if(!exam){notify('Select an examination first.');return}
  if(exam.is_published){notify('This exam is published. Unpublish it before changing marks.');return}
  const entries=examStudents.map(student=>({student,mark:markDraft[student.person_id]})).filter(x=>x.mark&&x.mark.marks.trim()!=='')
  if(!entries.length){notify('Enter marks for at least one student.');return}
  for(const x of entries){const n=Number(x.mark!.marks);if(!Number.isFinite(n)||n<0||n>Number(exam.max_marks)){notify('Marks must be between 0 and '+exam.max_marks+'.');return}}
  const payload=entries.map(x=>({student_person_id:x.student.person_id,marks_obtained:Number(x.mark!.marks),remarks:x.mark!.remarks.trim()||null}))
  setSaving(true)
  const {error}=await supabase.rpc('save_school_exam_marks',{p_school_id:schoolId,p_exam_schedule_id:exam.id,p_marks:payload})
  setSaving(false)
  if(error){notify('Marks were not saved: '+error.message);return}
  setMarkDraft({});notify('All entered marks were saved in one transaction.');await load()
 }
 const togglePublish=async(e:Exam)=>{
  if(!e.is_published){
   const expected=students.filter(s=>s.details.joining_standard===e.standard_name&&(s.details.section||'')===e.section_name).length
   const entered=marks.filter(m=>m.exam_schedule_id===e.id).length
   if(!expected||entered<expected){notify('Enter marks for every student in this class before publishing this subject result.');return}
  }
  const {error}=await supabase.from('school_exam_schedules').update({is_published:!e.is_published,updated_at:new Date().toISOString()}).eq('school_id',schoolId).eq('id',e.id)
  if(error){notify('Could not update publication status: '+error.message);return}notify(e.is_published?'Exam result unpublished.':'Exam schedule published and marks locked.');await load()
 }
 const deleteExam=async(e:Exam)=>{
  if(!window.confirm('Delete '+e.exam_name+' - '+e.subject_name+' schedule? Existing marks for this schedule will also be deleted.'))return
  const {error}=await supabase.from('school_exam_schedules').delete().eq('school_id',schoolId).eq('id',e.id)
  if(error){notify('Could not delete exam: '+error.message);return}notify('Exam schedule deleted.');await load()
 }
 const toggleAiLock=async(e:Exam)=>{
  if(e.is_published){notify('Published exam results cannot be unlocked or rescheduled.');return}
  if(!e.is_ai_locked&&(!e.start_time||!e.end_time)){notify('Set the manual exam start and end time before locking this exam.');return}
  const {error}=await supabase.from('school_exam_schedules').update({is_ai_locked:!e.is_ai_locked,updated_at:new Date().toISOString()}).eq('school_id',schoolId).eq('id',e.id)
  if(error){notify('Could not update AI lock: '+error.message);return}
  notify(e.is_ai_locked?'Manual schedule unlocked for AI optimization.':'Manual date and time locked; AI will preserve this exam slot.')
  await load()
 }
 const csvCell=(value:unknown)=>'"'+String(value??'').replace(/"/g,'""')+'"'
 const downloadMarksTemplate=()=>{
  if(!uploadSchedules.length||!uploadClassStudents.length){notify('Select a scheduled exam, standard and section with enrolled students.');return}
  const headers=['Admission Number','Student Name']
  uploadSchedules.forEach(e=>headers.push(e.subject_name+' Marks',e.subject_name+' Grade (P/F)'))
  headers.push('Total Marks','Out Of','Rank','Status')
  const firstStudentRow=6,lastStudentRow=firstStudentRow+uploadClassStudents.length-1
  const markColumnIndexes:number[]=[]
  const gradeColumnIndexes:number[]=[]
  let nextColumn=2
  uploadSchedules.forEach(()=>{markColumnIndexes.push(nextColumn);gradeColumnIndexes.push(nextColumn+1);nextColumn+=2})
  const excelColumn=(index:number)=>{let n=index+1,out='';while(n){const rem=(n-1)%26;out=String.fromCharCode(65+rem)+out;n=Math.floor((n-1)/26)}return out}
  const totalColumn=nextColumn,outOfColumn=nextColumn+1,rankColumn=nextColumn+2,statusColumn=nextColumn+3
  const rows=[
   ['Current Academic Year',uploadSchedules[0].academic_year],
   ['Examination',uploadExamName],
   ['Standard',uploadStandard],
   ['Section',uploadSection],
   headers,
   ...uploadClassStudents.map((student,index)=>{
    const rowNumber=firstStudentRow+index
    const subjectCells=uploadSchedules.flatMap(()=>['',''])
    const totalFormula=`=SUM(${markColumnIndexes.map(column=>excelColumn(column)+rowNumber).join(',')})`
    const maxTotal=uploadSchedules.reduce((n,e)=>n+Number(e.max_marks),0)
    const rankFormula=''
    const statusFormula=''
    return [student.person_id,student.full_name,...subjectCells,totalFormula,maxTotal,rankFormula,statusFormula]
   })
  ]
  const csv=rows.map(row=>row.map(csvCell).join(',')).join('\\r\\n')
  const url=URL.createObjectURL(new Blob(['\\uFEFF',csv],{type:'text/csv;charset=utf-8;'})),a=document.createElement('a')
  a.href=url;a.download='marks-template-'+uploadExamName.replace(/\\W+/g,'-')+'-'+uploadStandard.replace(/\\W+/g,'-')+'-'+uploadSection+'.csv';a.click();URL.revokeObjectURL(url)
 }
 const uploadMarksFile=async()=>{
  if(!marksFile||!uploadSchedules.length){notify('Choose a CSV file and a scheduled exam class.');return}
  if(uploadSchedules.some(e=>e.is_published)){notify('One or more subject results are already published. Unpublish them before importing marks.');return}
  setSaving(true)
  try{
   const csvRows=parseCsv(await marksFile.text())
   if(csvRows.length<6)throw new Error('The template is incomplete. Download a fresh marks template.')
   const metadata=(label:string)=>csvRows.find(row=>(row[0]||'').trim().toLowerCase()===label.toLowerCase())?.[1]?.trim()||''
   const expectedYear=uploadSchedules[0].academic_year
   if(metadata('Current Academic Year')!==expectedYear)throw new Error('Academic year mismatch. Expected '+expectedYear+'.')
   if(metadata('Examination')!==uploadExamName)throw new Error('Examination name does not match the selected exam.')
   if(metadata('Standard')!==uploadStandard)throw new Error('Standard does not match the selected standard.')
   if(metadata('Section')!==uploadSection)throw new Error('Section does not match the selected section. Use the exact section/group name from RADX.')
   const headerIndex=csvRows.findIndex(row=>(row[0]||'').trim().toLowerCase()==='admission number'&&(row[1]||'').trim().toLowerCase()==='student name')
   if(headerIndex<0)throw new Error('Required template columns are missing. Download a fresh template.')
   const header=csvRows[headerIndex].map(value=>value.trim().toLowerCase())
   const studentIndex=header.indexOf('student name')
   const grouped=new Map<string,{student_person_id:string;marks_obtained:number;remarks:string|null}[]>()
   const subjectColumns=new Map<string,{marks:number;grade:number;max:number}>()
   for(const examRow of uploadSchedules){
    const marksIndex=header.indexOf((examRow.subject_name+' marks').toLowerCase())
    const gradeIndex=header.indexOf((examRow.subject_name+' grade (p/f)').toLowerCase())
    if(marksIndex<0||gradeIndex<0)throw new Error('Missing marks / Grade (P/F) columns for '+examRow.subject_name+'. Download a fresh template.')
    subjectColumns.set(examRow.id,{marks:marksIndex,grade:gradeIndex,max:Number(examRow.max_marks)})
    grouped.set(examRow.id,[])
   }
   const seen=new Set<string>()
   for(let rowIndex=headerIndex+1;rowIndex<csvRows.length;rowIndex++){
    const row=csvRows[rowIndex],admission=row[0]?.trim()
    if(!admission)continue
    const student=uploadClassStudents.find(s=>s.person_id.toLowerCase()===admission.toLowerCase())
    if(!student)throw new Error('Admission number '+admission+' is not part of '+uploadStandard+' · '+uploadSection+'.')
    if((row[studentIndex]||'').trim().toLowerCase()!==student.full_name.trim().toLowerCase())throw new Error('Student name does not match admission number '+admission+'. Do not edit the student identity columns.')
    if(seen.has(student.person_id))throw new Error('Duplicate student row: '+admission+'. Each student must appear once.')
    seen.add(student.person_id)
    for(const examRow of uploadSchedules){
     const cols=subjectColumns.get(examRow.id)!,raw=row[cols.marks]?.trim()
     if(!raw)continue
     const value=Number(raw)
     if(!Number.isFinite(value)||value<0||value>cols.max)throw new Error('Invalid marks for '+student.full_name+' · '+examRow.subject_name+'. Maximum is '+cols.max+'.')
     const passed=value/cols.max*100>40
     const enteredGrade=row[cols.grade]?.trim().toUpperCase()
     if(enteredGrade&&enteredGrade!==(passed?'P':'F'))throw new Error('Grade mismatch for '+student.full_name+' · '+examRow.subject_name+'. Marks above 40% = P; 40% or below = F.')
     grouped.get(examRow.id)!.push({student_person_id:student.person_id,marks_obtained:value,remarks:passed?'P':'F'})
    }
   }
   let total=0
   for(const [examId,entries] of grouped){if(!entries.length)continue;const {error}=await supabase.rpc('save_school_exam_marks',{p_school_id:schoolId,p_exam_schedule_id:examId,p_marks:entries});if(error)throw error;total+=entries.length}
   if(!total)throw new Error('No subject marks were filled in the CSV file.')
   setMarksFile(null)
   notify(total+' subject marks synced to student records. Grades: >40% P, 40% or below F. Class totals and ranks are calculated from the uploaded subject marks.')
   await load()
  }catch(error){notify(error instanceof Error?error.message:'Marks upload failed.')}
  finally{setSaving(false)}
 }
 const exportResults=()=>{
  if(!resultSelected)return
  const rows=[['Admission no.','Student','Standard','Section','Exam','Obtained','Maximum','Percentage','Grade','Status'],...filteredResults.map(r=>[r.student.person_id,r.student.full_name,resultSelected.standard_name,resultSelected.section_name,resultSelected.exam_name,r.obtained,r.maximum,r.allEntered?r.percentage.toFixed(2):'',r.allEntered?grade(r.percentage):'Pending',r.allEntered?(r.failed?'Needs improvement':'Completed'):'Marks pending'])]
  const csv=rows.map(row=>row.map(v=>'"'+String(v??'').replace(/"/g,'""')+'"').join(',')).join('\r\n')
  const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8;'})),a=document.createElement('a');a.href=url;a.download='exam-results-'+resultSelected.exam_name.replace(/\W+/g,'-')+'.csv';a.click();URL.revokeObjectURL(url)
 }
 const heading=page==='Exam Schedules'?'Exam schedule':page==='Marks Entry'?'Marks entry':page==='Student Results'?'Student results':'Students performance'
 return <section className="workspace-panel exam-module">
 <style>{`
 .exam-module .ex-stats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin:18px 0}.exam-module .ex-stat{border:1px solid #e2ebe5;border-radius:14px;padding:16px;background:#fff}.exam-module .ex-stat span{color:#6c7b72;font-size:12px;font-weight:700}.exam-module .ex-stat strong{display:block;color:#183d2b;font-size:24px;margin-top:8px}
 .exam-module .ex-panel{border:1px solid #e3ebe6;border-radius:14px;padding:18px;background:#fff;margin-top:16px}.exam-module .ex-panel h3{margin:0 0 14px;color:#1d3a2b}.exam-module .ex-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}.exam-module label{display:grid;gap:6px;font-size:12px;color:#56685d;font-weight:700}.exam-module input,.exam-module select,.exam-module textarea{border:1px solid #dce7e0;border-radius:9px;padding:10px 11px;min-height:40px;background:#fff;color:#213b2c;min-width:0}.exam-module .wide{grid-column:span 2}.exam-module .ex-btn{border:0;border-radius:9px;background:#19764a;color:white;padding:10px 14px;font-weight:750;display:inline-flex;align-items:center;justify-content:center;gap:7px;cursor:pointer}.exam-module .ex-btn.secondary{background:#fff;color:#28533c;border:1px solid #dce7e0}.exam-module .ex-btn:disabled{opacity:.55;cursor:not-allowed}.exam-module .ex-toolbar{display:flex;gap:10px;align-items:end;flex-wrap:wrap;margin:14px 0}.exam-module .ex-table{overflow:auto;border:1px solid #e5ece7;border-radius:12px}.exam-module table{width:100%;border-collapse:collapse;min-width:650px}.exam-module th,.exam-module td{padding:11px 12px;text-align:left;border-bottom:1px solid #edf1ee;font-size:13px}.exam-module th{background:#f7faf8;color:#66766d;font-size:11px;text-transform:uppercase}.exam-module .ex-table input{max-width:115px;min-height:34px;padding:7px}.exam-module .muted{color:#75847b}.exam-module .empty{padding:24px;text-align:center;color:#718078}.exam-module .ex-actions{display:flex;gap:7px;flex-wrap:wrap}.exam-module .good{color:#16804a;font-weight:800}.exam-module .bad{color:#bd5555;font-weight:800}
 @media print{body *{visibility:hidden!important}.exam-module .exam-report-card,.exam-module .exam-report-card *{visibility:visible!important}.exam-module .exam-report-card{position:absolute;left:0;top:0;width:100%;border:0}.exam-module .exam-report-card .no-print{display:none!important}}
 @media(max-width:720px){.exam-module .ex-stats{grid-template-columns:1fr 1fr}.exam-module .ex-grid{grid-template-columns:1fr}.exam-module .wide{grid-column:auto}.exam-module .ex-toolbar>*{flex:1}}
 `}</style>
 <div className="workspace-heading"><div><span className="section-eyebrow">ACADEMIC MANAGEMENT</span><h2>{heading}</h2><p>Schedule examinations, enter subject marks and calculate student results.</p></div><div className="ex-actions">{page==='Exam Schedules'&&canManageSchedules&&<><button className={'ex-btn '+(!showAiScheduler?'':'secondary')} type="button" onClick={()=>setShowAiScheduler(false)}>Manual entry</button><button className={'ex-btn '+(showAiScheduler?'':'secondary')} type="button" onClick={()=>setShowAiScheduler(true)}><CalendarDays size={15}/> AI scheduler</button></>}<button className="ex-btn secondary" onClick={()=>void load()} disabled={loading}><RefreshCw size={15}/> Refresh</button></div></div>
 {error&&<div className="qr-error">{error}</div>}
 {page==='Exam Schedules'&&canManageSchedules&&showAiScheduler&&<AIExamScheduler schoolId={schoolId} academicYear={academicYear} notify={notify}/>}
 <div className="ex-stats"><div className="ex-stat"><span><CalendarDays size={14}/> Exam schedules</span><strong>{exams.length}</strong></div><div className="ex-stat"><span><GraduationCap size={14}/> Students visible</span><strong>{students.length}</strong></div><div className="ex-stat"><span><ClipboardList size={14}/> Marks recorded</span><strong>{marks.length}</strong></div></div>
 {(page==='Exam Schedules'||page==='Marks Entry')&&<>
  {canManageSchedules&&!showAiScheduler&&<div className="ex-panel"><h3><Plus size={17}/> Manual exam schedule entry</h3><form onSubmit={saveExam}><div className="ex-grid">
   <label>Academic year<input value={form.academic_year} onChange={e=>setForm({...form,academic_year:e.target.value})} required/></label>
   <label>Examination name<input value={form.exam_name} onChange={e=>setForm({...form,exam_name:e.target.value})} placeholder="Quarterly Examination" required/></label>
   <label>Exam date<input type="date" value={form.exam_date} onChange={e=>setForm({...form,exam_date:e.target.value})} required/></label>
   <label>Standard<select value={form.standard_name} onChange={e=>{const s=standards.find(x=>x.name===e.target.value);setForm({...form,standard_name:e.target.value,section_name:s?.sections[0]||''})}} required><option value="">Select standard</option>{standards.map(s=><option key={s.name}>{s.name}</option>)}</select></label>
   <label>Section<select value={form.section_name} onChange={e=>setForm({...form,section_name:e.target.value})} required disabled={!form.standard_name}><option value="">Select section</option>{(standards.find(s=>s.name===form.standard_name)?.sections||[]).map(s=><option key={s}>{s}</option>)}</select></label>
   <label>Subject<select value={form.subject_name} onChange={e=>setForm({...form,subject_name:e.target.value})} required disabled={!form.standard_name}><option value="">Choose subject</option>{subjectCatalog.filter(s=>s.academic_year===form.academic_year&&s.standard_name===form.standard_name).map(s=><option key={s.id} value={s.subject_name}>{s.subject_name}</option>)}</select></label>
   <label>Duration (minutes)<input type="number" min="15" max="600" step="15" value={form.duration_minutes} onChange={e=>setForm({...form,duration_minutes:e.target.value})} required/></label>
   <label>Maximum marks<input type="number" min="1" step="0.5" value={form.max_marks} onChange={e=>setForm({...form,max_marks:e.target.value})} required/></label>
   <label>Passing marks<input type="number" min="0" step="0.5" value={form.pass_marks} onChange={e=>setForm({...form,pass_marks:e.target.value})} required/></label>
   <label>Start time<input type="time" value={form.start_time} onChange={e=>setForm({...form,start_time:e.target.value})}/></label>
   <label>End time<input type="time" value={form.end_time} onChange={e=>setForm({...form,end_time:e.target.value})}/></label>
   <label className="wide">Instructions<input value={form.instructions} onChange={e=>setForm({...form,instructions:e.target.value})} placeholder="Optional instructions"/></label>
  </div><div style={{marginTop:14}}><button className="ex-btn" disabled={saving||loading}>{saving?'Saving…':'Save exam schedule'}</button></div></form></div>}
  <div className="ex-panel"><h3>Exam timetable</h3><div className="ex-table"><table><thead><tr><th>Date</th><th>Exam</th><th>Class / Section</th><th>Subject</th><th>Time</th><th>Marks</th><th>Status</th><th>Actions</th></tr></thead><tbody>{loading?<tr><td colSpan={8} className="empty">Loading…</td></tr>:exams.length?exams.map(e=><tr key={e.id}><td>{e.exam_date}</td><td><b>{e.exam_name}</b><br/><small>{e.academic_year}</small></td><td>{e.standard_name} · {e.section_name}</td><td>{e.subject_name}</td><td>{e.start_time?.slice(0,5)||'—'}{e.end_time?' – '+e.end_time.slice(0,5):''}</td><td>{e.max_marks} / pass {e.pass_marks}</td><td className={e.is_published?'good':'muted'}>{e.is_published?'Published':'Draft'}{e.is_ai_locked?' · AI locked':''}</td><td><div className="ex-actions">{canManageSchedules&&!e.is_published&&<button className="ex-btn secondary" onClick={()=>void toggleAiLock(e)}>{e.is_ai_locked?'Unlock':'Lock slot'}</button>}{canEnterMarks&&<button className="ex-btn secondary" onClick={()=>{setSelectedExam(e.id);setMarkDraft({})}}>Marks</button>}{canManageSchedules&&<button className="ex-btn secondary" onClick={()=>void togglePublish(e)}>{e.is_published?'Unpublish':'Publish'}</button>}{userRole==='Admin'&&<button className="ex-btn secondary" onClick={()=>void deleteExam(e)} aria-label="Delete exam"><Trash2 size={14}/></button>}</div></td></tr>):<tr><td colSpan={8} className="empty">No exams scheduled yet.</td></tr>}</tbody></table></div></div>
  {canEnterMarks&&page==='Marks Entry'&&<div className="ex-panel"><h3><ClipboardList size={17}/> Bulk marks upload</h3><p className="muted">Template includes academic year, examination, exact standard and section/group, student identity, subject marks and P/F grade columns, total, out-of, rank and status. Upload matches admission number + student name and syncs marks to each student's exam record. Pass requires strictly more than 40% in a subject.</p><div className="ex-grid"><label>Exam<select value={uploadExamName} onChange={e=>{setUploadExamName(e.target.value);setUploadStandard('');setUploadSection('')}}><option value="">Select exam</option>{[...new Set(exams.map(e=>e.exam_name))].map(name=><option key={name}>{name}</option>)}</select></label><label>Standard<select value={uploadStandard} onChange={e=>{setUploadStandard(e.target.value);setUploadSection('')}}><option value="">Select standard</option>{[...new Set(exams.filter(e=>e.exam_name===uploadExamName).map(e=>e.standard_name))].map(name=><option key={name}>{name}</option>)}</select></label><label>Section<select value={uploadSection} onChange={e=>setUploadSection(e.target.value)}><option value="">Select section</option>{[...new Set(exams.filter(e=>e.exam_name===uploadExamName&&e.standard_name===uploadStandard).map(e=>e.section_name))].map(name=><option key={name}>{name}</option>)}</select></label><label>Completed marks CSV<input type="file" accept=".csv,text/csv" onChange={e=>setMarksFile(e.target.files?.[0]||null)}/></label></div><div className="ex-actions" style={{marginTop:12}}><button type="button" className="ex-btn secondary" onClick={downloadMarksTemplate} disabled={!uploadSchedules.length||!uploadClassStudents.length}>Download template ({uploadClassStudents.length} students)</button><button type="button" className="ex-btn" onClick={()=>void uploadMarksFile()} disabled={saving||!marksFile}>{saving?'Importing…':'Upload marks CSV'}</button></div></div>}
  {canEnterMarks&&<div className="ex-panel"><h3><ClipboardList size={17}/> Marks entry</h3><div className="ex-toolbar"><label>Choose exam<select value={selectedExam} onChange={e=>{setSelectedExam(e.target.value);setMarkDraft({})}}><option value="">Select exam</option>{exams.map(e=><option key={e.id} value={e.id}>{e.exam_name} · {e.standard_name}-{e.section_name} · {e.subject_name}</option>)}</select></label><span className="muted">Maximum: {exam?.max_marks??'—'} marks</span></div><div className="ex-table"><table><thead><tr><th>Admission no.</th><th>Student</th><th>Marks / {exam?.max_marks??'—'}</th><th>Remarks</th><th>Saved</th></tr></thead><tbody>{!exam?<tr><td colSpan={5} className="empty">Select an exam to enter marks.</td></tr>:examStudents.length?examStudents.map(student=>{const saved=markByStudent.get(student.person_id),draft=markDraft[student.person_id];return <tr key={student.person_id}><td>{student.person_id}</td><td>{student.full_name}</td><td><input type="number" min="0" max={exam.max_marks} step="0.5" value={draft?.marks??(saved?String(saved.marks_obtained):'')} disabled={!!exam.is_published} onChange={e=>setMarkDraft(cur=>({...cur,[student.person_id]:{marks:e.target.value,remarks:draft?.remarks??saved?.remarks??''}}))}/></td><td><input value={draft?.remarks??saved?.remarks??''} placeholder="Optional" disabled={!!exam.is_published} onChange={e=>setMarkDraft(cur=>({...cur,[student.person_id]:{marks:draft?.marks??(saved?String(saved.marks_obtained):''),remarks:e.target.value}}))}/></td><td className={saved?'good':'muted'}>{saved?'Saved':'Not entered'}</td></tr>}):<tr><td colSpan={5} className="empty">No students found in {exam.standard_name} · {exam.section_name}. Check student joining standard and section.</td></tr>}</tbody></table></div><div style={{marginTop:14}}><button className="ex-btn" onClick={()=>void saveMarks()} disabled={saving||!exam||!examStudents.length||!!exam.is_published}><Save size={15}/>{exam?.is_published?'Published · marks locked':saving?'Saving marks…':'Save marks'}</button></div></div>}
 </>}
 {canEnterMarks&&page==='Performance'&&<div className="ex-panel"><h3><ClipboardList size={17}/> Bulk marks upload</h3><p className="muted">Template includes academic year, examination, exact standard and section/group, student identity, subject marks and P/F grade columns, total, out-of, rank and status. Upload matches admission number + student name and syncs marks to each student's exam record. Pass requires strictly more than 40% in a subject.</p><div className="ex-grid"><label>Exam<select value={uploadExamName} onChange={e=>{setUploadExamName(e.target.value);setUploadStandard('');setUploadSection('')}}><option value="">Select exam</option>{[...new Set(exams.map(e=>e.exam_name))].map(name=><option key={name}>{name}</option>)}</select></label><label>Standard<select value={uploadStandard} onChange={e=>{setUploadStandard(e.target.value);setUploadSection('')}}><option value="">Select standard</option>{[...new Set(exams.filter(e=>e.exam_name===uploadExamName).map(e=>e.standard_name))].map(name=><option key={name}>{name}</option>)}</select></label><label>Section<select value={uploadSection} onChange={e=>setUploadSection(e.target.value)}><option value="">Select section</option>{[...new Set(exams.filter(e=>e.exam_name===uploadExamName&&e.standard_name===uploadStandard).map(e=>e.section_name))].map(name=><option key={name}>{name}</option>)}</select></label><label>Completed marks CSV<input type="file" accept=".csv,text/csv" onChange={e=>setMarksFile(e.target.files?.[0]||null)}/></label></div><div className="ex-actions" style={{marginTop:12}}><button type="button" className="ex-btn secondary" onClick={downloadMarksTemplate} disabled={!uploadSchedules.length||!uploadClassStudents.length}>Download template ({uploadClassStudents.length} students)</button><button type="button" className="ex-btn" onClick={()=>void uploadMarksFile()} disabled={saving||!marksFile}>{saving?'Importing…':'Upload marks CSV'}</button></div></div>}
  {(page==='Student Results'||page==='Performance')&&<div className="ex-panel"><div className="ex-toolbar"><label>Exam / class<select value={resultExam} onChange={e=>setResultExam(e.target.value)}><option value="">Select exam</option>{exams.map(e=><option key={e.id} value={e.id}>{e.exam_name} · {e.standard_name}-{e.section_name} · {e.subject_name}</option>)}</select></label><div className="ex-search"><Search size={15}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search student"/></div><button className="ex-btn secondary" onClick={exportResults}>Export CSV</button></div>
  {!resultSelected?<div className="empty">No exam selected.</div>:<><div className="muted" style={{marginBottom:12}}>Results are grouped by {resultSelected.exam_name}, {resultSelected.standard_name} · {resultSelected.section_name}. Grades: A1 (90%+), A2 (80%+), B1 (70%+), B2 (60%+), C1 (50%+), C2 (40%+), D (35%+), E (below 35%).</div><div className="ex-table"><table><thead><tr><th>Admission no.</th><th>Student</th><th>Subjects entered</th><th>Marks</th><th>Percentage</th><th>Grade</th><th>Rank</th><th>Status</th><th>Report card</th></tr></thead><tbody>{filteredResults.length?filteredResults.map(r=><tr key={r.student.person_id}><td>{r.student.person_id}</td><td>{r.student.full_name}</td><td>{r.rows.filter(x=>x.mark).length}/{r.rows.length}</td><td>{r.obtained}/{r.maximum}</td><td>{r.allEntered?r.percentage.toFixed(1)+'%':'—'}</td><td>{r.allEntered?grade(r.percentage):'—'}</td><td>{r.allEntered?r.rank:'—'}</td><td className={r.allEntered?(r.failed?'bad':'good'):'muted'}>{r.allEntered?(r.failed?'Needs improvement':'Complete'):'Marks pending'}</td><td><button className="ex-btn secondary" onClick={()=>setReportCardStudentId(r.student.person_id)}>View</button></td></tr>):<tr><td colSpan={9} className="empty">No students found for this exam.</td></tr>}</tbody></table></div></>}
 </div>}
   {reportCard&&resultSelected&&<div className="exam-report-card"><div className="exam-report-head"><span className="section-eyebrow">STUDENT REPORT CARD</span><h3>{schoolName}</h3><p className="muted">{resultSelected.academic_year} · {resultSelected.exam_name}</p></div><div className="exam-report-meta"><div><span>Student name</span><b>{reportCard.student.full_name}</b></div><div><span>Admission number</span><b>{reportCard.student.person_id}</b></div><div><span>Standard / Section</span><b>{resultSelected.standard_name} · {resultSelected.section_name}</b></div><div><span>Result status</span><b>{reportCard.allEntered?(reportCard.failed?'Needs improvement':'Completed'):'Marks pending'}</b></div></div><div className="ex-table"><table><thead><tr><th>Subject</th><th>Maximum</th><th>Pass marks</th><th>Obtained</th><th>Grade (P/F)</th></tr></thead><tbody>{reportCard.rows.map(row=><tr key={row.exam.id}><td>{row.exam.subject_name}</td><td>{row.exam.max_marks}</td><td>{row.exam.pass_marks}</td><td>{row.mark?row.mark.marks_obtained:'Pending'}</td><td>{row.mark?(pct(Number(row.mark.marks_obtained),Number(row.exam.max_marks))>40?'P':'F'):'—'}</td></tr>)}</tbody></table></div><div className="exam-report-meta"><div><span>Total marks</span><b>{reportCard.obtained} / {reportCard.maximum}</b></div><div><span>Class rank</span><b>{reportCard.allEntered?reportCard.rank:'Pending'}</b></div><div><span>Percentage</span><b>{reportCard.allEntered?reportCard.percentage.toFixed(2)+'%':'Pending'}</b></div><div><span>Overall grade</span><b>{reportCard.allEntered?grade(reportCard.percentage):'—'}</b></div><div><span>Generated</span><b>{dateNow()}</b></div></div><div className="ex-actions no-print"><button className="ex-btn" onClick={()=>window.print()}>Print report card</button><button className="ex-btn secondary" onClick={()=>setReportCardStudentId('')}>Close</button></div></div>}
 </section>
}
