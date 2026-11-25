import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { ArrowLeft, CalendarDays, Check, Clock3, Cpu, Plus, RefreshCw, Save, ShieldCheck, Sparkles, Users, WandSparkles } from 'lucide-react'
import { supabase } from '../lib/supabase'

type Standard={name:string;sections:string[]}
type Teacher={id:string;name:string}
type Period={id:string;period_number:number;period_label:string;start_time:string;end_time:string;is_break:boolean;is_active:boolean}
type Room={id:string;room_code:string;room_name:string;room_type:string;capacity:number;is_active:boolean}
type Subject={id:string;standard_name:string;subject_name:string;subject_type:string}
type Requirement={id:string;standard_name:string;section_name:string;subject_id:string;weekly_periods:number;double_periods:number;room_type:string;cognitive_load:string;combined_group_key:string|null}
type Assignment={teacher_person_id:string;standard_name:string;section_name:string;subject_name:string|null;is_active:boolean}
type Workload={teacher_person_id:string;max_daily_periods:number;max_weekly_periods:number}
type FixedBlock={id:string;standard_name:string|null;section_name:string|null;day_of_week:number;period_number:number;block_type:string;label:string;teacher_person_id:string|null;room_id:string|null}
type TimetableRow={id:string;standard_name:string;section_name:string;day_of_week:number;period_number:number;start_time:string;end_time:string;subject_id:string;teacher_person_id:string|null;room_id:string|null;room_type:string;room_label:string|null;is_locked:boolean;source:string;generated_run_id:string|null;is_double_period:boolean;double_group_id:string|null}
type Lesson={key:string;requirement:Requirement;subject:Subject;length:number;doubleGroup:string|null}
type Placement={key:string;standard_name:string;section_name:string;subject_id:string;subject_name:string;teacher_person_id:string;room_id:string;room_type:string;day_of_week:number;period_number:number;start_time:string;end_time:string;is_double_period:boolean;double_group_id:string|null}
type Candidate={day:number;periods:Period[];teacher:Teacher;room:Room}
type Props={schoolId:string;academicYear:string;standards:Standard[];teachers:Teacher[];notify:(message:string)=>void;canManage:boolean;onClose:()=>void}
const DAY_NAMES=['','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']
const ROOM_TYPES=['classroom','computer_lab','chemistry_lab','physics_lab','biology_lab','library','auditorium','playground','other']
const roomLabel=(value:string)=>value.replace(/_/g,' ').replace(/\b\w/g,(c:string)=>c.toUpperCase())
const time=(value:string)=>value?.slice(0,5)||'—'
const overlap=(a:{start_time:string;end_time:string},b:{start_time:string;end_time:string})=>a.start_time<b.end_time&&a.end_time>b.start_time
const slotKey=(standard:string,section:string,day:number,period:number)=>standard+'|'+section+'|'+day+'|'+period
const teacherKey=(teacher:string,day:number,period:number)=>teacher+'|'+day+'|'+period
const roomKey=(room:string,day:number,period:number)=>room+'|'+day+'|'+period
const defaultPeriods=[
 ['1','Period 1','09:00','09:45',false],['2','Period 2','09:45','10:30',false],
 ['3','Period 3','10:30','11:15',false],['4','Period 4','11:15','12:00',false],
 ['5','Lunch Break','12:00','12:45',true],['6','Period 5','12:45','13:30',false],
 ['7','Period 6','13:30','14:15',false],['8','Period 7','14:15','15:00',false],
 ['9','Period 8','15:00','15:45',false],
] as const

