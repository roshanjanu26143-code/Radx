import { useEffect, useMemo, useRef, useState } from 'react'
import './mobile-qr-attendance.css'
import { Camera, Check, ChevronRight, Clock3, Copy, Download, MapPin, QrCode, ShieldCheck, Smartphone, Users, Wifi, WifiOff, X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { QRCodeSVG } from 'qrcode.react'

type Standard = { name: string; sections: string[] }
type Person = { id: string; type: string; name: string; details: Record<string, string> }
type SessionCode = 'MORNING' | 'AFTERNOON'
type Mark = 'PRESENT' | 'ABSENT'
type QueueItem = { id: string; payload: Record<string, unknown>; status: 'PENDING' | 'SYNCED' | 'FAILED'; created_at: string; error?: string }
type QrRow = { standard_name: string; qr_token: string; is_active: boolean }
type AttendanceSession = { id: string; attendance_date: string; session_code: SessionCode; standard_name: string; section_name: string }
type TeacherAssignment={standard_name:string;section_name:string;subject_name:string|null}
const localDate = () => { const d=new Date(); return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-') }
const queueKey = (schoolId:string) => 'acadamix-attendance-queue-'+schoolId
const readQueue = (schoolId:string):QueueItem[] => { try{return JSON.parse(localStorage.getItem(queueKey(schoolId))||'[]') as QueueItem[]}catch{return []} }

export default function MobileQRAttendance({schoolId,standards,people,notify,userRole='Admin',teacherPersonId=null}:{schoolId:string;standards:Standard[];people:Person[];notify?:(message:string)=>void;userRole?:string;teacherPersonId?:string|null}) {
 const [step,setStep]=useState(1),[token,setToken]=useState(''),[qrRows,setQrRows]=useState<QrRow[]>([])
 const [dataLoading,setDataLoading]=useState(true),[dataError,setDataError]=useState(''),[scanned,setScanned]=useState<Standard|null>(null)
 const [teacherId,setTeacherId]=useState(''),[teacherPassword,setTeacherPassword]=useState(''),[teacher,setTeacher]=useState<Person|null>(null),[sectionName,setSectionName]=useState(''),[teacherVerifying,setTeacherVerifying]=useState(false)
 const [marks,setMarks]=useState<Record<string,Mark>>({}),[preview,setPreview]=useState(false)
 const [queue,setQueue]=useState<QueueItem[]>(()=>readQueue(schoolId)),[online,setOnline]=useState(navigator.onLine)
 const [sessions,setSessions]=useState<AttendanceSession[]>([]),[teacherAssignments,setTeacherAssignments]=useState<TeacherAssignment[]>([]),[location,setLocation]=useState<{lat:number;lng:number;accuracy:number}|null>(null)
 const [cameraOn,setCameraOn]=useState(false),[cameraError,setCameraError]=useState(''),[scanError,setScanError]=useState('')
 const [activeSession,setActiveSession]=useState<SessionCode>('MORNING'),[syncing,setSyncing]=useState(false)
 const videoRef=useRef<HTMLVideoElement>(null),streamRef=useRef<MediaStream|null>(null),syncingRef=useRef(false)
 const teachers=useMemo(()=>people.filter(p=>p.type==='Teacher'&&(userRole!=='Teacher'||p.id===teacherPersonId)),[people,userRole,teacherPersonId])
 const availableStandards=useMemo(()=>userRole==='Teacher'?standards.map(s=>({...s,sections:s.sections.filter(section=>teacherAssignments.some(a=>a.standard_name===s.name&&a.section_name===section))})).filter(s=>s.sections.length>0):standards,[standards,teacherAssignments,userRole])
 const students=useMemo(()=>people.filter(p=>p.type==='Student'&&p.details.joining_standard===scanned?.name&&p.details.section===sectionName).sort((a,b)=>(a.details.roll_number||a.id).localeCompare(b.details.roll_number||b.id,undefined,{numeric:true})),[people,scanned,sectionName])
 const present=students.filter(s=>(marks[s.id]||'PRESENT')==='PRESENT').length,absent=students.length-present
 const pending=queue.filter(q=>q.status==='PENDING').length,failed=queue.filter(q=>q.status==='FAILED').length
 const date=localDate(),academicYear=(()=>{const d=new Date();const start=d.getMonth()>=3?d.getFullYear():d.getFullYear()-1;return `${start}-${String(start+1).slice(-2)}`})(),sectionOptions=teacher?(scanned?.sections||[]).filter(section=>teacherAssignments.some(a=>a.standard_name===scanned?.name&&a.section_name===section)):(scanned?.sections||[])
 const alreadySubmitted=!!(scanned&&sectionName&&(sessions.some(r=>r.attendance_date===date&&r.session_code===activeSession&&r.standard_name===scanned.name&&r.section_name===sectionName)||queue.some(q=>q.status!=='FAILED'&&q.payload.p_attendance_date===date&&q.payload.p_session_code===activeSession&&q.payload.p_standard_name===scanned.name&&q.payload.p_section_name===sectionName)))

 useEffect(()=>{
  let cancelled=false
  const load=async()=>{
   setDataLoading(true);setDataError('')
   const [qr,saved,assigned]=await Promise.all([
    supabase.from('school_classroom_qr').select('standard_name,qr_token,is_active').eq('school_id',schoolId).eq('is_active',true),
    supabase.from('school_attendance_sessions').select('id,attendance_date,session_code,standard_name,section_name').eq('school_id',schoolId).eq('attendance_date',date),
    userRole==='Teacher'&&teacherPersonId?supabase.from('school_teacher_class_assignments').select('standard_name,section_name,subject_name').eq('school_id',schoolId).eq('teacher_person_id',teacherPersonId).eq('is_active',true):Promise.resolve({data:[],error:null})
   ])
   if(qr.error)throw qr.error;if(saved.error)throw saved.error;if(assigned.error)throw assigned.error
   const assignedRows=(assigned.data||[]) as TeacherAssignment[]
   let rows=(qr.data||[]) as QrRow[]
   const missing=userRole==='Admin'?standards.filter(s=>!rows.some(r=>r.standard_name===s.name)):[]
   if(missing.length){const {error}=await supabase.from('school_classroom_qr').insert(missing.map(s=>({school_id:schoolId,standard_name:s.name})));if(error)throw error
    const refreshed=await supabase.from('school_classroom_qr').select('standard_name,qr_token,is_active').eq('school_id',schoolId).eq('is_active',true);if(refreshed.error)throw refreshed.error;rows=(refreshed.data||[]) as QrRow[]}
   if(cancelled)return;setTeacherAssignments(assignedRows);setQrRows(userRole==='Teacher'?rows.filter(r=>assignedRows.some(a=>a.standard_name===r.standard_name)):rows);setSessions((saved.data||[]) as AttendanceSession[]);setDataLoading(false)
  }
  void load().catch(e=>{if(!cancelled){setDataError(e instanceof Error?e.message:'Could not load attendance data.');setDataLoading(false)}})
  return()=>{cancelled=true}
 },[schoolId,standards,date,userRole,teacherPersonId])

 useEffect(()=>{localStorage.setItem(queueKey(schoolId),JSON.stringify(queue))},[queue,schoolId])
 useEffect(()=>{
  const on=()=>setOnline(true),off=()=>setOnline(false)
  window.addEventListener('online',on);window.addEventListener('offline',off)
  return()=>{window.removeEventListener('online',on);window.removeEventListener('offline',off);streamRef.current?.getTracks().forEach(t=>t.stop())}
 },[])
 useEffect(()=>{
  if(!cameraOn||!videoRef.current)return
  let active=true
  const start=async()=>{try{
   const stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'}},audio:false})
   if(!active){stream.getTracks().forEach(t=>t.stop());return}
   streamRef.current=stream;videoRef.current!.srcObject=stream;await videoRef.current!.play()
   const Detector=(window as unknown as {BarcodeDetector?:new(o:{formats:string[]})=>{detect:(v:HTMLVideoElement)=>Promise<{rawValue:string}[]>}}).BarcodeDetector
   if(!Detector){setCameraError('Live QR scanning is not supported in this browser. Enter the token manually.');return}
   const detector=new Detector({formats:['qr_code']})
   const scan=async()=>{if(!active||!videoRef.current)return;try{const codes=await detector.detect(videoRef.current);if(codes[0]?.rawValue){setToken(codes[0].rawValue);setCameraOn(false);setScanError('QR detected. Validate it to continue.');return}}catch{}if(active)requestAnimationFrame(scan)}
   requestAnimationFrame(scan)
  }catch{setCameraError('Camera permission is unavailable. Enter the token manually.')}}
  void start()
  return()=>{active=false;streamRef.current?.getTracks().forEach(t=>t.stop());streamRef.current=null}
 },[cameraOn])
 useEffect(()=>{
  if(!online||!queue.some(q=>q.status==='PENDING')||syncingRef.current)return
  const sync=async()=>{
   syncingRef.current=true;setSyncing(true)
   for(const item of queue.filter(q=>q.status==='PENDING')){
    const {error}=await supabase.rpc('submit_school_attendance',item.payload as never)
    if(error){
     if(error.code==='23505'||error.message.toLowerCase().includes('duplicate key'))setQueue(current=>current.map(q=>q.id===item.id?{...q,status:'FAILED',error:'This class/session was already submitted.'}:q))
     break
    }
    setQueue(current=>current.map(q=>q.id===item.id?{...q,status:'SYNCED',error:undefined}:q))
   }
   syncingRef.current=false;setSyncing(false)
  }
  void sync()
 },[online,queue])

 const validateQr=()=>{
  setScanError('')
  const found=qrRows.find(r=>r.is_active&&r.qr_token.toLowerCase()===token.trim().toLowerCase())
  if(!found){setScanError('This QR token is not active for this school.');return}
  const standard=availableStandards.find(s=>s.name===found.standard_name)
  if(!standard){setScanError('This classroom standard is no longer configured.');return}
  setScanned(standard)
  const now=new Date().toTimeString().slice(0,5),session:SessionCode|null=now>='08:00'&&now<='10:00'?'MORNING':now>='13:00'&&now<='15:00'?'AFTERNOON':null
  if(!session){setScanError('Attendance is closed. Allowed windows: 08:00–10:00 and 13:00–15:00.');return}
  setActiveSession(session);setLocation(null)
  if(navigator.geolocation)navigator.geolocation.getCurrentPosition(p=>setLocation({lat:p.coords.latitude,lng:p.coords.longitude,accuracy:p.coords.accuracy}),()=>setLocation(null),{enableHighAccuracy:true,timeout:8000,maximumAge:60000})
  setStep(2)
 }
 const verifyTeacher=async()=>{
  if(teacherVerifying)return
  setScanError('')
  const found=teacherPersonId&&userRole==='Teacher'?teachers.find(p=>p.id===teacherPersonId):teachers.find(p=>[p.id,p.details.employee_id,p.details.emp_id].some(v=>(v||'').toLowerCase()===teacherId.trim().toLowerCase()))
  if(!found){setScanError('Teacher ID was not found in this school.');return}
  if(!teacherId.trim()||![found.id,found.details.employee_id,found.details.emp_id].some(v=>(v||'').toLowerCase()===teacherId.trim().toLowerCase())){setScanError('Enter the Teacher ID linked to this school account.');return}
  if(!teacherPassword.trim()){setScanError('Enter the password issued by your school office.');return}
  setTeacherVerifying(true)
  try{
   const {data:roleRow,error:roleError}=await supabase.from('school_user_roles').select('user_id,email,role,status,allowed_pages,person_id').eq('school_id',schoolId).eq('person_id',found.id).eq('role','Teacher').eq('status','active').maybeSingle()
   if(roleError)throw roleError
   if(!roleRow?.email||!roleRow.user_id){setScanError('This teacher account is not configured. Ask the school office to create or link the teacher login.');return}
   if(!(roleRow.allowed_pages||[]).includes('Attendance')){setScanError('Attendance access is not enabled for this teacher. Ask the school office.');return}
   const {data:authData,error:authError}=await supabase.auth.signInWithPassword({email:roleRow.email,password:teacherPassword})
   if(authError||authData.user?.id!==roleRow.user_id){setScanError('Teacher ID or password is incorrect. Please check with the school office.');return}
   const {data:assignments,error:assignmentError}=await supabase.from('school_teacher_class_assignments').select('standard_name,section_name,subject_name').eq('school_id',schoolId).eq('teacher_person_id',found.id).eq('is_active',true)
   if(assignmentError)throw assignmentError
   const assigned=(assignments||[]) as TeacherAssignment[]
   if(!assigned.some(item=>item.standard_name===scanned?.name)){setScanError('This teacher has no active allotment for '+(scanned?.name||'this class')+'.');return}
   setTeacherAssignments(assigned);setTeacher(found);const assignedSections=assigned.filter(item=>item.standard_name===scanned?.name).map(item=>item.section_name);setSectionName(assignedSections.length===1?assignedSections[0]:'');setMarks({});setStep(3)
  }catch(error){setScanError(error instanceof Error?error.message:'Teacher verification failed. Please try again.')}
  finally{setTeacherVerifying(false)}
 }
 const submitAttendance=async()=>{
  if(!scanned||!teacher||!sectionName||!students.length)return
  const payload={p_school_id:schoolId,p_attendance_date:date,p_session_code:activeSession,p_standard_name:scanned.name,p_section_name:sectionName,p_teacher_person_id:teacher.id,p_marks:students.map(s=>({student_person_id:s.id,attendance_status:marks[s.id]||'PRESENT'})),p_location_lat:location?.lat??null,p_location_lng:location?.lng??null,p_location_accuracy_m:location?.accuracy??null}
  if(online){const {error}=await supabase.rpc('submit_school_attendance',payload)
   if(error){setScanError(error.message.includes('duplicate key')?'Attendance has already been submitted for this class and session.':'Could not submit attendance: '+error.message);return}
   setSessions(rows=>[...rows,{id:crypto.randomUUID(),attendance_date:date,session_code:activeSession,standard_name:scanned.name,section_name:sectionName}]);setPreview(false);setStep(4);notify?.('Attendance saved securely to the school database.');return}
  const item:QueueItem={id:crypto.randomUUID(),payload,status:'PENDING',created_at:new Date().toISOString()}
  setQueue(rows=>[item,...rows]);setPreview(false);setStep(4);notify?.('Attendance saved offline. It will sync when internet returns.')
 }
 const reset=()=>{setStep(1);setToken('');setScanned(null);setTeacherId('');setTeacherPassword('');setTeacher(null);setSectionName('');setMarks({});setPreview(false);setScanError('');setLocation(null)}
 const copyToken=async(value:string)=>{try{await navigator.clipboard.writeText(value);notify?.('Classroom QR token copied.')}catch{setScanError('Clipboard unavailable. Select and copy the token manually.')}}
 const stepNames=['Scan QR','Verify teacher','Mark attendance','Complete']

 return <div className="qr-attendance">
  <div className="qr-attendance-head"><div><span className="section-eyebrow">SCHOOL ATTENDANCE · LIVE DATABASE</span><h2>QR Attendance</h2><p>Scan the school classroom QR, verify a registered teacher and submit the student register.</p></div><div className={'qr-network '+(online?'is-online':'is-offline')}>{online?<Wifi size={15}/>:<WifiOff size={15}/>} {online?'Online':'Offline'}</div></div>
  <div className="qr-progress">{stepNames.map((name,i)=><div className={'qr-progress-step '+(step===i+1?'current':step>i+1?'done':'')} key={name}><span>{step>i+1?<Check size={13}/>:i+1}</span><small>{name}</small></div>)}</div>
  <div className="qr-main-card">
   {step===1&&<><div className="qr-step-title"><div className="qr-step-icon"><QrCode/></div><div><span>STEP 01 · CLASSROOM VALIDATION</span><h3>Scan classroom QR</h3><p>Each standard has a permanent, school-specific QR token.</p></div></div>
    <div className="qr-camera-box">{cameraOn?<video ref={videoRef} muted playsInline/>:<div className="qr-camera-placeholder"><QrCode size={48}/><b>Classroom QR scanner</b><span>Point the camera at the printed classroom QR.</span></div>}</div>
    <div className="qr-camera-actions"><button className="qr-secondary" onClick={()=>{setCameraError('');setCameraOn(v=>!v)}}><Camera size={16}/>{cameraOn?'Stop camera':'Open camera'}</button><span>School-specific UUID QR token</span></div>
    <label className="qr-field">QR token<input value={token} onChange={e=>setToken(e.target.value)} placeholder="Scan or paste the classroom QR token"/></label>
    <div className="qr-token-grid"><b>Permanent classroom QR codes</b>{dataLoading? <span>Loading classroom codes…</span>:qrRows.length===0?<span>No standards configured yet.</span>:qrRows.map(r=><div className="qr-token-card" key={r.standard_name}><b>{r.standard_name}</b><QRCodeSVG value={r.qr_token} size={112} level="M" includeMargin/><code>{r.qr_token}</code><div><button type="button" onClick={()=>setToken(r.qr_token)}>Use token</button><button type="button" onClick={()=>void copyToken(r.qr_token)} aria-label={"Copy "+r.standard_name+" token"}><Copy size={12}/> Copy</button></div></div>)}</div>
    <button className="qr-primary" onClick={validateQr} disabled={!token.trim()||dataLoading}>Validate QR <ChevronRight size={17}/></button>
    <div className="qr-security-row"><span><ShieldCheck size={14}/> QR token checked against this school</span><span><Clock3 size={14}/> Scheduled attendance window</span></div>
   </>}
   {step===2&&scanned&&<><div className="qr-step-title"><div className="qr-step-icon"><ShieldCheck/></div><div><span>STEP 02 · TEACHER VERIFICATION</span><h3>Verify your identity</h3><p>Enter the ID of a teacher registered in this school.</p></div></div><div className="qr-class-chip"><QrCode size={16}/>{scanned.name}<span>AY {academicYear} · {activeSession}</span></div><label className="qr-field">Teacher ID<input value={teacherId} onChange={e=>setTeacherId(e.target.value)} placeholder="Enter your school-issued Teacher ID" autoCapitalize="characters" autoComplete="username"/></label><label className="qr-field">Password<input type="password" value={teacherPassword} onChange={e=>setTeacherPassword(e.target.value)} placeholder="Password provided by school office" autoComplete="current-password"/></label><div className="qr-demo-hint">{userRole==='Teacher'?'Confirm your linked Teacher ID and enter your password.':'Your school office creates your teacher account and provides this password.'} Attendance is enabled only for active teacher accounts with class allotments.</div><button className="qr-primary" onClick={()=>void verifyTeacher()} disabled={teacherVerifying||!teacherPassword.trim()||(userRole!=='Teacher'&&!teacherId.trim())||!teachers.length}>{teacherVerifying?'Verifying…':'Verify ID & password'} <ChevronRight size={17}/></button></>}
   {step===3&&teacher&&scanned&&<><div className="qr-step-title"><div className="qr-step-icon"><Users/></div><div><span>STEP 03 · ATTENDANCE REGISTER</span><h3>Mark student attendance</h3><p>Students default to Present. Tap a student to mark Absent.</p></div></div>
    <div className="qr-teacher-card"><div className="qr-teacher-avatar">{teacher.name.slice(0,1).toUpperCase()}</div><div><b>{teacher.name}</b><span>{teacher.id} · Registered teacher</span></div><span className="qr-verified"><ShieldCheck size={14}/> Verified</span></div>
    <div className="qr-register-meta"><div><small>STANDARD · YEAR</small><b>{scanned.name} · {academicYear}</b></div><div><small>SECTION</small><b>{sectionName||'Select section'}</b></div><div><small>DATE & TIME</small><b>{new Date().toLocaleString('en-IN',{dateStyle:'medium',timeStyle:'short'})}</b></div></div>
    {sectionOptions.length>1?<label className="qr-field">Select section<select value={sectionName} onChange={e=>{setSectionName(e.target.value);setMarks({})}}><option value="">Choose section</option>{sectionOptions.map(s=><option key={s} value={s}>{s}</option>)}</select></label>:<div className="qr-section-auto"><span>SECTION</span><b>{sectionName||sectionOptions[0]||'Not configured'}</b></div>}
    {sectionName&&<><div className="qr-list-heading"><b>Student list</b><span>{students.length} registered students · sorted by roll number</span></div>{alreadySubmitted&&<div className="qr-locked"><ShieldCheck size={16}/> Attendance already submitted for this session. Editing is locked.</div>}
     <div className="qr-student-list">{students.map(s=>{const isPresent=(marks[s.id]||'PRESENT')==='PRESENT';return <button type="button" disabled={alreadySubmitted} className={'qr-student-row '+(isPresent?'present':'absent')} key={s.id} onClick={()=>setMarks(m=>({...m,[s.id]:isPresent?'ABSENT':'PRESENT'}))}><span className="qr-roll">{s.details.roll_number||s.id}</span><span className="qr-student-name">{s.name}</span><span className={'qr-status-pill '+(isPresent?'present':'absent')}>{isPresent?'PRESENT':'ABSENT'}</span><span className={'qr-switch '+(isPresent?'on':'')}></span></button>})}</div>
     <div className="qr-sticky-counts"><div><small>Total</small><b>{students.length}</b></div><div><small>Present</small><b className="green-count">{present}</b></div><div><small>Absent</small><b className="red-count">{absent}</b></div><button className="qr-primary" disabled={alreadySubmitted||!students.length} onClick={()=>setPreview(true)}>Preview & Submit <ChevronRight size={16}/></button></div></>}
    {!sectionName&&sectionOptions.length===0&&<div className="qr-error">No sections configured for this standard. Add sections in Academic → Standard.</div>}
   </>}
   {step===4&&<div className="qr-complete"><div className="qr-complete-icon"><Check size={32}/></div><span>ATTENDANCE SUBMITTED</span><h3>{online?'Saved to school database':'Saved offline'}</h3><p>{online?'The attendance session and each student mark are stored in Supabase.':'Your submission is stored on this device and will sync when the connection returns.'}</p><div className="qr-queue-status"><span>{online?'Database status':'Sync queue'}</span><b>{online?'Saved':pending+' pending'}</b></div><button className="qr-primary" onClick={reset}>Start next attendance <ChevronRight size={16}/></button></div>}
  </div>
  {scanError&&<div className="qr-error"><X size={15}/>{scanError}</div>}{cameraError&&<div className="qr-error">{cameraError}</div>}{dataError&&<div className="qr-error">{dataError}</div>}
  <div className="qr-bottom-grid"><div className="qr-info-card"><div><Smartphone size={17}/><b>Offline-first register</b></div><p>Submissions queue locally without internet and sync to this school's database after reconnection.</p><span><MapPin size={13}/> {location?('Location captured · ±'+Math.round(location.accuracy)+'m'):'Location optional / not captured'}</span></div><div className="qr-info-card"><div><Download size={17}/><b>Database sync queue</b><span className="qr-pending-count">{pending} pending</span></div><p>{queue.length} local submissions · {queue.filter(q=>q.status==='SYNCED').length} synced · {failed} failed.</p><span>{syncing?'Syncing pending attendance…':online?'Online · sync enabled':'Offline · waiting for connection'}</span></div></div>
  {preview&&scanned&&teacher&&<div className="qr-modal-backdrop" role="presentation"><section className="qr-preview-modal" role="dialog" aria-modal="true" aria-labelledby="qr-preview-title"><header><div><span>STEP 04 · FINAL VERIFICATION</span><h3 id="qr-preview-title">Preview attendance</h3></div><button onClick={()=>setPreview(false)} aria-label="Close preview"><X size={18}/></button></header><div className="qr-preview-details"><span><small>DATE</small><b>{new Date(date+'T00:00:00').toLocaleDateString('en-IN')}</b></span><span><small>SESSION</small><b>{activeSession}</b></span><span><small>STANDARD / SECTION</small><b>{scanned.name} · {sectionName}</b></span><span><small>TEACHER ID</small><b>{teacher.id}</b></span></div><div className="qr-preview-counts"><span>Total <b>{students.length}</b></span><span>Present <b className="green-count">{present}</b></span><span>Absent <b className="red-count">{absent}</b></span></div><div className="qr-submit-warning" role="alert"><b>⚠️ Please check before submitting</b><span>Once you submit this attendance, it cannot be modified. Verify every student's status, the date, standard and section before confirming.</span></div><div className="qr-preview-list">{students.map(s=><div className={'qr-preview-student '+((marks[s.id]||'PRESENT')==='ABSENT'?'absent':'present')} key={s.id}><span>{s.details.roll_number||s.id} · {s.name}</span><b>{marks[s.id]||'PRESENT'}</b></div>)}</div><footer><button className="qr-secondary" onClick={()=>setPreview(false)}>Back to list</button><button className="qr-primary" onClick={()=>void submitAttendance()}>Confirm & Submit <Check size={16}/></button></footer></section></div>}
 </div>
}
