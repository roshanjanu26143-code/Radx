import { useEffect, useMemo, useState } from 'react'
import { CalendarDays, CheckCircle2, ClipboardList, Sparkles } from 'lucide-react'
import { supabase } from '../lib/supabase'

type Exam={id:string;exam_name:string;standard_name:string;section_name:string;subject_name:string;exam_date:string;start_time:string|null;end_time:string|null}
type Room={id:string;room_name:string;capacity:number;is_active:boolean}
type Person={person_id:string;full_name:string;record_type:string;details:Record<string,any>}
type Seat={exam_schedule_id:string;exam_name:string;standard_name:string;section_name:string;subject_name:string;student_person_id:string;student_name:string;room_id:string;room_name:string;exam_date:string;start_time:string;end_time:string;bench_number:number;seat_number:number}
type Duty={invigilator_person_id:string;standard_coordinator_person_id:string;exam_supervisor_person_id:string;rounds_staff_person_id:string;cleaner_person_id:string}
type DutySlot={key:string;room_id:string;room_name:string;exam_name:string;exam_date:string;start_time:string;end_time:string}
const band=(name:string)=>{const n=Number((name.match(/\\d+/)||[])[0]||0);return n<=5?0:n<=8?1:n<=10?2:3}
const slotKey=(s:{room_id:string;exam_date:string;start_time:string;end_time:string})=>[s.room_id,s.exam_date,s.start_time,s.end_time].join('|')
const emptyDuty=():Duty=>({invigilator_person_id:'',standard_coordinator_person_id:'',exam_supervisor_person_id:'',rounds_staff_person_id:'',cleaner_person_id:''})

