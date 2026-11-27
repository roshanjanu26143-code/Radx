import { useEffect, useMemo, useState } from 'react'
import { Users, UserCheck, DoorOpen, AlertTriangle, CheckCircle2 } from 'lucide-react'
import { supabase } from '../lib/supabase'

type Person={id:string;type:string;name:string;details:Record<string,string>}
type Standard={name:string;sections:string[];groups?:string[];groupSections?:Record<string,string[]>;sectionRooms?:Record<string,string>}
type Room={id:string;room_code:string;room_name:string;capacity:number;is_active:boolean}
type TeacherAssignment={id:string;teacher_person_id:string;standard_name:string;section_name:string;subject_name:string|null;is_active:boolean}
type Teacher={id:string;name:string;range:string}
const numberOf=(s:string)=>Number((s.match(/\d+/)||[])[0]||0)
const eligible=(range:string,standard:string)=>{
 const normalized=range.trim().toUpperCase().replace(/[–—]/g,'-').replace(/\s+/g,' ')
 if(!normalized)return true
 if(/^(KG|LKG)\s*-\s*UKG$/.test(normalized)||/^KG\s+TO\s+UKG$/.test(normalized))return /kg|lkg|ukg/i.test(standard)
 const bounds=normalized.match(/(\d+)\s*-\s*(\d+)/)
 const n=numberOf(standard)
 if(bounds)return n>=Number(bounds[1])&&n<=Number(bounds[2])
 const single=normalized.match(/^\d+$/)
 return single? n===Number(single[0]):false
}
export default function StandardStudentAllocation({schoolId,standard,standards,records,onAssign,onSectionRoomChange}:{schoolId:string;standard:string;standards:Standard[];records:Person[];onAssign:(id:string,section:string,group?:string)=>Promise<void>;onSectionRoomChange:(section:string,roomId:string)=>void}){
 const [rooms,setRooms]=useState<Room[]>([])
 const [teachers,setTeachers]=useState<Teacher[]>([])
 const [assignments,setAssignments]=useState<TeacherAssignment[]>([])
 const [selectedSection,setSelectedSection]=useState('')
 const [selectedGroup,setSelectedGroup]=useState('')
 const [genderMode,setGenderMode]=useState('mixed')
 const [selectedIds,setSelectedIds]=useState<string[]>([])
 const [selectedRoom,setSelectedRoom]=useState('')
 const [teacherIds,setTeacherIds]=useState<string[]>([])
 const [teacherSubject,setTeacherSubject]=useState('')
 const [subjects,setSubjects]=useState<string[]>([])
 const [loading,setLoading]=useState(true)
 const [saving,setSaving]=useState(false)
 const [message,setMessage]=useState('')
 const [capacityDraft,setCapacityDraft]=useState('')
 const standardRow=standards.find(s=>s.name===standard)
 const groups=standard==='Standard 11'||standard==='Standard 12'?(standardRow?.groups?.length?standardRow.groups:standards.find(s=>s.name==='Standard 11')?.groups||[]):[]
 const sections=groups.length?(standardRow?.groupSections?.[selectedGroup]||[]):(standardRow?.sections||[])
 const students=useMemo(()=>records.filter(p=>p.type==='Student'&&p.details.joining_standard===standard),[records,standard])
 const pool=useMemo(()=>students.filter(p=>!groups.length||p.details.academic_group===selectedGroup||!p.details.academic_group),[students,selectedGroup,groups.join('|')])
 const sectionStudents=students.filter(p=>p.details.section===selectedSection&&(!groups.length||p.details.academic_group===selectedGroup))
 const room=rooms.find(r=>r.id===selectedRoom)
 const roomCapacity=room?.capacity||0
 const mappedRoomSections=room?standards.flatMap(row=>Object.entries(row.sectionRooms||{}).filter(([,roomId])=>roomId===room.id).map(([sectionName])=>({standardName:row.name,sectionName}))):[]
 if(room&&selectedSection&&!mappedRoomSections.some(x=>x.standardName===standard&&x.sectionName===selectedSection))mappedRoomSections.push({standardName:standard,sectionName:selectedSection})
 const roomStudentIds=new Set(records.filter(p=>p.type==='Student'&&mappedRoomSections.some(x=>p.details.joining_standard===x.standardName&&p.details.section===x.sectionName)).map(p=>p.id))
 const roomOccupancy=roomStudentIds.size
 const available=pool.filter(p=>!p.details.section||p.details.section===selectedSection)
 const genderMatches=(p:Person)=>genderMode==='boys'?p.details.gender==='Male':genderMode==='girls'?p.details.gender==='Female':true
 const filtered=available.filter(genderMatches)
 const visibleStudents=students
 const selected=filtered.filter(p=>selectedIds.includes(p.id))
 const totalAfter=roomOccupancy+selected.filter(p=>p.details.section!==selectedSection||p.details.academic_group!==selectedGroup).length
 const activeTeachers=assignments.filter(a=>a.is_active&&a.standard_name===standard&&a.section_name===selectedSection)
 useEffect(()=>{const firstGroup=groups[0]||'';setSelectedGroup(firstGroup);setSelectedSection('');setSelectedIds([])},[standard,groups.join('|')])
 useEffect(()=>{setSelectedSection(sections[0]||'');setSelectedIds([])},[selectedGroup,sections.join('|')])
 useEffect(()=>{setSelectedRoom(standardRow?.sectionRooms?.[selectedSection]||'');setCapacityDraft('');setSelectedIds([])},[selectedSection,standardRow?.sectionRooms])
 useEffect(()=>{
  let live=true
  const load=async()=>{
   setLoading(true);setMessage('')
   const [roomResult,teacherResult,assignmentResult,subjectResult]=await Promise.all([
    supabase.from('school_timetable_rooms').select('id,room_code,room_name,capacity,is_active').eq('school_id',schoolId).eq('is_active',true).order('room_name'),
    supabase.from('school_people').select('person_id,full_name,details').eq('school_id',schoolId).eq('record_type','Teacher'),
    supabase.from('school_teacher_class_assignments').select('id,teacher_person_id,standard_name,section_name,subject_name,is_active').eq('school_id',schoolId),
    supabase.from('school_academic_subjects').select('subject_name').eq('school_id',schoolId).eq('standard_name',standard).eq('is_active',true).order('subject_name')
   ])
   if(!live)return
   if(roomResult.error||teacherResult.error||assignmentResult.error||subjectResult.error){setMessage(roomResult.error?.message||teacherResult.error?.message||assignmentResult.error?.message||subjectResult.error?.message||'Could not load allotment data.')}
   setRooms((roomResult.data||[]) as Room[])
   setTeachers((teacherResult.data||[]).map((p:any)=>({id:p.person_id,name:p.full_name,range:String(p.details?.teaching_range||'')})))
   setAssignments((assignmentResult.data||[]) as TeacherAssignment[])
   setSubjects([...new Set((subjectResult.data||[]).map((s:any)=>s.subject_name as string))])
   setLoading(false)
  }
  void load()
  return()=>{live=false}
 },[schoolId,standard])
 const toggleStudent=(id:string)=>setSelectedIds(items=>items.includes(id)?items.filter(x=>x!==id):[...items,id])
 const autoSelect=()=>{
  const male=filtered.filter(p=>p.details.gender==='Male'),female=filtered.filter(p=>p.details.gender==='Female'),other=filtered.filter(p=>!['Male','Female'].includes(p.details.gender||''))
  const ordered:string[]=[]
  if(genderMode==='mixed'){
   let i=0;while(i<male.length||i<female.length){if(i<male.length)ordered.push(male[i].id);if(i<female.length)ordered.push(female[i].id);i++}
   ordered.push(...other.map(p=>p.id))
  }else ordered.push(...filtered.map(p=>p.id))
  const remaining=roomCapacity?Math.max(0,roomCapacity-roomOccupancy):ordered.length
  setSelectedIds(ordered.slice(0,remaining))
 }
 const saveStudents=async()=>{
  if(groups.length&&!selectedGroup){setMessage('Select an academic group first.');return}
  if(!selectedSection){setMessage('Create or select a section in the selected group first.');return}
  if(!selectedRoom||!room){setMessage('Select a classroom with a configured capacity before allotting students.');return}
  if(totalAfter>roomCapacity){setMessage('Classroom capacity exceeded across all sections using this room. Increase its verified physical capacity or assign another room.');return}
  if(!selected.length){setMessage('Select at least one student.');return}
  setSaving(true);setMessage('')
  try{for(const p of selected){await onAssign(p.id,selectedSection,selectedGroup||undefined)}
   setSelectedIds([]);setMessage(selected.length+' student(s) allotted to '+standard+' · '+(selectedGroup?selectedGroup+' · ':'')+selectedSection+'.')
  }catch(error){setMessage(error instanceof Error?error.message:'Student allotment failed. Please retry.')}
  finally{setSaving(false)}
 }
 const saveTeachers=async()=>{
  if(!selectedSection||!teacherIds.length){setMessage('Choose a section and at least one eligible teacher.');return}
  setSaving(true);setMessage('')
  for(const id of teacherIds){
   const existing=assignments.find(a=>a.teacher_person_id===id&&a.standard_name===standard&&a.section_name===selectedSection&&(a.subject_name||'')===(teacherSubject||''))
   const result=existing?await supabase.from('school_teacher_class_assignments').update({is_active:true,updated_at:new Date().toISOString()}).eq('school_id',schoolId).eq('id',existing.id):await supabase.from('school_teacher_class_assignments').insert({school_id:schoolId,teacher_person_id:id,standard_name:standard,section_name:selectedSection,subject_name:teacherSubject||null})
   if(result.error){setMessage(result.error.message);setSaving(false);return}
  }
  const {data}=await supabase.from('school_teacher_class_assignments').select('id,teacher_person_id,standard_name,section_name,subject_name,is_active').eq('school_id',schoolId)
  setAssignments((data||[]) as TeacherAssignment[]);setTeacherIds([]);setSaving(false);setMessage('Teacher assignment saved.')
 }
 const removeTeacher=async(row:TeacherAssignment)=>{
  const {error}=await supabase.from('school_teacher_class_assignments').update({is_active:false,updated_at:new Date().toISOString()}).eq('school_id',schoolId).eq('id',row.id)
  if(error)setMessage(error.message);else setAssignments(items=>items.map(a=>a.id===row.id?{...a,is_active:false}:a))
 }
 return <div className="standard-student-allocation" style={{marginTop:18,display:'grid',gap:16}}>
  <div className="allocation-heading"><div><b>{standard} · Student & Teacher Allotment</b><span>{groups.length?'Choose an academic group, then its section.':'Choose a section.'} Assign eligible teachers and allot students within classroom capacity.</span></div><span className="count-pill">{students.length} students</span></div>
  {message&&<div className="qr-error" role="status">{message}</div>}
  {groups.length>0&&<label>Academic group<select value={selectedGroup} onChange={e=>{setSelectedGroup(e.target.value);setSelectedIds([])}} required><option value="">Select group</option>{groups.map(g=><option key={g}>{g}</option>)}</select></label>}
  <div className="people-form-grid">
   <label>Section<select value={selectedSection} onChange={e=>setSelectedSection(e.target.value)}><option value="">Select section</option>{sections.map(s=><option key={s}>{s}</option>)}</select></label>
   <label>Classroom<select value={selectedRoom} onChange={e=>{setSelectedRoom(e.target.value);if(selectedSection)onSectionRoomChange(selectedSection,e.target.value)}}><option value="">Select classroom</option>{rooms.map(r=><option key={r.id} value={r.id}>{r.room_code} · {r.room_name} · Capacity {r.capacity}</option>)}</select></label>
   <label>Student allotment method<select value={genderMode} onChange={e=>{setGenderMode(e.target.value);setSelectedIds([])}}><option value="mixed">Mixed boys & girls</option><option value="boys">Boys only</option><option value="girls">Girls only</option><option value="manual">Manual selection</option></select></label>
  </div>
  {room&&<div className="settings-info-grid"><div><span>Classroom capacity</span><b>{room.capacity}</b></div><div><span>Already in this section</span><b>{sectionStudents.length}</b></div><div><span>Room occupancy (all mapped sections)</span><b>{roomOccupancy}</b></div><div><span>Selected now</span><b>{selected.length}</b></div><div><span>Remaining room seats</span><b>{Math.max(0,roomCapacity-roomOccupancy)}</b></div></div>}
  {room&&totalAfter>roomCapacity&&<div className="status-warning"><AlertTriangle size={15}/> Capacity exceeded across sections using this classroom. Assign another room or increase its verified physical capacity.</div>}
  <div className="allocation-heading"><div><b>All students of {standard}{selectedGroup?' · '+selectedGroup:''}</b><span>Students in other groups or sections remain visible but cannot be selected here. Only students in the selected group, plus unassigned legacy students, are eligible for this section.</span></div><div style={{display:'flex',gap:8,flexWrap:'wrap'}}><button type="button" className="secondary-action" onClick={autoSelect} disabled={!room||!filtered.length}>Auto select</button><button type="button" className="secondary-action" onClick={()=>setSelectedIds(filtered.map(p=>p.id))}>Select all</button></div></div>
  {loading?<div className="empty-table">Loading rooms and teacher assignments…</div>:visibleStudents.length?visibleStudents.map(p=>{const wrongGroup=!!groups.length&&!!p.details.academic_group&&p.details.academic_group!==selectedGroup;const assignedElsewhere=!!p.details.section&&p.details.section!==selectedSection&&(!groups.length||!!p.details.academic_group);const selectable=!wrongGroup&&!assignedElsewhere&&genderMatches(p);return <label key={p.id} className="allocation-student-row" style={{display:'flex',alignItems:'center',gap:10,cursor:selectable?'pointer':'not-allowed',opacity:selectable?1:.65}}><input type="checkbox" checked={selectedIds.includes(p.id)} disabled={!selectable} onChange={()=>toggleStudent(p.id)}/><div className="people-record-avatar">{p.name.slice(0,1).toUpperCase()}</div><div className="people-record-main"><b>{p.name}</b><span>{p.id} · {p.details.gender||'Gender not set'} · {p.details.academic_group||'Group not set'}</span><small>{p.details.roll_number?'Roll no: '+p.details.roll_number:'Roll number pending'} · {assignedElsewhere?'Already assigned: '+p.details.section:p.details.section?'Current section: '+p.details.section:'Unassigned'}</small></div></label>}):<div className="empty-table">No students are registered in this standard yet.</div>}
  <button className="primary-action" type="button" onClick={()=>void saveStudents()} disabled={saving||!selected.length}>{saving?'Saving student allotment…':'Allot selected students'}</button>
  <div className="allocation-heading"><div><b>Teacher assignment · {selectedSection||'Select section'}</b><span>Teachers outside their teaching range are excluded.</span></div><span className="count-pill">{activeTeachers.length} assigned</span></div>
  <div className="people-form-grid"><label>Subject<select value={teacherSubject} onChange={e=>setTeacherSubject(e.target.value)}><option value="">Class teacher / General</option>{subjects.map(s=><option key={s}>{s}</option>)}</select></label><label>Eligible teachers<select multiple value={teacherIds} onChange={e=>setTeacherIds(Array.from(e.target.selectedOptions).map(o=>o.value))} style={{minHeight:92}}>{teachers.filter(t=>eligible(t.range,standard)).map(t=><option key={t.id} value={t.id}>{t.name} · {t.id}</option>)}</select><small>Use Ctrl (Windows) or Command (Mac) to select multiple teachers.</small></label></div>
  <button type="button" className="primary-action" onClick={()=>void saveTeachers()} disabled={saving||!teacherIds.length}>{saving?'Saving teacher assignment…':'Assign selected teachers'}</button>
  {activeTeachers.map(row=><div className="allocation-student-row" key={row.id}><UserCheck size={17}/><div className="people-record-main"><b>{teachers.find(t=>t.id===row.teacher_person_id)?.name||row.teacher_person_id}</b><span>{row.subject_name||'Class teacher'}</span></div><button type="button" className="secondary-action" onClick={()=>void removeTeacher(row)}>Remove</button></div>)}
  {sectionStudents.length>0&&<div><b>Already allotted students ({sectionStudents.length})</b>{sectionStudents.map(p=><div className="allocation-student-row" key={p.id}><div className="people-record-avatar">{p.name.slice(0,1).toUpperCase()}</div><div className="people-record-main"><b>{p.name}</b><span>{p.details.roll_number||'Roll number pending'} · {p.details.gender||'Gender not set'}</span></div></div>)}</div>}
  {room&&<div className="allocation-capacity-editor"><label>Update physical classroom capacity<input type="number" min={Math.max(1,roomOccupancy)} value={capacityDraft} onChange={e=>setCapacityDraft(e.target.value)} placeholder={'Current capacity: '+room.capacity}/></label><button type="button" className="secondary-action" disabled={saving||!capacityDraft||Number(capacityDraft)<roomOccupancy||Number(capacityDraft)===room.capacity} onClick={()=>void (async()=>{const next=Number(capacityDraft);if(!Number.isInteger(next)||next<roomOccupancy){setMessage('Capacity must be a whole number and cannot be lower than total occupancy across all sections using this room.');return}if(!window.confirm('Confirm classroom capacity change to '+next+' seats? Please ensure the room physically supports this capacity.'))return;setSaving(true);const {error}=await supabase.from('school_timetable_rooms').update({capacity:next,updated_at:new Date().toISOString()}).eq('school_id',schoolId).eq('id',room.id);setSaving(false);if(error){setMessage('Capacity update failed: '+error.message);return}setRooms(items=>items.map(item=>item.id===room.id?{...item,capacity:next}:item));setCapacityDraft('');setMessage('Classroom capacity updated to '+next+'.')})()}>Save capacity</button><small>Only increase this value after confirming the room's safe physical seating capacity.</small></div>}
  {!rooms.length&&!loading&&<div className="status-warning"><DoorOpen size={15}/> No active classrooms configured. Add rooms and capacities in Academic → Timetable before student allotment.</div>}
 </div>
}
