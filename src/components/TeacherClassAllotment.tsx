import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Users, UserCheck } from 'lucide-react'
import { supabase } from '../lib/supabase'

type Teacher={id:string;name:string;range?:string}
type Standard={name:string;sections:string[];groups?:string[];groupSections?:Record<string,string[]>}
type Assignment={id:string;teacher_person_id:string;standard_name:string;section_name:string;subject_name:string|null;is_active:boolean}
type SubjectOption={standard_name:string;subject_name:string;group_name:string;is_active:boolean}
const standardNumber=(name:string)=>Number((name.match(/\d+/)||[])[0]||0)
const standardsForRange=(range:string,standards:Standard[])=>{
 if(!range)return standards
 if(range==='KG - UKG')return standards.filter(s=>/kg|lkg|ukg|kindergarten/i.test(s.name))
 const [min,max]=range.split('-').map(v=>Number(v.trim()))
 return standards.filter(s=>{const n=standardNumber(s.name);return n>=min&&n<=max})
}

export default function TeacherClassAllotment({schoolId,teachers,standards}:{schoolId:string;teachers:Teacher[];standards:Standard[]}) {
 const [rows,setRows]=useState<Assignment[]>([])
 const [subjects,setSubjects]=useState<SubjectOption[]>([])
 const [teacherId,setTeacherId]=useState('')
 const [standardName,setStandardName]=useState('')
 const [sectionName,setSectionName]=useState('')
 const [groupName,setGroupName]=useState('')
 const [subjectName,setSubjectName]=useState('')
 const [loading,setLoading]=useState(true)
 const [saving,setSaving]=useState(false)
 const [error,setError]=useState('')
 const selectedTeacher=teachers.find(t=>t.id===teacherId)
 const eligibleStandards=useMemo(()=>standardsForRange(selectedTeacher?.range||'',standards),[selectedTeacher,standards])
 const selectedStandard=standards.find(s=>s.name===standardName)
 const isHigher=standardName==='Standard 11'||standardName==='Standard 12'
 const groups=isHigher?(selectedStandard?.groups?.length?selectedStandard.groups:standards.find(s=>s.name==='Standard 11')?.groups||[]):[]
 const sections=useMemo(()=>isHigher?(selectedStandard?.groupSections?.[groupName]||[]):(selectedStandard?.sections||[]),[selectedStandard,isHigher,groupName])
 const load=async()=>{
  setLoading(true);setError('')
  const [assignmentResult,subjectResult]=await Promise.all([
   supabase.from('school_teacher_class_assignments').select('id,teacher_person_id,standard_name,section_name,subject_name,is_active').eq('school_id',schoolId).order('created_at',{ascending:false}),
   supabase.from('school_academic_subjects').select('standard_name,subject_name,group_name,is_active').eq('school_id',schoolId).eq('is_active',true).order('subject_name')
  ])
  if(assignmentResult.error||subjectResult.error)setError(assignmentResult.error?.message||subjectResult.error?.message||'Could not load assignments.')
  else{setRows((assignmentResult.data||[]) as Assignment[]);setSubjects((subjectResult.data||[]) as SubjectOption[])}
  setLoading(false)
 }
 useEffect(()=>{void load()},[schoolId])
 useEffect(()=>{if(!eligibleStandards.some(s=>s.name===standardName))setStandardName(eligibleStandards[0]?.name||'')},[eligibleStandards,standardName])
 useEffect(()=>{if(isHigher&&!groups.includes(groupName))setGroupName(groups[0]||'');if(!isHigher&&groupName)setGroupName('')},[standardName,groups.join('|')])
 useEffect(()=>{if(!sections.includes(sectionName))setSectionName(sections[0]||'')},[sections,sectionName])
 const save=async(event:FormEvent<HTMLFormElement>)=>{
  event.preventDefault()
  if(!teacherId||!standardName||!sectionName||(isHigher&&!groupName)){setError('Choose a teacher, eligible standard, group and section.');return}
  if(!eligibleStandards.some(s=>s.name===standardName)){setError('This standard is outside the teacher’s assigned teaching range.');return}
  setSaving(true);setError('')
  const existing=rows.find(r=>r.teacher_person_id===teacherId&&r.standard_name===standardName&&r.section_name===sectionName&&(r.subject_name||'')===subjectName.trim())
  const result=existing
   ?await supabase.from('school_teacher_class_assignments').update({is_active:true,updated_at:new Date().toISOString()}).eq('school_id',schoolId).eq('id',existing.id)
   :await supabase.from('school_teacher_class_assignments').insert({school_id:schoolId,teacher_person_id:teacherId,standard_name:standardName,section_name:sectionName,subject_name:subjectName.trim()||null})
  setSaving(false)
  if(result.error){setError(result.error.message);return}
  setSubjectName('');await load()
 }
 const toggle=async(row:Assignment)=>{
  const {error}=await supabase.from('school_teacher_class_assignments').update({is_active:!row.is_active,updated_at:new Date().toISOString()}).eq('school_id',schoolId).eq('id',row.id)
  if(error)setError(error.message);else await load()
 }
 const teacherName=(id:string)=>teachers.find(t=>t.id===id)?.name||id
 const activeRows=rows.filter(r=>r.is_active)
 return <section className="workspace-panel teacher-allotment" style={{display:'grid',gap:16}}>
  <div className="workspace-heading"><div><span className="section-eyebrow">ACADEMIC WORKLOAD</span><h2>Teacher Allotment</h2><p>Teacher eligibility is limited by the teaching range selected during teacher creation.</p></div><span className="count-pill">{teachers.length} teachers</span></div>
  {error&&<div className="qr-error">{error}</div>}
  <div className="ex-table"><table><thead><tr><th>Teacher</th><th>Teacher ID</th><th>Teaching range</th><th>Assigned classes</th><th>Subjects</th></tr></thead><tbody>
   {teachers.map(t=>{const assigned=activeRows.filter(a=>a.teacher_person_id===t.id);return <tr key={t.id}><td><b>{t.name}</b></td><td>{t.id}</td><td>{t.range||'Not set · legacy teacher'}</td><td>{assigned.length?assigned.map(a=>a.standard_name+'-'+a.section_name).join(', '):'Not allotted'}</td><td>{assigned.length?[...new Set(assigned.map(a=>a.subject_name||'Class teacher'))].join(', '):'—'}</td></tr>})}
   {!teachers.length&&<tr><td colSpan={5} className="empty">Create teacher profiles first. Set the teaching range in Admission → Create Teacher.</td></tr>}
  </tbody></table></div>
  <form className="people-form" onSubmit={save}>
   <div className="workspace-heading"><div><span className="section-eyebrow">NEW ALLOTMENT</span><h3>Assign teacher to standard</h3><p>For Standards 11–12, select an academic group and its section before assigning teachers.</p></div></div>
   <div className="people-form-grid">
    <label>Teacher<select value={teacherId} onChange={e=>{setTeacherId(e.target.value);setStandardName('');setSectionName('')}} required><option value="">Select teacher</option>{teachers.map(t=><option key={t.id} value={t.id}>{t.name} · {t.id}</option>)}</select></label>
    <label>Teaching range<input value={selectedTeacher?.range||'Not set — legacy teacher (all standards available)'} readOnly/></label>
    <label>Standard<select value={standardName} onChange={e=>setStandardName(e.target.value)} required disabled={!eligibleStandards.length}><option value="">Select eligible standard</option>{eligibleStandards.map(s=><option key={s.name} value={s.name}>{s.name}</option>)}</select></label>
    {isHigher&&<label>Academic group<select value={groupName} onChange={e=>{setGroupName(e.target.value);setSectionName('')}} required><option value=''>Select group</option>{groups.map(g=><option key={g}>{g}</option>)}</select></label>}
    <label>Section<select value={sectionName} onChange={e=>setSectionName(e.target.value)} required disabled={!sections.length}><option value="">Select section</option>{sections.map(s=><option key={s} value={s}>{s}</option>)}</select></label>
    <label>Subject (optional)<select value={subjectName} onChange={e=>setSubjectName(e.target.value)}><option value="">All subjects / Class teacher</option>{subjects.filter(s=>s.standard_name===standardName&&(!s.group_name||s.group_name===groupName)).map(s=><option key={s.standard_name+':'+s.subject_name} value={s.subject_name}>{s.subject_name}</option>)}</select></label>
   </div>
   {!eligibleStandards.length&&selectedTeacher&&<p className="field-hint">No standards match this teacher range yet. Add LKG / UKG standards for KG teachers, or check the selected range.</p>}
   <button className="primary-action" type="submit" disabled={saving||!teachers.length||!eligibleStandards.length}>{saving?'Saving allotment…':'+ Assign teacher'}</button>
  </form>
  <div className="role-user-list"><div className="permission-heading"><div><b>Current class allotments</b><span>{loading?'Loading saved allotments…':activeRows.length+' active assignments'}</span></div></div>
   {activeRows.map(row=><article className="role-user-row" key={row.id}><div className="role-user-avatar"><UserCheck size={16}/></div><div className="role-user-summary"><b>{teacherName(row.teacher_person_id)}</b><span>{row.standard_name} · Section {row.section_name}{row.subject_name?' · '+row.subject_name:' · Class teacher'}</span></div><button type="button" className="secondary-action" onClick={()=>void toggle(row)}>Remove</button></article>)}
   {!loading&&!activeRows.length&&<div className="empty-module"><Users size={24}/><b>No teacher allotments yet</b><span>Assign teachers to sections using the form above.</span></div>}
  </div>
 </section>
}
