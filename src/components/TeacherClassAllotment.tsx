import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Users } from 'lucide-react'
import { supabase } from '../lib/supabase'

type Teacher={id:string;name:string}
type Standard={name:string;sections:string[]}
type Assignment={id:string;teacher_person_id:string;standard_name:string;section_name:string;subject_name:string|null;is_active:boolean}\ntype SubjectOption={standard_name:string;subject_name:string;is_active:boolean}

export default function TeacherClassAllotment({schoolId,teachers,standards}:{schoolId:string;teachers:Teacher[];standards:Standard[]}) {
 const [rows,setRows]=useState<Assignment[]>([])\n const [subjects,setSubjects]=useState<SubjectOption[]>([])
 const [teacherId,setTeacherId]=useState('')
 const [standardName,setStandardName]=useState(standards[0]?.name||'')
 const [sectionName,setSectionName]=useState('')
 const [subjectName,setSubjectName]=useState('')
 const [loading,setLoading]=useState(true)
 const [saving,setSaving]=useState(false)
 const [error,setError]=useState('')
 const sections=useMemo(()=>standards.find(s=>s.name===standardName)?.sections||[],[standards,standardName])
 const load=async()=>{setLoading(true);const [assignmentResult,subjectResult]=await Promise.all([supabase.from('school_teacher_class_assignments').select('id,teacher_person_id,standard_name,section_name,subject_name,is_active').eq('school_id',schoolId).order('created_at',{ascending:false}),supabase.from('school_academic_subjects').select('standard_name,subject_name,is_active').eq('school_id',schoolId).eq('is_active',true).order('subject_name')]);if(assignmentResult.error||subjectResult.error)setError(assignmentResult.error?.message||subjectResult.error?.message||'Could not load assignments.');else{setRows((assignmentResult.data||[]) as Assignment[]);setSubjects((subjectResult.data||[]) as SubjectOption[]);setError('')}setLoading(false)}
 useEffect(()=>{void load()},[schoolId])
 useEffect(()=>{if(!sections.includes(sectionName))setSectionName(sections[0]||'')},[standardName,sections,sectionName])
 const save=async(event:FormEvent<HTMLFormElement>)=>{event.preventDefault();if(!teacherId||!standardName||!sectionName)return;setSaving(true);setError('');const existing=rows.find(r=>r.teacher_person_id===teacherId&&r.standard_name===standardName&&r.section_name===sectionName&&(r.subject_name||'')===subjectName.trim());let result;if(existing){result=await supabase.from('school_teacher_class_assignments').update({is_active:true,updated_at:new Date().toISOString()}).eq('school_id',schoolId).eq('id',existing.id)}else{result=await supabase.from('school_teacher_class_assignments').insert({school_id:schoolId,teacher_person_id:teacherId,standard_name:standardName,section_name:sectionName,subject_name:subjectName.trim()||null})}setSaving(false);if(result.error){setError(result.error.message);return}setSubjectName('');await load()}
 const toggle=async(row:Assignment)=>{const {error}=await supabase.from('school_teacher_class_assignments').update({is_active:!row.is_active,updated_at:new Date().toISOString()}).eq('school_id',schoolId).eq('id',row.id);if(error)setError(error.message);else await load()}
 const teacherName=(id:string)=>teachers.find(t=>t.id===id)?.name||id
 return <section className="workspace-panel" style={{marginTop:20}}>
  <div className="workspace-heading"><div><span className="section-eyebrow">TEACHING WORKLOAD</span><h2>Teacher class allotment</h2><p>Assign each teacher to the standard, section and optional subject they are responsible for.</p></div></div>
  <form className="people-form" onSubmit={save}><div className="people-form-grid">
   <label>Teacher<select value={teacherId} onChange={e=>setTeacherId(e.target.value)} required><option value="">Select teacher</option>{teachers.map(t=><option key={t.id} value={t.id}>{t.name} · {t.id}</option>)}</select></label>
   <label>Standard<select value={standardName} onChange={e=>setStandardName(e.target.value)} required>{standards.map(s=><option key={s.name} value={s.name}>{s.name}</option>)}</select></label>
   <label>Section<select value={sectionName} onChange={e=>setSectionName(e.target.value)} required><option value="">Select section</option>{sections.map(s=><option key={s} value={s}>{s}</option>)}</select></label>
   <label>Subject (optional)<select value={subjectName} onChange={e=>setSubjectName(e.target.value)}><option value="">All subjects / Class teacher</option>{subjects.filter(s=>s.standard_name===standardName).map(s=><option key={s.standard_name+":"+s.subject_name} value={s.subject_name}>{s.subject_name}</option>)}</select></label>
  </div><button className="primary-action" type="submit" disabled={saving||!teachers.length||!sections.length}>{saving?'Saving allotment…':'+ Assign teacher'}</button></form>
  <div className="role-user-list"><div className="permission-heading"><div><b>Current class allotments</b><span>{loading?'Loading saved allotments…':'Saved in the school database.'}</span></div><span>{rows.filter(r=>r.is_active).length} active</span></div>
   {rows.map(row=><article className="role-user-row" key={row.id}><div className="role-user-avatar"><Users size={16}/></div><div className="role-user-summary"><b>{teacherName(row.teacher_person_id)}</b><span>{row.standard_name} · Section {row.section_name}{row.subject_name?' · '+row.subject_name:''}</span><small>{row.is_active?'Active assignment':'Inactive assignment'}</small></div><button type="button" onClick={()=>void toggle(row)}>{row.is_active?'Deactivate':'Reactivate'}</button></article>)}
   {!loading&&!rows.length&&<div className="empty-table">No teacher class allotments created yet.</div>}
  </div>{error&&<div className="qr-error">{error}</div>}
 </section>
}
