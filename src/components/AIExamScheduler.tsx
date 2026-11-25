import { useEffect, useMemo, useState } from 'react'
import { CalendarClock, Plus, RefreshCw, Sparkles, Users, DoorOpen, CheckCircle2, AlertTriangle, Send } from 'lucide-react'
import { supabase } from '../lib/supabase'

type Exam = { id:string; academic_year:string; exam_name:string; standard_name:string; section_name:string; subject_name:string; exam_date:string; start_time:string|null; end_time:string|null }
type Room = { id:string; room_name:string; room_type:'classroom'|'lab'|'computer_lab'; capacity:number; is_active:boolean }
type Teacher = { person_id:string; full_name:string }
type Assignment = { teacher_person_id:string; standard_name:string; section_name:string; subject_name:string|null }
type Slot = { date:string; start:string; end:string }
type Allocation = { exam_schedule_id:string; exam_name:string; standard_name:string; section_name:string; subject_name:string; exam_date:string; start_time:string; end_time:string; room_id:string; room_name:string; invigilator_person_id:string; invigilator_name:string }
type Props = { schoolId:string; academicYear:string; notify:(message:string)=>void }

const asMinutes=(value:string)=>{const [h,m]=value.slice(0,5).split(':').map(Number);return h*60+m}
const asTime=(minutes:number)=>String(Math.floor(minutes/60)).padStart(2,'0')+':'+String(minutes%60).padStart(2,'0')
const dateList=(from:string,to:string)=>{const out:string[]=[];const d=new Date(from+'T12:00:00');const last=new Date(to+'T12:00:00');while(d<=last&&out.length<90){out.push(d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'));d.setDate(d.getDate()+1)}return out}
const overlaps=(a:{start_time:string;end_time:string},b:{start_time:string;end_time:string})=>asMinutes(a.start_time)<asMinutes(b.end_time)&&asMinutes(a.end_time)>asMinutes(b.start_time)

export default function AIExamScheduler({schoolId,academicYear,notify}:Props){
 const [exams,setExams]=useState<Exam[]>([])
 const [rooms,setRooms]=useState<Room[]>([])
 const [teachers,setTeachers]=useState<Teacher[]>([])
 const [assignments,setAssignments]=useState<Assignment[]>([])
 const [allocations,setAllocations]=useState<Allocation[]>([])
 const [runId,setRunId]=useState('')
 const [runStatus,setRunStatus]=useState('')
 const [loading,setLoading]=useState(true)
 const [generating,setGenerating]=useState(false)
 const [publishing,setPublishing]=useState(false)
 const [error,setError]=useState('')
 const [examName,setExamName]=useState('')
 const [fromDate,setFromDate]=useState(new Date().toISOString().slice(0,10))
 const [toDate,setToDate]=useState(new Date(Date.now()+14*86400000).toISOString().slice(0,10))
 const [dayStart,setDayStart]=useState('09:00')
 const [duration,setDuration]=useState('180')
 const [breakMinutes,setBreakMinutes]=useState('30')
 const [slotsPerDay,setSlotsPerDay]=useState('2')
 const [roomForm,setRoomForm]=useState({room_name:'',room_type:'classroom' as Room['room_type'],capacity:'40'})
 const [showRooms,setShowRooms]=useState(false)

 const load=async()=>{
  setLoading(true);setError('')
  const [examRes,roomRes,teacherRes,assignRes,runRes]=await Promise.all([
   supabase.from('school_exam_schedules').select('id,academic_year,exam_name,standard_name,section_name,subject_name,exam_date,start_time,end_time').eq('school_id',schoolId).eq('academic_year',academicYear).order('exam_date'),
   supabase.from('school_exam_rooms').select('id,room_name,room_type,capacity,is_active').eq('school_id',schoolId).order('capacity'),
   supabase.from('school_people').select('person_id,full_name').eq('school_id',schoolId).eq('record_type','Teacher').order('full_name'),
   supabase.from('school_teacher_class_assignments').select('teacher_person_id,standard_name,section_name,subject_name').eq('school_id',schoolId).eq('is_active',true),
   supabase.from('school_exam_plan_runs').select('id,exam_name,status').eq('school_id',schoolId).eq('academic_year',academicYear).order('created_at',{ascending:false}).limit(1)
  ])
  const failed=[examRes,roomRes,teacherRes,assignRes,runRes].find(x=>x.error)
  if(failed?.error){setError(failed.error.message);setLoading(false);return}
  const e=(examRes.data||[]) as Exam[],r=(roomRes.data||[]) as Room[]
  setExams(e);setRooms(r);setTeachers((teacherRes.data||[]) as Teacher[]);setAssignments((assignRes.data||[]) as Assignment[])
  const names=[...new Set(e.map(x=>x.exam_name))]
  setExamName(current=>names.includes(current)?current:(names[0]||''))
  const latest=(runRes.data||[])[0]
  if(latest){
   setRunId(latest.id);setRunStatus(latest.status)
   const {data:rows,error:allocationError}=await supabase.from('school_exam_plan_allocations').select('exam_schedule_id,exam_date,start_time,end_time,room_id,invigilator_person_id,school_exam_schedules(exam_name,standard_name,section_name,subject_name),school_exam_rooms(room_name),school_people!school_exam_plan_allocations_invigilator_person_id_fkey(full_name)').eq('school_id',schoolId).eq('plan_run_id',latest.id)
   if(!allocationError&&rows){
    setAllocations(rows.map((row:any)=>({exam_schedule_id:row.exam_schedule_id,exam_name:row.school_exam_schedules?.exam_name||'',standard_name:row.school_exam_schedules?.standard_name||'',section_name:row.school_exam_schedules?.section_name||'',subject_name:row.school_exam_schedules?.subject_name||'',exam_date:row.exam_date,start_time:row.start_time,end_time:row.end_time,room_id:row.room_id,room_name:row.school_exam_rooms?.room_name||'Room',invigilator_person_id:row.invigilator_person_id,invigilator_name:row.school_people?.full_name||row.invigilator_person_id})))
   }else setAllocations([])
  }else{setRunId('');setRunStatus('');setAllocations([])}
  setLoading(false)
 }
 useEffect(()=>{void load()},[schoolId,academicYear])

 const selectedExams=useMemo(()=>exams.filter(e=>e.exam_name===examName),[exams,examName])
 const addRoom=async()=>{
  const capacity=Number(roomForm.capacity)
  if(!roomForm.room_name.trim()||!Number.isInteger(capacity)||capacity<1){notify('Enter a room name and a valid capacity.');return}
  const {error}=await supabase.from('school_exam_rooms').insert({school_id:schoolId,room_name:roomForm.room_name.trim(),room_type:roomForm.room_type,capacity})
  if(error){notify('Could not save room: '+error.message);return}
  setRoomForm({room_name:'',room_type:'classroom',capacity:'40'});notify('Exam room saved.');await load()
 }
 const toggleRoom=async(room:Room)=>{
  const {error}=await supabase.from('school_exam_rooms').update({is_active:!room.is_active,updated_at:new Date().toISOString()}).eq('school_id',schoolId).eq('id',room.id)
  if(error){notify('Could not update room: '+error.message);return}await load()
 }

 const generate=async()=>{
  if(!examName||!selectedExams.length){notify('Create subject exam schedules first.');return}
  const activeRooms=rooms.filter(r=>r.is_active)
  if(!activeRooms.length){notify('Add at least one active exam room before generating.');setShowRooms(true);return}
  if(!teachers.length){notify('Add teacher profiles before assigning invigilators.');return}
  if(toDate<fromDate){notify('End date must be on or after the start date.');return}
  const days=dateList(fromDate,toDate)
  if(!days.length){notify('Choose a date range within 90 days.');return}
  const durationMins=Math.max(30,Math.min(360,Number(duration)||180))
  const gap=Math.max(0,Math.min(180,Number(breakMinutes)||0))
  const countSlots=Math.max(1,Math.min(6,Number(slotsPerDay)||1))
  const startMins=asMinutes(dayStart)
  const slots:Slot[]=[]
  for(const date of days)for(let i=0;i<countSlots;i++){const start=startMins+i*(durationMins+gap);if(start+durationMins<=18*60)slots.push({date,start:asTime(start),end:asTime(start+durationMins)})}
  if(!slots.length){notify('The selected time window does not fit an exam slot before 6:00 PM.');return}
  setGenerating(true);setError('')
  try{
   const cohort=(e:Exam)=>e.standard_name+'::'+e.section_name
   const studentCount=new Map<string,number>()
   const cohortKeys=[...new Set(selectedExams.map(cohort))]
   const studentRows=await supabase.from('school_people').select('person_id,details').eq('school_id',schoolId).eq('record_type','Student')
   if(studentRows.error)throw studentRows.error
   for(const key of cohortKeys){const [standard,section]=key.split('::');studentCount.set(key,(studentRows.data||[]).filter((p:any)=>p.details?.joining_standard===standard&&(p.details?.section||'')===section).length)}
   const adjacency=(e:Exam)=>selectedExams.filter(other=>other.id!==e.id&&cohort(other)===cohort(e))
   const unassigned=new Set(selectedExams.map(e=>e.id))
   const slotByExam=new Map<string,Slot>()
   const roomBusy=new Set<string>()
   const teacherBusy=new Set<string>()
   const teacherLoad=new Map(teachers.map(t=>[t.person_id,0]))
   const chosen:Allocation[]=[]
   const roomOptions=(e:Exam,slot:Slot)=>{
    const needed=studentCount.get(cohort(e))||0
    const subject=assignments.find(a=>a.standard_name===e.standard_name&&a.section_name===e.section_name&&a.subject_name===e.subject_name)
    const catalog=awaitSubjectType.get(e.id)||''
    const lab=/lab|practical/i.test(catalog)
    const available=activeRooms.filter(r=>!roomBusy.has(r.id+'|'+slot.date+'|'+slot.start)&&(!lab||r.room_type==='lab'||r.room_type==='computer_lab')).sort((a,b)=>a.capacity-b.capacity)
    const single=available.filter(r=>r.capacity>=needed).sort((a,b)=>a.capacity-b.capacity)[0]
    if(single)return [single]
    const selected:Room[]=[];let capacity=0
    for(const room of [...available].sort((a,b)=>b.capacity-a.capacity)){selected.push(room);capacity+=room.capacity;if(capacity>=needed)break}
    return capacity>=needed?selected:[]
   }
   const teacherOptions=(e:Exam,slot:Slot,roomList:Room[])=>{
    const subjectTeachers=new Set(assignments.filter(a=>a.standard_name===e.standard_name&&a.section_name===e.section_name&&a.subject_name===e.subject_name).map(a=>a.teacher_person_id))
    const available=teachers.filter(t=>!subjectTeachers.has(t.person_id)&&!teacherBusy.has(t.person_id+'|'+slot.date+'|'+slot.start)).sort((a,b)=>(teacherLoad.get(a.person_id)||0)-(teacherLoad.get(b.person_id)||0))
    if(available.length<roomList.length)return []
    return available.slice(0,roomList.length)
   }
   const awaitSubjectType=new Map<string,string>()
   const subjectRes=await supabase.from('school_academic_subjects').select('standard_name,subject_name,subject_type').eq('school_id',schoolId).eq('academic_year',academicYear)
   if(subjectRes.error)throw subjectRes.error
   for(const e of selectedExams){const s=(subjectRes.data||[]).find(x=>x.standard_name===e.standard_name&&x.subject_name===e.subject_name);awaitSubjectType.set(e.id,s?.subject_type||'')}
   const pending=[...selectedExams]
   while(unassigned.size){
    const candidates=pending.filter(e=>unassigned.has(e.id)).sort((a,b)=>{
     const sat=(e:Exam)=>new Set(adjacency(e).map(n=>slotByExam.get(n.id)).filter(Boolean).map(s=>s!.date+'|'+s!.start)).size
     return sat(b)-sat(a)||adjacency(b).length-adjacency(a).length||(studentCount.get(cohort(b))||0)-(studentCount.get(cohort(a))||0)
    })
    const exam=candidates[0]
    if(!exam)throw new Error('The scheduler could not order the remaining exams.')
    let placed=false
    for(const slot of slots){
     const cohortConflict=adjacency(exam).some(other=>{const prior=chosen.filter(a=>a.exam_schedule_id===other.id);return prior.some(a=>a.exam_date===slot.date&&overlaps({start_time:slot.start,end_time:slot.end},a))})
     if(cohortConflict)continue
     const roomsForSlot=roomOptions(exam,slot)
     if(!roomsForSlot.length)continue
     const invigilators=teacherOptions(exam,slot,roomsForSlot)
     if(!invigilators.length)continue
     roomsForSlot.forEach((room,index)=>{
      const invigilator=invigilators[index]
      roomBusy.add(room.id+'|'+slot.date+'|'+slot.start)
      teacherBusy.add(invigilator.person_id+'|'+slot.date+'|'+slot.start)
      teacherLoad.set(invigilator.person_id,(teacherLoad.get(invigilator.person_id)||0)+1)
      chosen.push({exam_schedule_id:exam.id,exam_name:exam.exam_name,standard_name:exam.standard_name,section_name:exam.section_name,subject_name:exam.subject_name,exam_date:slot.date,start_time:slot.start,end_time:slot.end,room_id:room.id,room_name:room.room_name,invigilator_person_id:invigilator.person_id,invigilator_name:invigilator.full_name})
     })
     slotByExam.set(exam.id,slot);unassigned.delete(exam.id);placed=true;break
    }
    if(!placed)throw new Error('Unable to allocate '+exam.standard_name+' '+exam.section_name+' · '+exam.subject_name+'. Add rooms / capacity / teachers or extend the exam date range.')
   }
   const payload=chosen.map(a=>({exam_schedule_id:a.exam_schedule_id,exam_date:a.exam_date,start_time:a.start_time,end_time:a.end_time,room_id:a.room_id,invigilator_person_id:a.invigilator_person_id}))
   const roomSplitCount=new Set(chosen.filter(a=>chosen.filter(b=>b.exam_schedule_id===a.exam_schedule_id).length>1).map(a=>a.exam_schedule_id)).size
   const loads=[...teacherLoad.values()]
   const score={hard_violations:0,exam_count:selectedExams.length,room_assignments:chosen.length,room_splits:roomSplitCount,invigilator_load_min:Math.min(...loads),invigilator_load_max:Math.max(...loads),method:'DSATUR cohort-conflict ordering + greedy slot search + capacity-aware room packing'}
   const {data:newRun,error:saveError}=await supabase.rpc('save_school_ai_exam_plan',{p_school_id:schoolId,p_academic_year:academicYear,p_exam_name:examName,p_allocations:payload,p_score:score})
   if(saveError)throw saveError
   setRunId(newRun as string);setRunStatus('draft');setAllocations(chosen);notify('AI exam plan generated and saved as a draft. Review it before publishing.')
  }catch(err){const message=err instanceof Error?err.message:'Could not generate the AI exam plan.';setError(message);notify(message)}
  finally{setGenerating(false)}
 }

 const publish=async()=>{
  if(!runId||runStatus!=='draft')return
  if(!window.confirm('Publish this exam plan? This updates the exam dates and times in the academic timetable.'))return
  setPublishing(true)
  const {error}=await supabase.rpc('publish_school_ai_exam_plan',{p_school_id:schoolId,p_plan_run_id:runId})
  setPublishing(false)
  if(error){notify('Plan could not be published: '+error.message);return}
  notify('Exam timetable published. Existing marks/result publication status is unchanged.')
  await load()
 }
 const splits=new Set(allocations.filter(a=>allocations.filter(b=>b.exam_schedule_id===a.exam_schedule_id).length>1).map(a=>a.exam_schedule_id)).size
 return <section className="workspace-panel ai-exam-scheduler">
  <style>{`
   .ai-exam-scheduler .ai-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}.ai-exam-scheduler label{display:grid;gap:6px;font-size:12px;font-weight:700;color:#52665a}.ai-exam-scheduler input,.ai-exam-scheduler select{border:1px solid #dce7e0;border-radius:9px;padding:10px;background:#fff;color:#213b2c;min-height:40px;min-width:0}.ai-exam-scheduler .ai-card{border:1px solid #e2ebe5;border-radius:14px;padding:16px;background:#fff;margin-top:14px}.ai-exam-scheduler .ai-stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin:16px 0}.ai-exam-scheduler .ai-stat{border:1px solid #e2ebe5;border-radius:12px;padding:13px}.ai-exam-scheduler .ai-stat span{display:block;color:#718078;font-size:11px;font-weight:700}.ai-exam-scheduler .ai-stat b{display:block;color:#19432e;font-size:22px;margin-top:5px}.ai-exam-scheduler .ai-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:14px}.ai-exam-scheduler .ai-btn{border:0;border-radius:9px;background:#19764a;color:white;padding:10px 13px;font-weight:750;display:inline-flex;align-items:center;gap:7px;cursor:pointer}.ai-exam-scheduler .ai-btn.secondary{background:#fff;color:#28533c;border:1px solid #dce7e0}.ai-exam-scheduler .ai-btn:disabled{opacity:.5;cursor:not-allowed}.ai-exam-scheduler .ai-table{overflow:auto;border:1px solid #e5ece7;border-radius:12px;margin-top:12px}.ai-exam-scheduler table{width:100%;border-collapse:collapse;min-width:780px}.ai-exam-scheduler th,.ai-exam-scheduler td{padding:10px 12px;text-align:left;border-bottom:1px solid #edf1ee;font-size:12px}.ai-exam-scheduler th{background:#f7faf8;color:#66766d;text-transform:uppercase;font-size:10px}.ai-exam-scheduler .ai-warning{padding:12px;border-radius:10px;background:#fff7e8;color:#875b13;margin-top:12px}.ai-exam-scheduler .ai-error{padding:12px;border-radius:10px;background:#fff1ef;color:#a33f35;margin-top:12px}.ai-exam-scheduler .ai-muted{color:#748278}.ai-exam-scheduler .ai-room-row{display:flex;justify-content:space-between;gap:10px;padding:10px 0;border-bottom:1px solid #edf1ee}.ai-exam-scheduler .ai-room-row span{color:#6c7b72;font-size:12px}.ai-exam-scheduler .ai-room-form{display:grid;grid-template-columns:2fr 1fr 1fr auto;gap:9px;align-items:end;margin-top:12px}
   @media(max-width:760px){.ai-exam-scheduler .ai-grid{grid-template-columns:1fr 1fr}.ai-exam-scheduler .ai-stats{grid-template-columns:1fr 1fr}.ai-exam-scheduler .ai-room-form{grid-template-columns:1fr 1fr}}@media(max-width:480px){.ai-exam-scheduler .ai-grid{grid-template-columns:1fr}.ai-exam-scheduler .ai-room-form{grid-template-columns:1fr}}
  `}</style>
  <div className="workspace-heading"><div><span className="section-eyebrow">CONSTRAINT-BASED OPTIMIZATION</span><h2><Sparkles size={18}/> AI Exam Scheduler</h2><p>Generate a clash-free timetable, allocate rooms by capacity and balance invigilator loads.</p></div><button className="ai-btn secondary" onClick={()=>void load()} disabled={loading}><RefreshCw size={14}/> Refresh</button></div>
  {error&&<div className="ai-error" role="alert">{error}</div>}
  <div className="ai-stats"><div className="ai-stat"><span>Subject exams</span><b>{selectedExams.length}</b></div><div className="ai-stat"><span>Active rooms</span><b>{rooms.filter(r=>r.is_active).length}</b></div><div className="ai-stat"><span>Invigilators</span><b>{teachers.length}</b></div><div className="ai-stat"><span>Room splits</span><b>{splits}</b></div></div>
  <div className="ai-card"><h3><CalendarClock size={17}/> Schedule generation</h3><div className="ai-grid">
   <label>Examination<select value={examName} onChange={e=>setExamName(e.target.value)}><option value="">Choose exam</option>{[...new Set(exams.map(e=>e.exam_name))].map(name=><option key={name}>{name}</option>)}</select></label>
   <label>Available from<input type="date" value={fromDate} onChange={e=>setFromDate(e.target.value)}/></label>
   <label>Available until<input type="date" value={toDate} min={fromDate} onChange={e=>setToDate(e.target.value)}/></label>
   <label>First daily slot<input type="time" value={dayStart} onChange={e=>setDayStart(e.target.value)}/></label>
   <label>Exam duration (minutes)<input type="number" min="30" max="360" step="15" value={duration} onChange={e=>setDuration(e.target.value)}/></label>
   <label>Break between slots (minutes)<input type="number" min="0" max="180" step="5" value={breakMinutes} onChange={e=>setBreakMinutes(e.target.value)}/></label>
   <label>Slots per day<input type="number" min="1" max="6" value={slotsPerDay} onChange={e=>setSlotsPerDay(e.target.value)}/></label>
  </div><div className="ai-actions"><button className="ai-btn" onClick={()=>void generate()} disabled={loading||generating||!selectedExams.length}><Sparkles size={15}/>{generating?'Optimizing constraints…':'Generate AI timetable'}</button><button className="ai-btn secondary" onClick={()=>setShowRooms(v=>!v)}><DoorOpen size={15}/> {showRooms?'Hide':'Manage'} rooms</button></div><p className="ai-muted">Hard constraints: no same-class exam overlap, no room or invigilator double-booking, sufficient room capacity, and lab-room matching for practical subjects. Soft objectives: fewer room splits and balanced invigilator loads.</p></div>
  {showRooms&&<div className="ai-card"><h3><DoorOpen size={17}/> Exam rooms & labs</h3><form className="ai-room-form" onSubmit={e=>{e.preventDefault();void addRoom()}}><label>Room name<input value={roomForm.room_name} onChange={e=>setRoomForm(v=>({...v,room_name:e.target.value}))} placeholder="Room 101" required/></label><label>Room type<select value={roomForm.room_type} onChange={e=>setRoomForm(v=>({...v,room_type:e.target.value as Room['room_type']}))}><option value="classroom">Classroom</option><option value="lab">Science lab</option><option value="computer_lab">Computer lab</option></select></label><label>Capacity<input type="number" min="1" value={roomForm.capacity} onChange={e=>setRoomForm(v=>({...v,capacity:e.target.value}))} required/></label><button className="ai-btn" type="submit"><Plus size={14}/> Add room</button></form>{rooms.map(room=><div className="ai-room-row" key={room.id}><div><b>{room.room_name}</b><span> · {room.room_type.replace('_',' ')} · {room.capacity} seats</span></div><button className="ai-btn secondary" onClick={()=>void toggleRoom(room)}>{room.is_active?'Deactivate':'Activate'}</button></div>)}{!rooms.length&&<p className="ai-muted">No rooms configured. Add classrooms and labs before generating.</p>}</div>}
  <div className="ai-card"><div className="workspace-heading"><div><h3><CheckCircle2 size={17}/> Generated plan review</h3><p>{runStatus?('Latest plan · '+runStatus.toUpperCase()):'Generate a plan to review the proposed dates, rooms and invigilators.'}</p></div>{runStatus==='draft'&&<button className="ai-btn" onClick={()=>void publish()} disabled={publishing||!allocations.length}><Send size={14}/>{publishing?'Publishing…':'Publish timetable'}</button>}</div>
   {allocations.length?<div className="ai-table"><table><thead><tr><th>Date</th><th>Time</th><th>Class</th><th>Subject</th><th>Room</th><th>Invigilator</th></tr></thead><tbody>{allocations.map((a,i)=><tr key={a.exam_schedule_id+'-'+a.room_id+'-'+i}><td>{a.exam_date}</td><td>{a.start_time.slice(0,5)} – {a.end_time.slice(0,5)}</td><td>{a.standard_name} · {a.section_name}</td><td>{a.exam_name} · {a.subject_name}</td><td>{a.room_name}</td><td>{a.invigilator_name}</td></tr>)}</tbody></table></div>:<div className="ai-warning"><AlertTriangle size={16}/> {loading?'Loading saved plan…':'No AI plan saved for this academic year yet.'}</div>}
   {runStatus==='published'&&<p className="ai-muted">Published plan is locked. Generate a new draft to propose changes; published plans remain in the audit history.</p>}
  </div>
  <p className="ai-muted"><Users size={14}/> Current student-conflict model treats each standard + section as a cohort, since the school database currently does not store individual subject-enrolment records. Add subject-wise student enrolments later for finer-grained clash graphs.</p>
 </section>
}