export default function SeatAllotment({schoolId,academicYear,notify}:{schoolId:string;academicYear:string;notify:(message:string)=>void}){
 const [exams,setExams]=useState<Exam[]>([])
 const [rooms,setRooms]=useState<Room[]>([])
 const [people,setPeople]=useState<Person[]>([])
 const [otherBookings,setOtherBookings]=useState<any[]>([])
 const [students,setStudents]=useState<Person[]>([])
 const [examName,setExamName]=useState('')
 const [selectedStandards,setSelectedStandards]=useState<string[]>([])
 const [studentsPerBench,setStudentsPerBench]=useState('2')
 const [plan,setPlan]=useState<Seat[]>([])
 const [duties,setDuties]=useState<Record<string,Duty>>({})
 const [loading,setLoading]=useState(true)
 const [generating,setGenerating]=useState(false)
 const [saving,setSaving]=useState(false)
 const [error,setError]=useState('')
 const [savedAt,setSavedAt]=useState('')
 const load=async()=>{
  setLoading(true);setError('')
  const [examRes,roomRes,peopleRes,studentRes,seatRes,dutyRes,bookingRes]=await Promise.all([
   supabase.from('school_exam_schedules').select('id,exam_name,standard_name,section_name,subject_name,exam_date,start_time,end_time').eq('school_id',schoolId).eq('academic_year',academicYear).order('exam_date'),
   supabase.from('school_exam_rooms').select('id,room_name,capacity,is_active').eq('school_id',schoolId).eq('is_active',true).order('room_name'),
   supabase.from('school_people').select('person_id,full_name,record_type,details').eq('school_id',schoolId).in('record_type',['Teacher','Staff','Driver & Cleaner']).order('full_name'),
   supabase.from('school_people').select('person_id,full_name,record_type,details').eq('school_id',schoolId).eq('record_type','Student').order('full_name'),
   supabase.from('school_exam_seat_assignments').select('id,exam_schedule_id,student_person_id,room_id,exam_date,start_time,end_time,bench_number,seat_number,school_exam_schedules(exam_name,standard_name,section_name,subject_name),school_exam_rooms(room_name)').eq('school_id',schoolId).order('exam_date'),
   supabase.from('school_exam_room_duties').select('room_id,exam_date,start_time,end_time,invigilator_person_id,standard_coordinator_person_id,exam_supervisor_person_id,rounds_staff_person_id,cleaner_person_id').eq('school_id',schoolId),
   supabase.from('school_exam_plan_allocations').select('exam_schedule_id,room_id,exam_date,start_time,end_time,school_exam_schedules(exam_name,standard_name)').eq('school_id',schoolId)
  ])
  const failed=[examRes,roomRes,peopleRes,studentRes,seatRes,dutyRes,bookingRes].find(x=>x.error)
  if(failed?.error){setError(failed.error.message);setLoading(false);return}
  const examRows=(examRes.data||[]) as Exam[]
  const studentRows=(studentRes.data||[]) as Person[]
  setExams(examRows);setRooms((roomRes.data||[]) as Room[]);setPeople((peopleRes.data||[]) as Person[]);setStudents(studentRows);setOtherBookings((bookingRes.data||[]) as any[])
  const names=[...new Set(examRows.map(e=>e.exam_name))]
  setExamName(current=>names.includes(current)?current:(names[0]||''))
  const seats=(seatRes.data||[]) as any[]
  if(seats.length){
   setPlan(seats.map(row=>{const exam=row.school_exam_schedules||{};const student=studentRows.find(s=>s.person_id===row.student_person_id);const room=(roomRes.data||[]).find((r:any)=>r.id===row.room_id);return {exam_schedule_id:row.exam_schedule_id,exam_name:exam.exam_name||'',standard_name:exam.standard_name||'',section_name:exam.section_name||'',subject_name:exam.subject_name||'',student_person_id:row.student_person_id,student_name:student?.full_name||row.student_person_id,room_id:row.room_id,room_name:row.school_exam_rooms?.room_name||room?.room_name||'Room',exam_date:row.exam_date,start_time:row.start_time,end_time:row.end_time,bench_number:row.bench_number,seat_number:row.seat_number}}))
   setSavedAt('Existing saved seating plan loaded')
  }else{setPlan([]);setSavedAt('')}
  const dutyMap:Record<string,Duty>={}
  for(const d of (dutyRes.data||[]) as any[]){dutyMap[slotKey(d)]={invigilator_person_id:d.invigilator_person_id||'',standard_coordinator_person_id:d.standard_coordinator_person_id||'',exam_supervisor_person_id:d.exam_supervisor_person_id||'',rounds_staff_person_id:d.rounds_staff_person_id||'',cleaner_person_id:d.cleaner_person_id||''}}
  setDuties(dutyMap);setLoading(false)
 }
 useEffect(()=>{void load()},[schoolId,academicYear])
 const examNames=useMemo(()=>[...new Set(exams.map(e=>e.exam_name))],[exams])
 const availableStandards=useMemo(()=>[...new Set(exams.filter(e=>e.exam_name===examName).map(e=>e.standard_name))].sort((a,b)=>band(a)-band(b)||a.localeCompare(b)),[exams,examName])
 useEffect(()=>{setSelectedStandards(current=>current.filter(s=>availableStandards.includes(s)).length?current.filter(s=>availableStandards.includes(s)):availableStandards)},[availableStandards])
 const sessions=useMemo(()=>{const selected=exams.filter(e=>e.exam_name===examName&&selectedStandards.includes(e.standard_name));return [...new Map(selected.map(e=>[[e.exam_date,e.start_time||'',e.end_time||''].join('|'),{date:e.exam_date,start:e.start_time||'',end:e.end_time||'',exams:selected.filter(x=>x.exam_date===e.exam_date&&(x.start_time||'')===(e.start_time||'')&&(x.end_time||'')===(e.end_time||''))}])).values()]},[exams,examName,selectedStandards])
 const dutySlots=useMemo(()=>[...new Map(plan.map(s=>{const key=slotKey(s);return [key,{key,room_id:s.room_id,room_name:s.room_name,exam_name:s.exam_name,exam_date:s.exam_date,start_time:s.start_time,end_time:s.end_time} as DutySlot]}))].map(x=>x[1]),[plan])
 const teachers=people.filter(p=>p.record_type==='Teacher')
 const staff=people.filter(p=>p.record_type==='Staff')
 const cleaners=people.filter(p=>p.record_type==='Driver & Cleaner'&&String(p.details?.work_role||'').toLowerCase()==='cleaner')
 const setDuty=(key:string,field:keyof Duty,value:string)=>setDuties(current=>({...current,[key]:{...(current[key]||emptyDuty()),[field]:value}}))
 const generate=()=>{
  if(!examName||!selectedStandards.length){notify('Select an exam and at least one standard.');return}
  if(!rooms.length){notify('Register exam rooms and their capacities before seat allotment.');return}
  const perBench=Math.max(1,Math.min(4,Number(studentsPerBench)||2))
  setGenerating(true);setError('')
  try{
   const next:Seat[]=[]
   const localBookings:{room_id:string;date:string;start:string;end:string}[]=[]
   const selectedScheduleIds=new Set(sessions.flatMap(session=>session.exams.map(exam=>exam.id)))
   const minutes=(value:string)=>{const [h,m]=value.slice(0,5).split(':').map(Number);return h*60+m}
   const overlaps=(aStart:string,aEnd:string,bStart:string,bEnd:string)=>minutes(aStart)<minutes(bEnd)&&minutes(aEnd)>minutes(bStart)
   for(const session of sessions){
    const cohortMap=new Map<string,Person[]>()
    for(const exam of session.exams){
     const cohort=students.filter(s=>s.details?.joining_standard===exam.standard_name&&(s.details?.section||'')===exam.section_name)
     cohortMap.set(exam.id,cohort)
    }
    const cohortEntries=[...cohortMap.entries()].sort((a,b)=>{const ea=session.exams.find(e=>e.id===a[0])!;const eb=session.exams.find(e=>e.id===b[0])!;return band(ea.standard_name)-band(eb.standard_name)||ea.standard_name.localeCompare(eb.standard_name)||ea.section_name.localeCompare(eb.section_name)})
    const ordered: {exam:Exam;student:Person}[]=[]
    let index=0
    while(cohortEntries.some(([,list])=>list[index])){
     for(const [examId,list] of cohortEntries){const student=list[index];if(student){const exam=session.exams.find(e=>e.id===examId)!;ordered.push({exam,student})}}
     index++
    }
    const roomPool=rooms.filter(room=>!otherBookings.some(booking=>booking.room_id===room.id&&booking.exam_date===session.date&&!selectedScheduleIds.has(booking.exam_schedule_id)&&overlaps(session.start,session.end,booking.start_time,booking.end_time))&&!localBookings.some(booking=>booking.room_id===room.id&&booking.date===session.date&&overlaps(session.start,session.end,booking.start,booking.end))).sort((a,b)=>b.capacity-a.capacity)
    const totalCapacity=roomPool.reduce((sum,r)=>sum+r.capacity,0)
    if(ordered.length>totalCapacity)throw new Error(session.date+': '+ordered.length+' students need seats, but active exam rooms have only '+totalCapacity+' seats.')
    let cursor=0
    for(const room of roomPool){
     const roomStudents=ordered.slice(cursor,cursor+room.capacity);cursor+=roomStudents.length
     if(roomStudents.length)localBookings.push({room_id:room.id,date:session.date,start:session.start,end:session.end})
     roomStudents.forEach((item,seatIndex)=>next.push({exam_schedule_id:item.exam.id,exam_name:item.exam.exam_name,standard_name:item.exam.standard_name,section_name:item.exam.section_name,subject_name:item.exam.subject_name,student_person_id:item.student.person_id,student_name:item.student.full_name,room_id:room.id,room_name:room.room_name,exam_date:session.date,start_time:session.start,end_time:session.end,bench_number:Math.floor(seatIndex/perBench)+1,seat_number:(seatIndex%perBench)+1}))
     if(cursor>=ordered.length)break
    }
   }
   if(!next.length)throw new Error('No students were found in the selected exam standards. Check student standard and section records.')
   setPlan(next);setSavedAt('Draft generated — save to store this plan');notify('Seat plan generated. Standards are mixed by class group and room capacity.')
  }catch(e){const message=e instanceof Error?e.message:'Could not generate seat plan.';setError(message);notify(message)}
  finally{setGenerating(false)}
 }
 const save=async()=>{
  if(!plan.length)return
  setSaving(true);setError('')
  const rows=plan.map(s=>({exam_schedule_id:s.exam_schedule_id,student_person_id:s.student_person_id,room_id:s.room_id,exam_date:s.exam_date,start_time:s.start_time,end_time:s.end_time,bench_number:s.bench_number,seat_number:s.seat_number}))
  const dutyRows=dutySlots.map(slot=>({room_id:slot.room_id,exam_date:slot.exam_date,start_time:slot.start_time,end_time:slot.end_time,exam_name:slot.exam_name,...(duties[slot.key]||emptyDuty())}))
  const {data,error}=await supabase.rpc('save_school_exam_seat_plan',{p_school_id:schoolId,p_seats:rows,p_duties:dutyRows})
  setSaving(false)
  if(error){setError(error.message);notify('Seat plan could not be saved: '+error.message);return}
  setSavedAt('Saved just now');notify('Seat allotment and room duties saved ('+String(data??rows.length)+' student seats).');await load()
 }
 const roomGroups=dutySlots
 return <section className="workspace-panel seat-allotment" style={{display:'grid',gap:18}}>
  <div className="workspace-heading"><div><span className="section-eyebrow">EXAM OPERATIONS</span><h2>Seat Allotment</h2><p>Mix selected standards in the same exam rooms, allocate bench seats and assign room duties.</p></div><span className="count-pill">{academicYear}</span></div>
  {error&&<div className="qr-error">{error}</div>}
  <div className="people-form"><div className="people-form-grid">
   <label>Upcoming exam<select value={examName} onChange={e=>{setExamName(e.target.value);setPlan([])}}><option value="">Select exam</option>{examNames.map(n=><option key={n}>{n}</option>)}</select></label>
   <label>Students per bench<select value={studentsPerBench} onChange={e=>setStudentsPerBench(e.target.value)}>{[1,2,3,4].map(n=><option key={n} value={n}>{n} student{n>1?'s':''} per bench</option>)}</select></label>
  </div>
  <div style={{display:'flex',gap:8,flexWrap:'wrap',marginTop:12}}><b style={{fontSize:12}}>Standards to mix:</b>{availableStandards.map(s=><label key={s} style={{display:'inline-flex',alignItems:'center',gap:5,fontSize:12}}><input type="checkbox" checked={selectedStandards.includes(s)} onChange={e=>setSelectedStandards(current=>e.target.checked?[...current,s]:current.filter(x=>x!==s))}/>{s}</label>)}</div>
  <div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap',marginTop:14}}><button className="primary-action" type="button" onClick={generate} disabled={loading||generating}>{generating?'Generating…':<><Sparkles size={15}/> Generate mixed seat plan</>}</button><button className="secondary-action" type="button" onClick={()=>void load()} disabled={loading}>Refresh</button><span className="field-hint">{rooms.length} active rooms · {students.length} student records</span></div></div>
  {loading?<p>Loading exam, room and student records…</p>:!exams.length?<div className="empty-module"><CalendarDays/><b>No exam schedule yet</b><span>Create and publish an exam schedule first.</span></div>:null}
  {plan.length>0&&<><div className="ex-toolbar"><b>{plan.length} student seats planned</b><span className="field-hint">{savedAt}</span></div>
   <div className="ex-table"><table><thead><tr><th>Date / Time</th><th>Room</th><th>Bench</th><th>Seat</th><th>Standard</th><th>Section</th><th>Student</th><th>Subject</th></tr></thead><tbody>{plan.map((s,i)=><tr key={s.exam_schedule_id+'-'+s.student_person_id}><td>{s.exam_date}<br/>{s.start_time.slice(0,5)}–{s.end_time.slice(0,5)}</td><td>{s.room_name}</td><td>{s.bench_number}</td><td>{s.seat_number}</td><td>{s.standard_name}</td><td>{s.section_name}</td><td>{s.student_name}<small>{s.student_person_id}</small></td><td>{s.subject_name}</td></tr>)}</tbody></table></div>
   <div className="workspace-panel" style={{padding:14}}><h3>Invigilator & exam duty assignment</h3><p className="field-hint">Assign each room for the scheduled date and time. You can save the seating plan and room duties together.</p>
    {roomGroups.map(slot=><div key={slot.key} style={{border:'1px solid var(--line)',borderRadius:10,padding:12,marginTop:10}}><b>{slot.exam_date} · {slot.start_time.slice(0,5)}–{slot.end_time.slice(0,5)} · {slot.room_name}</b><div className="people-form-grid" style={{marginTop:10}}>
     {([{field:'invigilator_person_id',label:'Invigilator',list:teachers},{field:'standard_coordinator_person_id',label:'Standard coordinator',list:teachers},{field:'exam_supervisor_person_id',label:'Exam supervisor',list:staff},{field:'rounds_staff_person_id',label:'Rounds staff',list:staff},{field:'cleaner_person_id',label:'Cleaner',list:cleaners}] as const).map(item=><label key={item.field}>{item.label}<select value={(duties[slot.key]||emptyDuty())[item.field]} onChange={e=>setDuty(slot.key,item.field,e.target.value)}><option value="">Select {item.label.toLowerCase()}</option>{item.list.map(p=><option key={p.person_id} value={p.person_id}>{p.full_name}</option>)}</select></label>)}
    </div></div>)}
   </div>
   <button className="primary-action" type="button" onClick={()=>void save()} disabled={saving}>{saving?'Saving…':<><CheckCircle2 size={15}/> Save seat allotment & duties</>}</button>
  </>}
 </section>
}