export default function AITimetableScheduler({schoolId,academicYear,standards,teachers,notify,canManage,onClose}:Props){
 const [periods,setPeriods]=useState<Period[]>([])
 const [rooms,setRooms]=useState<Room[]>([])
 const [subjects,setSubjects]=useState<Subject[]>([])
 const [requirements,setRequirements]=useState<Requirement[]>([])
 const [assignments,setAssignments]=useState<Assignment[]>([])
 const [workloads,setWorkloads]=useState<Workload[]>([])
 const [fixedBlocks,setFixedBlocks]=useState<FixedBlock[]>([])
 const [timetable,setTimetable]=useState<TimetableRow[]>([])
 const [studentCounts,setStudentCounts]=useState<Record<string,number>>({})
 const [loading,setLoading]=useState(true)
 const [saving,setSaving]=useState(false)
 const [error,setError]=useState('')
 const [tab,setTab]=useState<'setup'|'generate'|'proxy'>('setup')
 const [selectedStandard,setSelectedStandard]=useState(standards[0]?.name||'')
 const [selectedSection,setSelectedSection]=useState(standards[0]?.sections[0]||'')
 const [periodForm,setPeriodForm]=useState({period_number:'10',period_label:'Period 9',start_time:'15:45',end_time:'16:30',is_break:false})
 const [roomForm,setRoomForm]=useState({room_code:'',room_name:'',room_type:'classroom',capacity:'40'})
 const [fixedForm,setFixedForm]=useState({standard_name:'',section_name:'',day_of_week:'1',period_number:'5',block_type:'assembly',label:'Morning Assembly',teacher_person_id:'',room_id:''})
 const [result,setResult]=useState<Placement[]|null>(null)
 const [score,setScore]=useState(0)
 const [solverMessage,setSolverMessage]=useState('')
 const [date,setDate]=useState(new Date().toISOString().slice(0,10))
 const [absenceTeacher,setAbsenceTeacher]=useState('')
 const [absenceReason,setAbsenceReason]=useState('')
 const [absentTeachers,setAbsentTeachers]=useState<string[]>([])
 const [proxyRows,setProxyRows]=useState<any[]>([])
 const [proxyCandidates,setProxyCandidates]=useState<Record<string,Teacher[]>>({})
 const [proxyChoice,setProxyChoice]=useState<Record<string,string>>({})
 const [proxyReason,setProxyReason]=useState('')
 const sections=useMemo(()=>standards.find(s=>s.name===selectedStandard)?.sections||[],[standards,selectedStandard])
 const activePeriods=useMemo(()=>periods.filter(p=>p.is_active).sort((a,b)=>a.period_number-b.period_number),[periods])
 const activeSubjects=useMemo(()=>subjects.filter(s=>s.standard_name===selectedStandard),[subjects,selectedStandard])
 const requirementsForSection=useMemo(()=>requirements.filter(r=>r.standard_name===selectedStandard&&r.section_name===selectedSection),[requirements,selectedStandard,selectedSection])
 const load=useCallback(async()=>{
  setLoading(true);setError('')
  const results=await Promise.all([
   supabase.from('school_timetable_periods').select('id,period_number,period_label,start_time,end_time,is_break,is_active').eq('school_id',schoolId).eq('academic_year',academicYear).order('period_number'),
   supabase.from('school_timetable_rooms').select('id,room_code,room_name,room_type,capacity,is_active').eq('school_id',schoolId).order('room_name'),
   supabase.from('school_academic_subjects').select('id,standard_name,subject_name,subject_type').eq('school_id',schoolId).eq('academic_year',academicYear).eq('is_active',true).order('standard_name').order('subject_name'),
   supabase.from('school_subject_period_requirements').select('id,standard_name,section_name,subject_id,weekly_periods,double_periods,room_type,cognitive_load,combined_group_key').eq('school_id',schoolId).eq('academic_year',academicYear).eq('is_active',true),
   supabase.from('school_teacher_class_assignments').select('teacher_person_id,standard_name,section_name,subject_name,is_active').eq('school_id',schoolId).eq('is_active',true),
   supabase.from('school_teacher_workload_limits').select('teacher_person_id,max_daily_periods,max_weekly_periods').eq('school_id',schoolId),
   supabase.from('school_timetable_fixed_blocks').select('id,standard_name,section_name,day_of_week,period_number,block_type,label,teacher_person_id,room_id').eq('school_id',schoolId).eq('academic_year',academicYear),
   supabase.from('school_academic_timetable').select('id,standard_name,section_name,day_of_week,period_number,start_time,end_time,subject_id,teacher_person_id,room_id,room_type,room_label,is_locked,source,generated_run_id,is_double_period,double_group_id').eq('school_id',schoolId).eq('academic_year',academicYear),
   supabase.rpc('get_school_section_strengths',{p_school_id:schoolId}),
  ])
  const failed=results.find(r=>r.error)
  if(failed?.error){setError(failed.error.message);setLoading(false);return}
  const [p,r,s,q,a,w,b,t,students]=results
  setPeriods((p.data||[]) as Period[]);setRooms((r.data||[]) as Room[]);setSubjects((s.data||[]) as Subject[])
  setRequirements((q.data||[]) as Requirement[]);setAssignments((a.data||[]) as Assignment[])
  setWorkloads((w.data||[]) as Workload[]);setFixedBlocks((b.data||[]) as FixedBlock[]);setTimetable((t.data||[]) as TimetableRow[])
  const counts:Record<string,number>={}
  ;(students.data||[]).forEach((student:any)=>{const standard=student.standard_name;const section=student.section_name;if(standard&&section){const key=standard+'|'+section;counts[key]=Number(student.student_count)||0}})
  setStudentCounts(counts)
  if(!(p.data||[]).length&&canManage){
   const payload=defaultPeriods.map(([number,label,start,end,isBreak])=>({school_id:schoolId,academic_year:academicYear,period_number:Number(number),period_label:label,start_time:start,end_time:end,is_break:isBreak,is_active:true}))
   const {error:seedError}=await supabase.from('school_timetable_periods').insert(payload)
   if(!seedError){const {data}=await supabase.from('school_timetable_periods').select('id,period_number,period_label,start_time,end_time,is_break,is_active').eq('school_id',schoolId).eq('academic_year',academicYear).order('period_number');setPeriods((data||[]) as Period[])}
  }
  setLoading(false)
 },[schoolId,academicYear,canManage])
 useEffect(()=>{void load()},[load])
 useEffect(()=>{if(!sections.includes(selectedSection))setSelectedSection(sections[0]||'')},[sections,selectedSection])
 const savePeriod=async(e:FormEvent)=>{e.preventDefault();const payload={school_id:schoolId,academic_year:academicYear,period_number:Number(periodForm.period_number),period_label:periodForm.period_label.trim(),start_time:periodForm.start_time,end_time:periodForm.end_time,is_break:periodForm.is_break};const {error}=await supabase.from('school_timetable_periods').upsert(payload,{onConflict:'school_id,academic_year,period_number'});if(error){notify('Could not save period: '+error.message);return}notify('Time-grid period saved.');await load()}
 const saveRoom=async(e:FormEvent)=>{e.preventDefault();const {error}=await supabase.from('school_timetable_rooms').insert({school_id:schoolId,...roomForm,capacity:Number(roomForm.capacity)});if(error){notify('Could not save room: '+error.message);return}setRoomForm({room_code:'',room_name:'',room_type:'classroom',capacity:'40'});notify('Room added.');await load()}
 const saveRequirement=async(subject:Subject,form:Partial<Requirement>)=>{const current=requirementsForSection.find(r=>r.subject_id===subject.id);const payload={school_id:schoolId,academic_year:academicYear,standard_name:selectedStandard,section_name:selectedSection,subject_id:subject.id,weekly_periods:Math.max(1,Number(form.weekly_periods??current?.weekly_periods??5)),double_periods:Math.max(0,Number(form.double_periods??current?.double_periods??0)),room_type:form.room_type??current?.room_type??(subject.subject_type==='Practical / Lab'?'computer_lab':'classroom'),cognitive_load:form.cognitive_load??current?.cognitive_load??(/math|physics|chemistry/i.test(subject.subject_name)?'heavy':'normal'),combined_group_key:form.combined_group_key??current?.combined_group_key??null};if(payload.double_periods*2>payload.weekly_periods){notify('Double sessions cannot exceed the weekly period quota.');return}const {error}=await supabase.from('school_subject_period_requirements').upsert(payload,{onConflict:'school_id,academic_year,standard_name,section_name,subject_id'});if(error){notify('Could not save subject quota: '+error.message);return}notify('Weekly subject allocation saved.');await load()}
 const saveWorkload=async(teacher:Teacher,maxDaily:number,maxWeekly:number)=>{const {error}=await supabase.from('school_teacher_workload_limits').upsert({school_id:schoolId,teacher_person_id:teacher.id,max_daily_periods:maxDaily,max_weekly_periods:maxWeekly},{onConflict:'school_id,teacher_person_id'});if(error){notify('Could not save teacher workload: '+error.message);return}notify('Teacher workload limits saved.');await load()}
 const saveFixed=async(e:FormEvent)=>{e.preventDefault();const {error}=await supabase.from('school_timetable_fixed_blocks').insert({school_id:schoolId,academic_year:academicYear,standard_name:fixedForm.standard_name||null,section_name:fixedForm.section_name||null,day_of_week:Number(fixedForm.day_of_week),period_number:Number(fixedForm.period_number),block_type:fixedForm.block_type,label:fixedForm.label.trim(),teacher_person_id:fixedForm.teacher_person_id||null,room_id:fixedForm.room_id||null});if(error){notify('Could not save fixed event: '+error.message);return}notify('Fixed timetable event saved.');await load()}
 const matchingTeachers=(req:Requirement,subject:Subject)=>teachers.filter(t=>assignments.some(a=>a.teacher_person_id===t.id&&a.standard_name===req.standard_name&&a.section_name===req.section_name&&(!a.subject_name||a.subject_name===subject.subject_name)))
 const scoreSchedule=(rows:Placement[])=>{
  let penalty=0
  const bySectionDay:Record<string,Placement[]>={},byTeacherDay:Record<string,Placement[]>={}
  rows.forEach(row=>{const sd=row.standard_name+'|'+row.section_name+'|'+row.day_of_week;(bySectionDay[sd]??=[]).push(row);const td=row.teacher_person_id+'|'+row.day_of_week;(byTeacherDay[td]??=[]).push(row)})
  Object.values(bySectionDay).forEach(list=>{const count:Record<string,number>={};list.forEach(row=>{count[row.subject_id]=(count[row.subject_id]||0)+1});Object.values(count).forEach(n=>{if(n>1)penalty+=(n-1)*12})})
  rows.forEach(row=>{if(/heavy/i.test(requirements.find(r=>r.subject_id===row.subject_id&&r.standard_name===row.standard_name&&r.section_name===row.section_name)?.cognitive_load||'')&&row.period_number>4)penalty+=4;if(/light/i.test(requirements.find(r=>r.subject_id===row.subject_id&&r.standard_name===row.standard_name&&r.section_name===row.section_name)?.cognitive_load||'')&&row.period_number<=4)penalty+=2})
  Object.values(byTeacherDay).forEach(list=>{const periods=list.flatMap(x=>x.is_double_period?[x.period_number,x.period_number+1]:[x.period_number]).sort((a,b)=>a-b);let consecutive=1;for(let i=1;i<periods.length;i++){if(periods[i]===periods[i-1]+1){consecutive++;if(consecutive>3)penalty+=8}else consecutive=1}const unique=[...new Set(periods)];for(let i=1;i<unique.length-1;i++){if(unique[i+1]-unique[i]>1)penalty+=1}})
  return penalty
 }
 const generate=()=>{
  setSolverMessage('Checking constraints and building lesson blocks…');setResult(null)
  if(!activePeriods.length||!requirements.length||!rooms.some(r=>r.is_active)){setSolverMessage('Complete the time grid, subject quotas and room register before generating.');return}
  const periodsTeaching=activePeriods.filter(p=>!p.is_break)
  const existing=timetable.filter(t=>t.is_locked||t.source!=='ai')
  const lessons:Lesson[]=[]
  for(const req of requirements){
   const subject=subjects.find(s=>s.id===req.subject_id);if(!subject)continue
   if(req.double_periods*2>req.weekly_periods){setSolverMessage('Invalid quota: double periods exceed the weekly total.');return}
   const prior=existing.filter(row=>row.standard_name===req.standard_name&&row.section_name===req.section_name&&row.subject_id===req.subject_id)
   const used=prior.length
   const usedDoubles=new Set(prior.map(row=>row.double_group_id).filter(Boolean)).size
   const remaining=req.weekly_periods-used
   const remainingDoubles=Math.max(0,req.double_periods-usedDoubles)
   if(remaining<0||remainingDoubles*2>remaining){setSolverMessage('Existing locked lessons already exceed the quota for '+subject.subject_name+' · '+req.standard_name+' '+req.section_name+'. Adjust the quota or unlock/remove the extra manual lessons.');return}
   for(let i=0;i<remainingDoubles;i++)lessons.push({key:req.id+'-D'+i,requirement:req,subject,length:2,doubleGroup:crypto.randomUUID()})
   for(let i=0;i<remaining-remainingDoubles*2;i++)lessons.push({key:req.id+'-S'+i,requirement:req,subject,length:1,doubleGroup:null})
  }
  if(!lessons.length){setSolverMessage('Add weekly subject period requirements first.');return}
  const occupiedSection=new Set<string>(),occupiedTeacher=new Set<string>(),occupiedRoom=new Set<string>()
  const teacherDay:Record<string,number>={},teacherWeek:Record<string,number>={}
  const fixedAt=(std:string,sec:string,day:number,period:number,teacherId?:string,roomId?:string)=>fixedBlocks.some(b=>b.day_of_week===day&&b.period_number===period&&((!!b.standard_name&&b.standard_name===std&&(!b.section_name||b.section_name===sec))||(!b.standard_name&&!b.teacher_person_id&&!b.room_id)||(!!teacherId&&b.teacher_person_id===teacherId)||(!!roomId&&b.room_id===roomId)))
  existing.forEach(row=>{const length=1;occupiedSection.add(slotKey(row.standard_name,row.section_name,row.day_of_week,row.period_number));if(row.teacher_person_id)occupiedTeacher.add(teacherKey(row.teacher_person_id,row.day_of_week,row.period_number));if(row.room_id)occupiedRoom.add(roomKey(row.room_id,row.day_of_week,row.period_number));if(row.teacher_person_id){const k=row.teacher_person_id+'|'+row.day_of_week;teacherDay[k]=(teacherDay[k]||0)+length;teacherWeek[row.teacher_person_id]=(teacherWeek[row.teacher_person_id]||0)+length}})
  const teacherLimit=(id:string)=>workloads.find(w=>w.teacher_person_id===id)||{max_daily_periods:6,max_weekly_periods:30}
  const domains=lessons.map(lesson=>{
   const req=lesson.requirement;const candidates=matchingTeachers(req,lesson.subject);const eligibleRooms=rooms.filter(r=>r.is_active&&r.room_type===req.room_type&&(r.capacity>=(studentCounts[req.standard_name+'|'+req.section_name]||0)))
   const slots:Candidate[]=[]
   for(let day=1;day<=6;day++)for(const p of periodsTeaching){const p2=lesson.length===2?periodsTeaching.find(x=>x.period_number===p.period_number+1):undefined;if(lesson.length===2&&(!p2||p.end_time!==p2.start_time))continue;const blockPeriods=lesson.length===2?[p,p2!]:[p];for(const teacher of candidates)for(const room of eligibleRooms){if(blockPeriods.some(x=>fixedAt(req.standard_name,req.section_name,day,x.period_number,teacher.id,room.id)))continue;slots.push({day,periods:blockPeriods,teacher,room})}}
   return {lesson,slots}
  })
  const impossible=domains.find(d=>!d.slots.length)
  if(impossible){setSolverMessage('Cannot schedule '+impossible.lesson.subject.subject_name+' for '+impossible.lesson.requirement.standard_name+' '+impossible.lesson.requirement.section_name+'. Check teacher allotment, room type/capacity, fixed periods and double-period adjacency.');return}
  domains.sort((a,b)=>a.slots.length-b.slots.length||b.lesson.length-a.lesson.length)
  const placed:Placement[]=[];let nodes=0;let solved=false
  const softLocal=(candidate:Candidate,lesson:Lesson)=>{let cost=0;const req=lesson.requirement;const existingSame=placed.filter(x=>x.standard_name===req.standard_name&&x.section_name===req.section_name&&x.day_of_week===candidate.day&&x.subject_id===lesson.subject.id).length;if(existingSame)cost+=existingSame*12;if(req.cognitive_load==='heavy'&&candidate.periods[0].period_number>4)cost+=4;if(req.cognitive_load==='light'&&candidate.periods[0].period_number<=4)cost+=2;const teacherPeriods=placed.filter(x=>x.teacher_person_id===candidate.teacher.id&&x.day_of_week===candidate.day).map(x=>x.period_number);if(teacherPeriods.length){const all=[...teacherPeriods,candidate.periods[0].period_number].sort((a,b)=>a-b);let streak=1;for(let i=1;i<all.length;i++){if(all[i]===all[i-1]+1){streak++;if(streak>3)cost+=8}else streak=1}}return cost}
  const recurse=(index:number):boolean=>{
   if(index>=domains.length){solved=true;return true}if(++nodes>90000)return false
   const {lesson,slots}=domains[index];const req=lesson.requirement;const options=slots.slice().sort((a,b)=>softLocal(a,lesson)-softLocal(b,lesson))
   for(const c of options){if(nodes>90000)break;const limit=teacherLimit(c.teacher.id);const dayKey=c.teacher.id+'|'+c.day;const valid=c.periods.every(p=>!occupiedSection.has(slotKey(req.standard_name,req.section_name,c.day,p.period_number))&&!occupiedTeacher.has(teacherKey(c.teacher.id,c.day,p.period_number))&&!occupiedRoom.has(roomKey(c.room.id,c.day,p.period_number)))&&(teacherDay[dayKey]||0)+lesson.length<=limit.max_daily_periods&&(teacherWeek[c.teacher.id]||0)+lesson.length<=limit.max_weekly_periods
    if(!valid)continue
    c.periods.forEach(p=>{occupiedSection.add(slotKey(req.standard_name,req.section_name,c.day,p.period_number));occupiedTeacher.add(teacherKey(c.teacher.id,c.day,p.period_number));occupiedRoom.add(roomKey(c.room.id,c.day,p.period_number))})
    teacherDay[dayKey]=(teacherDay[dayKey]||0)+lesson.length;teacherWeek[c.teacher.id]=(teacherWeek[c.teacher.id]||0)+lesson.length
    placed.push({key:lesson.key,standard_name:req.standard_name,section_name:req.section_name,subject_id:lesson.subject.id,subject_name:lesson.subject.subject_name,teacher_person_id:c.teacher.id,room_id:c.room.id,room_type:req.room_type,day_of_week:c.day,period_number:c.periods[0].period_number,start_time:c.periods[0].start_time,end_time:c.periods[c.periods.length-1].end_time,is_double_period:lesson.length===2,double_group_id:lesson.doubleGroup})
    if(recurse(index+1))return true
    placed.pop();teacherDay[dayKey]-=lesson.length;teacherWeek[c.teacher.id]-=lesson.length
    c.periods.forEach(p=>{occupiedSection.delete(slotKey(req.standard_name,req.section_name,c.day,p.period_number));occupiedTeacher.delete(teacherKey(c.teacher.id,c.day,p.period_number));occupiedRoom.delete(roomKey(c.room.id,c.day,p.period_number))})
   }
   return false
  }
  recurse(0)
  if(!solved){setSolverMessage('No complete clash-free timetable found within the search limit ('+nodes.toLocaleString()+' search nodes). Review quotas, teacher workloads, rooms, fixed events and available periods.');return}
  const optimized=placed.slice()
  let best=scoreSchedule(optimized)
  // Local-search pass: swap single-period lessons inside the same section when every hard rule remains valid.
  const validSwap=(rows:Placement[])=>{
   const sec=new Set<string>(),tea=new Set<string>(),room=new Set<string>(),daily:Record<string,number>={},weekly:Record<string,number>={}
   for(const row of existing){sec.add(slotKey(row.standard_name,row.section_name,row.day_of_week,row.period_number));if(row.teacher_person_id){tea.add(teacherKey(row.teacher_person_id,row.day_of_week,row.period_number));const dk=row.teacher_person_id+'|'+row.day_of_week;daily[dk]=(daily[dk]||0)+1;weekly[row.teacher_person_id]=(weekly[row.teacher_person_id]||0)+1}if(row.room_id)room.add(roomKey(row.room_id,row.day_of_week,row.period_number))}
   for(const row of rows){
    const req=requirements.find(r=>r.standard_name===row.standard_name&&r.section_name===row.section_name&&r.subject_id===row.subject_id);if(!req)return false
    const keys=row.is_double_period?[row.period_number,row.period_number+1]:[row.period_number]
    for(const period of keys){const sk=slotKey(row.standard_name,row.section_name,row.day_of_week,period),tk=teacherKey(row.teacher_person_id,row.day_of_week,period),rk=roomKey(row.room_id,row.day_of_week,period);if(sec.has(sk)||tea.has(tk)||room.has(rk)||fixedAt(row.standard_name,row.section_name,row.day_of_week,period,row.teacher_person_id,row.room_id))return false;sec.add(sk);tea.add(tk);room.add(rk)}
    const dk=row.teacher_person_id+'|'+row.day_of_week;daily[dk]=(daily[dk]||0)+keys.length;weekly[row.teacher_person_id]=(weekly[row.teacher_person_id]||0)+keys.length;const lim=teacherLimit(row.teacher_person_id);if(daily[dk]>lim.max_daily_periods||weekly[row.teacher_person_id]>lim.max_weekly_periods)return false
   }
   return true
  }
  for(let pass=0;pass<4;pass++){let improved=false;for(let i=0;i<optimized.length&&!improved;i++)for(let j=i+1;j<optimized.length&&!improved;j++){const a=optimized[i],b=optimized[j];if(a.standard_name!==b.standard_name||a.section_name!==b.section_name||a.is_double_period||b.is_double_period)continue;const candidate=optimized.map((r,k)=>k===i?{...r,day_of_week:b.day_of_week,period_number:b.period_number,start_time:b.start_time,end_time:b.end_time}:k===j?{...r,day_of_week:a.day_of_week,period_number:a.period_number,start_time:a.start_time,end_time:a.end_time}:r);if(validSwap(candidate)){const next=scoreSchedule(candidate);if(next<best){optimized.splice(0,optimized.length,...candidate);best=next;improved=true}}}}
  setResult(optimized);setScore(best);setSolverMessage('Found a complete timetable with zero hard-constraint violations. '+nodes.toLocaleString()+' search nodes; local optimization complete.')
 }
 const saveGenerated=async()=>{
  if(!result?.length)return
  setSaving(true)
  const payload=result.flatMap(row=>periodsTeachingForRow(row,activePeriods).map(p=>({
   standard_name:row.standard_name,section_name:row.section_name,day_of_week:row.day_of_week,
   period_number:p.period_number,start_time:p.start_time,end_time:p.end_time,subject_id:row.subject_id,
   teacher_person_id:row.teacher_person_id,room_id:row.room_id,room_type:row.room_type,
   room_label:rooms.find(r=>r.id===row.room_id)?.room_name||null,
   is_double_period:row.is_double_period&&p.period_number===row.period_number,
   double_group_id:row.double_group_id,combined_group_key:null
  })))
  const {data:runId,error}=await supabase.rpc('save_school_timetable_run',{
   p_school_id:schoolId,p_academic_year:academicYear,p_lessons:payload,
   p_summary:{soft_penalty:score,lesson_blocks:result.length,period_rows:payload.length,sections:[...new Set(result.map(r=>r.standard_name+' '+r.section_name))]}
  })
  setSaving(false)
  if(error||!runId){notify('Could not save generated timetable: '+(error?.message||'No run ID returned'));return}
  notify('AI timetable saved atomically as a draft. Manual timetable entries were preserved.')
  setResult(null);await load()
 }
 const publish=async(runId:string)=>{const {error}=await supabase.rpc('publish_school_timetable_run',{p_school_id:schoolId,p_run_id:runId});if(error){notify('Timetable could not be published: '+error.message);return}notify('Timetable published. Exact quotas validated and all generated periods locked.');await load()}
 const markAbsent=async(e:FormEvent)=>{e.preventDefault();if(!absenceTeacher)return;const {error}=await supabase.from('school_timetable_teacher_absences').insert({school_id:schoolId,teacher_person_id:absenceTeacher,absence_date:date,reason:absenceReason||null});if(error){notify('Could not mark teacher absent: '+error.message);return}notify('Teacher absence recorded for '+date+'.');setAbsenceReason('');await loadProxy()}
 const loadProxy=async()=>{const [absenceResult,lessonResult,proxyResult]=await Promise.all([supabase.from('school_timetable_teacher_absences').select('teacher_person_id').eq('school_id',schoolId).eq('absence_date',date),supabase.from('school_academic_timetable').select('id,standard_name,section_name,day_of_week,period_number,start_time,end_time,subject_id,teacher_person_id').eq('school_id',schoolId).eq('academic_year',academicYear).eq('day_of_week',new Date(date+'T12:00:00').getDay()===0?7:new Date(date+'T12:00:00').getDay()),supabase.from('school_timetable_proxy_assignments').select('original_timetable_id,substitute_teacher_person_id,status,period_number').eq('school_id',schoolId).eq('replacement_date',date).eq('status','assigned')]);if(absenceResult.error||lessonResult.error||proxyResult.error){notify('Could not load proxy data.');return}const absent=(absenceResult.data||[]).map(x=>x.teacher_person_id);setAbsentTeachers(absent);const proxies=proxyResult.data||[];const lessons=(lessonResult.data||[]).filter(x=>absent.includes(x.teacher_person_id)&&!proxies.some(p=>p.original_timetable_id===x.id));setProxyRows(lessons);const choices:Record<string,Teacher[]>={};const day=new Date(date+'T12:00:00').getDay()||7;for(const lesson of lessons){const eligible=teachers.filter(t=>assignments.some(a=>a.teacher_person_id===t.id&&a.standard_name===lesson.standard_name&&a.section_name===lesson.section_name)&&!absent.includes(t.id)&&!proxies.some(p=>p.substitute_teacher_person_id===t.id&&p.period_number===lesson.period_number));const free=eligible.filter(t=>!(lessonResult.data||[]).some((row:any)=>row.teacher_person_id===t.id&&row.id!==lesson.id&&row.day_of_week===day&&row.start_time<lesson.end_time&&row.end_time>lesson.start_time));const scored=free.map(t=>({teacher:t,load:(lessonResult.data||[]).filter((x:any)=>x.teacher_person_id===t.id&&x.day_of_week===day).length+proxies.filter(p=>p.substitute_teacher_person_id===t.id).length,limit:workloads.find(w=>w.teacher_person_id===t.id)?.max_daily_periods||6,subjectRank:assignments.some(a=>a.teacher_person_id===t.id&&a.standard_name===lesson.standard_name&&a.section_name===lesson.section_name&&a.subject_name===subjects.find(s=>s.id===lesson.subject_id)?.subject_name)?0:1})).filter(x=>x.load<x.limit).sort((a,b)=>a.subjectRank-b.subjectRank||a.load-b.load).map(x=>x.teacher);choices[lesson.id]=scored}setProxyCandidates(choices)}
 useEffect(()=>{if(tab==='proxy')void loadProxy()},[tab,date,schoolId,academicYear,teachers,assignments,workloads,subjects])
 const assignProxy=async(lesson:TimetableRow|any)=>{const substitute=proxyChoice[lesson.id];if(!substitute){notify('Choose a proxy teacher.');return}const {error}=await supabase.rpc('assign_school_timetable_proxy',{p_school_id:schoolId,p_original_timetable_id:lesson.id,p_replacement_date:date,p_substitute_teacher_person_id:substitute,p_reason:proxyReason||null});if(error){notify('Proxy assignment rejected: '+error.message);return}notify('Proxy teacher assigned.');setProxyChoice(v=>({...v,[lesson.id]:''}));await loadProxy()}
 const currentRun=useMemo(()=>timetable.find(t=>t.source==='ai'&&t.generated_run_id)?.generated_run_id||'', [timetable])
 const latestRun=useState<any[]>([])[0]
 void latestRun
 if(loading)return <section className="workspace-panel ai-weekly"><div className="ai-weekly-head"><button onClick={onClose}><ArrowLeft size={16}/> Timetable</button><h2>AI Weekly Timetable</h2></div><p><RefreshCw size={15}/> Loading timetable resources…</p></section>
 return <section className="workspace-panel ai-weekly">
  <div className="ai-weekly-head"><div><span className="section-eyebrow">ACADEMIC PLANNING ENGINE</span><h2><WandSparkles size={22}/> AI Weekly Timetable</h2><p>Exact weekly subject quotas · hard clash prevention · soft-rule optimization · proxy substitution</p></div><button className="secondary-action" onClick={onClose}><ArrowLeft size={15}/> Back to manual timetable</button></div>
  {error&&<div className="qr-error">{error}</div>}
  <div className="ai-weekly-tabs">{(['setup','generate','proxy'] as const).map(x=><button key={x} className={tab===x?'active':''} onClick={()=>setTab(x)}>{x==='setup'?'1. Setup':x==='generate'?'2. Generate':'3. Proxy'}</button>)}</div>
  {tab==='setup'&&<div className="ai-weekly-grid">
   <article className="ai-weekly-card"><h3><Clock3 size={17}/> Weekly time grid</h3><p>Configure teaching periods and fixed breaks. The default grid includes eight teaching periods and lunch.</p><div className="ai-weekly-list">{activePeriods.map(p=><div key={p.id}><span>{p.period_number}. {p.period_label}</span><b>{time(p.start_time)}–{time(p.end_time)}</b><em>{p.is_break?'Break':'Teaching'}</em></div>)}</div>
    {canManage&&<form onSubmit={savePeriod} className="ai-weekly-form"><label>Period number<input type="number" min="1" max="12" value={periodForm.period_number} onChange={e=>setPeriodForm(v=>({...v,period_number:e.target.value}))}/></label><label>Label<input value={periodForm.period_label} onChange={e=>setPeriodForm(v=>({...v,period_label:e.target.value}))} required/></label><label>Start<input type="time" value={periodForm.start_time} onChange={e=>setPeriodForm(v=>({...v,start_time:e.target.value}))}/></label><label>End<input type="time" value={periodForm.end_time} onChange={e=>setPeriodForm(v=>({...v,end_time:e.target.value}))}/></label><label className="ai-weekly-check"><input type="checkbox" checked={periodForm.is_break} onChange={e=>setPeriodForm(v=>({...v,is_break:e.target.checked}))}/> Fixed break</label><button className="primary-action"><Plus size={14}/> Save period</button></form>}
   </article>
   <article className="ai-weekly-card"><h3><ShieldCheck size={17}/> Rooms & labs</h3><p>Room type and capacity are hard constraints during timetable generation.</p><div className="ai-weekly-list">{rooms.map(r=><div key={r.id}><span>{r.room_name} <small>({r.room_code})</small></span><b>{roomLabel(r.room_type)} · {r.capacity} seats</b><em>{r.is_active?'Active':'Inactive'}</em></div>)}</div>
    {canManage&&<form onSubmit={saveRoom} className="ai-weekly-form"><label>Room code<input value={roomForm.room_code} onChange={e=>setRoomForm(v=>({...v,room_code:e.target.value.toUpperCase()}))} required/></label><label>Room name<input value={roomForm.room_name} onChange={e=>setRoomForm(v=>({...v,room_name:e.target.value}))} required/></label><label>Room type<select value={roomForm.room_type} onChange={e=>setRoomForm(v=>({...v,room_type:e.target.value}))}>{ROOM_TYPES.map(x=><option key={x} value={x}>{roomLabel(x)}</option>)}</select></label><label>Capacity<input type="number" min="1" value={roomForm.capacity} onChange={e=>setRoomForm(v=>({...v,capacity:e.target.value}))}/></label><button className="primary-action"><Plus size={14}/> Add room</button></form>}
   </article>
   <article className="ai-weekly-card ai-weekly-wide"><h3><CalendarDays size={17}/> Subject period quotas</h3><p>Set the exact weekly periods for each section. A double session consumes two adjacent periods.</p><div className="ai-weekly-filters"><label>Standard<select value={selectedStandard} onChange={e=>setSelectedStandard(e.target.value)}>{standards.map(s=><option key={s.name}>{s.name}</option>)}</select></label><label>Section<select value={selectedSection} onChange={e=>setSelectedSection(e.target.value)}>{sections.map(s=><option key={s}>{s}</option>)}</select></label></div>
    <div className="ai-weekly-quotas">{activeSubjects.map(subject=>{const req=requirementsForSection.find(r=>r.subject_id===subject.id);return <QuotaRow key={subject.id} subject={subject} requirement={req} onSave={form=>void saveRequirement(subject,form)}/>})}{!activeSubjects.length&&<p className="ai-weekly-empty">Add subjects under Academic → Subjects first.</p>}</div>
   </article>
   <article className="ai-weekly-card"><h3><Users size={17}/> Teacher workload limits</h3><p>Qualified teachers are read from Standard → Teacher class allotment.</p>{teachers.map(t=>{const limit=workloads.find(w=>w.teacher_person_id===t.id);return <WorkloadRow key={t.id} teacher={t} initialDaily={limit?.max_daily_periods||6} initialWeekly={limit?.max_weekly_periods||30} onSave={(d,w)=>void saveWorkload(t,d,w)}/>})}</article>
   <article className="ai-weekly-card"><h3><CalendarDays size={17}/> Fixed events & combined periods</h3><p>Reserve assembly, lunch, PT, library, visiting-faculty or other shared periods before lesson placement.</p><form onSubmit={saveFixed} className="ai-weekly-form"><label>Scope<select value={fixedForm.standard_name} onChange={e=>setFixedForm(v=>({...v,standard_name:e.target.value,section_name:''}))}><option value="">All standards (combined)</option>{standards.map(s=><option key={s.name}>{s.name}</option>)}</select></label>{fixedForm.standard_name&&<label>Section<select value={fixedForm.section_name} onChange={e=>setFixedForm(v=>({...v,section_name:e.target.value}))}><option value="">All sections</option>{standards.find(s=>s.name===fixedForm.standard_name)?.sections.map(s=><option key={s}>{s}</option>)}</select></label>}<label>Day<select value={fixedForm.day_of_week} onChange={e=>setFixedForm(v=>({...v,day_of_week:e.target.value}))}>{DAY_NAMES.slice(1).map((d,i)=><option key={d} value={i+1}>{d}</option>)}</select></label><label>Period<select value={fixedForm.period_number} onChange={e=>setFixedForm(v=>({...v,period_number:e.target.value}))}>{activePeriods.map(p=><option key={p.id} value={p.period_number}>{p.period_label}</option>)}</select></label><label>Event type<select value={fixedForm.block_type} onChange={e=>setFixedForm(v=>({...v,block_type:e.target.value}))}>{['assembly','break','lunch','pt','library','fixed_event','visiting_faculty'].map(x=><option key={x}>{x}</option>)}</select></label><label>Label<input value={fixedForm.label} onChange={e=>setFixedForm(v=>({...v,label:e.target.value}))} required/></label><label>Teacher (optional)<select value={fixedForm.teacher_person_id} onChange={e=>setFixedForm(v=>({...v,teacher_person_id:e.target.value}))}><option value="">None</option>{teachers.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select></label><label>Room (optional)<select value={fixedForm.room_id} onChange={e=>setFixedForm(v=>({...v,room_id:e.target.value}))}><option value="">None</option>{rooms.map(r=><option key={r.id} value={r.id}>{r.room_name}</option>)}</select></label><button className="primary-action"><Plus size={14}/> Reserve slot</button></form><div className="ai-weekly-list">{fixedBlocks.map(b=><div key={b.id}><span>{b.label} · {DAY_NAMES[b.day_of_week]} P{b.period_number}</span><b>{b.standard_name?b.standard_name+(b.section_name?' '+b.section_name:''):'All standards'}</b><em>{b.block_type}</em></div>)}</div></article>
  </div>}
  {tab==='generate'&&<div className="ai-weekly-card"><div className="ai-weekly-generate-head"><div><h3><Cpu size={18}/> Constraint-based timetable generator</h3><p>Most-constrained-first lesson ordering · backtracking · soft-score local search.</p></div><button className="primary-action" disabled={!canManage||saving} onClick={generate}><Sparkles size={15}/> Generate timetable</button></div>
   <div className="ai-weekly-stats"><div><b>{requirements.length}</b><span>Quota rows</span></div><div><b>{rooms.filter(r=>r.is_active).length}</b><span>Active rooms</span></div><div><b>{assignments.length}</b><span>Teacher allotments</span></div><div><b>{fixedBlocks.length}</b><span>Fixed blocks</span></div><div><b>{timetable.filter(t=>t.is_locked||t.source!=='ai').length}</b><span>Locked lessons</span></div></div>
   {solverMessage&&<div className="ai-weekly-message">{solverMessage}</div>}
   {result&&<><div className="ai-weekly-success"><Check size={17}/> Zero hard-constraint violations · Soft penalty {score} · {result.length} lessons planned</div><div className="ai-weekly-preview">{result.slice().sort((a,b)=>a.day_of_week-b.day_of_week||a.period_number-b.period_number||a.standard_name.localeCompare(b.standard_name)).map(row=><div key={row.key}><b>{DAY_NAMES[row.day_of_week]} · P{row.period_number}{row.is_double_period?'–P'+(row.period_number+1):''}</b><span>{row.standard_name} {row.section_name} · {row.subject_name}</span><small>{teachers.find(t=>t.id===row.teacher_person_id)?.name||row.teacher_person_id} · {rooms.find(r=>r.id===row.room_id)?.room_name}</small></div>)}</div><button className="primary-action" disabled={saving||!canManage} onClick={()=>void saveGenerated()}><Save size={15}/> {saving?'Saving timetable…':'Save as draft timetable'}</button></>}
   {currentRun&&<div className="ai-weekly-publish"><span>Latest AI draft has been saved.</span><button className="secondary-action" onClick={()=>void publish(currentRun)}>Publish & lock saved timetable</button></div>}
   <p className="ai-weekly-note">Manual rows remain locked. Previous unlocked AI draft rows are replaced only when you save a new generated draft. Published rows are locked and retained.</p>
  </div>}
  {tab==='proxy'&&<div className="ai-weekly-card"><h3><Users size={18}/> Dynamic proxy substitution</h3><p>Record an absent teacher for a date. RADX checks the weekly timetable for free teachers already allotted to the same class and section, then ranks them by daily load.</p><form className="ai-weekly-form" onSubmit={markAbsent}><label>Date<input type="date" value={date} onChange={e=>setDate(e.target.value)} required/></label><label>Absent teacher<select value={absenceTeacher} onChange={e=>setAbsenceTeacher(e.target.value)} required><option value="">Choose teacher</option>{teachers.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select></label><label>Reason<input value={absenceReason} onChange={e=>setAbsenceReason(e.target.value)} placeholder="Optional"/></label><label>Proxy note<input value={proxyReason} onChange={e=>setProxyReason(e.target.value)} placeholder="Optional handover note"/></label><button className="primary-action"><Plus size={14}/> Mark absent</button></form>
   <div className="ai-weekly-list">{absentTeachers.map(id=><div key={id}><span>{teachers.find(t=>t.id===id)?.name||id}</span><b>Absent · {date}</b><em>Recorded</em></div>)}</div>
   <div className="ai-weekly-proxies">{proxyRows.map((lesson:any)=><article key={lesson.id}><div><b>{lesson.standard_name} {lesson.section_name} · {subjects.find(s=>s.id===lesson.subject_id)?.subject_name||'Subject'}</b><span>{time(lesson.start_time)}–{time(lesson.end_time)} · Absent: {teachers.find(t=>t.id===lesson.teacher_person_id)?.name||lesson.teacher_person_id}</span></div><select value={proxyChoice[lesson.id]||''} onChange={e=>setProxyChoice(v=>({...v,[lesson.id]:e.target.value}))}><option value="">Select suggested proxy</option>{(proxyCandidates[lesson.id]||[]).map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select><button className="primary-action" disabled={!proxyChoice[lesson.id]} onClick={()=>void assignProxy(lesson)}>Assign proxy</button>{!(proxyCandidates[lesson.id]||[]).length&&<small>No free qualified teacher currently matches this class and section.</small>}</article>)}{!proxyRows.length&&<p className="ai-weekly-empty">No unassigned lessons for absent teachers on this date.</p>}</div>
  </div>}
  <style>{`
   .ai-weekly{display:grid;gap:16px}.ai-weekly-head{display:flex;justify-content:space-between;align-items:center;gap:16px}.ai-weekly-head h2{display:flex;align-items:center;gap:9px;margin:5px 0}.ai-weekly-head p,.ai-weekly-card p{color:#64748b;font-size:13px;margin:5px 0 14px}.ai-weekly-tabs{display:flex;gap:8px;border-bottom:1px solid #e2e8f0;padding-bottom:9px}.ai-weekly-tabs button{border:1px solid #dce5df;background:#fff;border-radius:9px;padding:9px 13px;color:#475569;font-weight:650;cursor:pointer}.ai-weekly-tabs button.active{background:#e8f5ed;border-color:#9bd2b1;color:#166534}.ai-weekly-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}.ai-weekly-card{background:#fff;border:1px solid #e3ebe5;border-radius:14px;padding:16px;min-width:0}.ai-weekly-card h3{display:flex;align-items:center;gap:8px;font-size:15px;margin:0 0 8px;color:#183b2a}.ai-weekly-wide{grid-column:1/-1}.ai-weekly-list{display:grid;gap:7px;margin:10px 0}.ai-weekly-list>div{display:flex;justify-content:space-between;gap:10px;align-items:center;padding:8px 10px;background:#f8faf9;border-radius:8px;font-size:12px}.ai-weekly-list span{font-weight:650;color:#334155}.ai-weekly-list b{font-size:11px;color:#475569}.ai-weekly-list em{font-style:normal;color:#15803d;font-size:10px}.ai-weekly-form{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px;margin-top:12px}.ai-weekly-form label,.ai-weekly-filters label{display:grid;gap:5px;font-size:11px;font-weight:650;color:#475569}.ai-weekly-form input,.ai-weekly-form select,.ai-weekly-filters select,.ai-weekly-quotas input,.ai-weekly-quotas select,.ai-weekly-proxies select{width:100%;min-width:0;border:1px solid #dbe4de;border-radius:8px;padding:9px;background:#fff;color:#1e293b;font:inherit;font-size:12px}.ai-weekly-form button{align-self:end}.ai-weekly-check{display:flex!important;align-items:center;gap:8px}.ai-weekly-check input{width:auto}.ai-weekly-filters{display:flex;gap:12px;margin:12px 0}.ai-weekly-filters select{min-width:140px}.ai-weekly-quotas{display:grid;gap:8px}.ai-quota-row{display:grid;grid-template-columns:minmax(130px,1.4fr) repeat(4,minmax(85px,1fr)) auto;gap:8px;align-items:center;border-bottom:1px solid #edf1ee;padding:8px 0}.ai-quota-row b{font-size:12px}.ai-quota-row button{border:0;background:#e8f5ed;color:#166534;padding:8px;border-radius:8px;cursor:pointer}.ai-workload-row{display:grid;grid-template-columns:1fr 70px 70px auto;gap:7px;align-items:center;padding:7px 0;border-bottom:1px solid #edf1ee}.ai-workload-row span{font-size:12px;font-weight:650}.ai-workload-row input{width:100%;padding:7px;border:1px solid #dbe4de;border-radius:7px}.ai-workload-row button{border:0;background:#e8f5ed;color:#166534;padding:7px;border-radius:7px}.ai-weekly-generate-head{display:flex;justify-content:space-between;align-items:center;gap:12px}.ai-weekly-generate-head h3{margin:0}.ai-weekly-stats{display:grid;grid-template-columns:repeat(5,1fr);gap:8px;margin:14px 0}.ai-weekly-stats div{background:#f7faf8;border:1px solid #e7eee9;border-radius:10px;padding:12px}.ai-weekly-stats b{display:block;font-size:20px;color:#166534}.ai-weekly-stats span{font-size:10px;color:#64748b}.ai-weekly-message{background:#f8fafc;border:1px solid #e2e8f0;border-radius:9px;padding:12px;color:#334155;font-size:13px;margin:12px 0}.ai-weekly-success{display:flex;align-items:center;gap:8px;background:#effaf2;border:1px solid #bbebc9;border-radius:9px;padding:12px;color:#166534;font-weight:700;font-size:13px}.ai-weekly-preview{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px;max-height:360px;overflow:auto;margin:12px 0}.ai-weekly-preview>div{display:grid;gap:3px;border:1px solid #e5ece7;border-radius:8px;padding:9px}.ai-weekly-preview b{font-size:11px;color:#166534}.ai-weekly-preview span{font-size:12px;font-weight:650}.ai-weekly-preview small{font-size:10px;color:#64748b}.ai-weekly-note,.ai-weekly-empty{font-size:12px;color:#64748b;margin-top:12px}.ai-weekly-publish{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:12px;background:#f7faf8;border-radius:9px;margin-top:12px}.ai-weekly-proxies{display:grid;gap:10px;margin-top:14px}.ai-weekly-proxies article{display:grid;grid-template-columns:1.5fr 1fr auto;gap:9px;align-items:center;border:1px solid #e5ece7;border-radius:10px;padding:12px}.ai-weekly-proxies article div{display:grid;gap:4px}.ai-weekly-proxies article b{font-size:13px}.ai-weekly-proxies article span,.ai-weekly-proxies article small{font-size:11px;color:#64748b}.ai-weekly-proxies article small{grid-column:1/-1}@media(max-width:850px){.ai-weekly-grid{grid-template-columns:1fr}.ai-weekly-wide{grid-column:auto}.ai-weekly-stats{grid-template-columns:repeat(3,1fr)}.ai-quota-row{grid-template-columns:1fr 1fr 1fr}.ai-weekly-proxies article{grid-template-columns:1fr}.ai-weekly-preview{grid-template-columns:1fr}}@media(max-width:560px){.ai-weekly-head,.ai-weekly-generate-head{align-items:flex-start;flex-direction:column}.ai-weekly-stats{grid-template-columns:1fr 1fr}.ai-weekly-form{grid-template-columns:1fr}.ai-workload-row{grid-template-columns:1fr 1fr}.ai-quota-row{grid-template-columns:1fr 1fr}.ai-weekly-tabs{overflow:auto}.ai-weekly-publish{align-items:flex-start;flex-direction:column}}`}</style>
 </section>
}

function periodsTeachingForRow(row:Placement,periods:Period[]){
 const first=periods.find(p=>p.period_number===row.period_number)
 if(!first)return []
 if(!row.is_double_period)return [first]
 const second=periods.find(p=>p.period_number===row.period_number+1)
 return second?[first,second]:[]
}

function QuotaRow({subject,requirement,onSave}:{subject:Subject;requirement?:Requirement;onSave:(form:Partial<Requirement>)=>void}){
 const [weekly,setWeekly]=useState(String(requirement?.weekly_periods||5))
 const [doubles,setDoubles]=useState(String(requirement?.double_periods||0))
 const [room,setRoom]=useState(requirement?.room_type||(subject.subject_type==='Practical / Lab'?'computer_lab':'classroom'))
 const [load,setLoad]=useState(requirement?.cognitive_load||(/math|physics|chemistry/i.test(subject.subject_name)?'heavy':'normal'))
 useEffect(()=>{setWeekly(String(requirement?.weekly_periods||5));setDoubles(String(requirement?.double_periods||0));setRoom(requirement?.room_type||(subject.subject_type==='Practical / Lab'?'computer_lab':'classroom'));setLoad(requirement?.cognitive_load||(/math|physics|chemistry/i.test(subject.subject_name)?'heavy':'normal'))},[requirement,subject])
 return <div className="ai-quota-row"><b>{subject.subject_name}</b><label><small>Weekly</small><input type="number" min="1" max="48" value={weekly} onChange={e=>setWeekly(e.target.value)}/></label><label><small>Double</small><input type="number" min="0" max="24" value={doubles} onChange={e=>setDoubles(e.target.value)}/></label><label><small>Room</small><select value={room} onChange={e=>setRoom(e.target.value)}>{ROOM_TYPES.map(x=><option key={x} value={x}>{roomLabel(x)}</option>)}</select></label><label><small>Load</small><select value={load} onChange={e=>setLoad(e.target.value)}><option value="heavy">Heavy</option><option value="normal">Normal</option><option value="light">Light</option></select></label><button onClick={()=>onSave({weekly_periods:Number(weekly),double_periods:Number(doubles),room_type:room,cognitive_load:load})}><Save size={13}/> Save</button></div>
}

function WorkloadRow({teacher,initialDaily,initialWeekly,onSave}:{teacher:Teacher;initialDaily:number;initialWeekly:number;onSave:(daily:number,weekly:number)=>void}){
 const [daily,setDaily]=useState(String(initialDaily));const [weekly,setWeekly]=useState(String(initialWeekly))
 useEffect(()=>{setDaily(String(initialDaily));setWeekly(String(initialWeekly))},[initialDaily,initialWeekly])
 return <div className="ai-workload-row"><span>{teacher.name}</span><input aria-label="Maximum daily periods" type="number" min="1" max="12" value={daily} onChange={e=>setDaily(e.target.value)}/><input aria-label="Maximum weekly periods" type="number" min="1" max="72" value={weekly} onChange={e=>setWeekly(e.target.value)}/><button onClick={()=>onSave(Number(daily),Number(weekly))}>Save</button></div>
}
