import { useEffect, useMemo, useRef, useState } from 'react'
import './mobile-qr-attendance.css'
import { Camera, Check, ChevronLeft, ChevronRight, Clock3, Download, MapPin, QrCode, ShieldCheck, Smartphone, Users, Wifi, WifiOff, X } from 'lucide-react'

type Standard = { id: string; name: string; qr_token: string; sections: { id: string; name: string }[] }
type Student = { id: string; roll_no: string; full_name: string; standard_id: string; section_id: string; is_active: boolean }
type Teacher = { emp_id: string; full_name: string; profile_photo_url: string; allotments: { standard_id: string; section_id: string }[] }
type Session = 'MORNING' | 'AFTERNOON'
type Mark = 'PRESENT' | 'ABSENT'
type QueueItem = { id: string; payload: Record<string, unknown>; status: 'PENDING' | 'SYNCED'; created_at: string }

const seedStandards: Standard[] = [
  { id: 'std-10', name: 'Grade 10', qr_token: 'qr-grade-10-permanent-uuid', sections: [{ id: '10-a', name: 'Section A' }, { id: '10-b', name: 'Section B' }] },
  { id: 'std-9', name: 'Grade 9', qr_token: 'qr-grade-9-permanent-uuid', sections: [{ id: '9-a', name: 'Section A' }] },
  { id: 'std-8', name: 'Grade 8', qr_token: 'qr-grade-8-permanent-uuid', sections: [{ id: '8-a', name: 'Section A' }] },
]
const seedStudents: Student[] = [
  ...['Aarav Kumar','Aadhya Raj','Abinaya S','Akash M','Ananya R','Arjun V','Bhavya K','Charan P','Dhanya S','Dinesh R','Harini M','Ishaan K'].map((name, i) => ({ id: 's10a-'+i, roll_no: String(i+1).padStart(2,'0'), full_name: name, standard_id: 'std-10', section_id: '10-a', is_active: true })),
  ...['Kavin S','Keerthana P','Mithun R','Nila K','Pranav M','Rithika S'].map((name, i) => ({ id: 's10b-'+i, roll_no: String(i+1).padStart(2,'0'), full_name: name, standard_id: 'std-10', section_id: '10-b', is_active: true })),
  ...['Anand S','Bala M','Charu R'].map((name, i) => ({ id: 's9a-'+i, roll_no: String(i+1).padStart(2,'0'), full_name: name, standard_id: 'std-9', section_id: '9-a', is_active: true })),
]
const seedTeachers: Teacher[] = [
  { emp_id: 'TCH-001', full_name: 'Meena Krishnan', profile_photo_url: 'https://i.pravatar.cc/120?img=47', allotments: [{standard_id:'std-10',section_id:'10-a'},{standard_id:'std-10',section_id:'10-b'},{standard_id:'std-9',section_id:'9-a'}] },
  { emp_id: 'TCH-014', full_name: 'Arun Kumar', profile_photo_url: 'https://i.pravatar.cc/120?img=12', allotments: [{standard_id:'std-10',section_id:'10-a'}] },
]
const schedule = [{session_name:'MORNING' as Session,start_time:'08:00',end_time:'10:00',is_active:true},{session_name:'AFTERNOON' as Session,start_time:'13:00',end_time:'15:00',is_active:true}]
const today = () => new Date().toLocaleDateString('en-CA')
const readQueue = (): QueueItem[] => { try { return JSON.parse(localStorage.getItem('acadamix-attendance-queue') || '[]') as QueueItem[] } catch { return [] } }

export default function MobileQRAttendance({ standards: appStandards, notify }: { standards?: {name:string;sections:string[]}[]; notify?: (message:string)=>void }) {
  const standards = useMemo(() => seedStandards.map((s, i) => { const configured = appStandards?.[i]; const sectionNames = configured?.sections?.length ? configured.sections : s.sections.map(x=>x.name); return {...s, name: configured?.name || s.name, sections: sectionNames.map((name,j)=>({id:s.sections[j]?.id || s.id+'-'+j,name}))} }), [appStandards])
  const [step,setStep] = useState(1)
  const [token,setToken] = useState('')
  const [scanned,setScanned] = useState<Standard|null>(null)
  const [empId,setEmpId] = useState('')
  const [teacher,setTeacher] = useState<Teacher|null>(null)
  const [sectionId,setSectionId] = useState('')
  const [marks,setMarks] = useState<Record<string,Mark>>({})
  const [preview,setPreview] = useState(false)
  const [queue,setQueue] = useState<QueueItem[]>(readQueue)
  const [online,setOnline] = useState(navigator.onLine)
  const [gps,setGps] = useState<{lat:number;lng:number;distance:number}|null>(null)
  const [gpsStatus,setGpsStatus] = useState<'idle'|'checking'|'passed'|'blocked'>('idle')
  const [clockOffset,setClockOffset] = useState(0)
  const [cameraOn,setCameraOn] = useState(false)
  const [cameraError,setCameraError] = useState('')
  const [scanError,setScanError] = useState('')
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream|null>(null)
  const [geofence] = useState({lat:11.0168,lng:76.9558,radius_meters:250})
  const [scheduleRows] = useState(schedule)
  const [activeSession,setActiveSession] = useState<Session>('MORNING')
  const [nowTick,setNowTick] = useState(Date.now())

  useEffect(() => {
    const serverTime = Date.now()
    setClockOffset(serverTime - Date.now())
    const timer = window.setInterval(()=>setNowTick(Date.now()),15000)
    const onlineHandler=()=>setOnline(true), offlineHandler=()=>setOnline(false)
    window.addEventListener('online',onlineHandler);window.addEventListener('offline',offlineHandler)
    return ()=>{window.clearInterval(timer);window.removeEventListener('online',onlineHandler);window.removeEventListener('offline',offlineHandler);streamRef.current?.getTracks().forEach(t=>t.stop())}
  },[])
  useEffect(()=>{localStorage.setItem('acadamix-attendance-queue',JSON.stringify(queue))},[queue])
  useEffect(()=>{
    if(!cameraOn || !videoRef.current)return
    let active=true
    const start=async()=>{
      try{
        const stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'}},audio:false})
        if(!active){stream.getTracks().forEach(t=>t.stop());return}
        streamRef.current=stream;videoRef.current!.srcObject=stream;await videoRef.current!.play()
        const Detector=(window as unknown as {BarcodeDetector?:new (opts:{formats:string[]})=>{detect:(video:HTMLVideoElement)=>Promise<{rawValue:string}[]>}}).BarcodeDetector
        if(Detector){
          const detector=new Detector({formats:['qr_code']})
          const scan=async()=>{if(!active||!videoRef.current)return;try{const codes=await detector.detect(videoRef.current);if(codes[0]?.rawValue){setToken(codes[0].rawValue);setCameraOn(false);setScanError('QR detected. Tap Validate QR to continue.');return}}catch{}requestAnimationFrame(scan)}
          requestAnimationFrame(scan)
        }else setCameraError('Live QR detection is not supported in this browser. Enter the QR token below.')
      }catch{setCameraError('Camera permission is unavailable. Enter the QR token below.')}
    }
    void start()
    return()=>{active=false;streamRef.current?.getTracks().forEach(t=>t.stop());streamRef.current=null}
  },[cameraOn])
  const trueTime = new Date(nowTick + clockOffset)
  const timeString = trueTime.toTimeString().slice(0,5)
  const total=studentsForSection().length
  const students = studentsForSection()
  const present=students.filter(s=>(marks[s.id]||'PRESENT')==='PRESENT').length
  const absent=total-present
  const section=standards.flatMap(s=>s.sections).find(s=>s.id===sectionId)
  const alreadySubmitted = !!(scanned && sectionId && queue.some(item => { const payload=item.payload; return payload.date===today() && payload.session===activeSession && payload.standard_id===scanned.id && payload.section_id===sectionId }))
  function studentsForSection(){return seedStudents.filter(s=>s.is_active&&s.standard_id===scanned?.id&&s.section_id===sectionId).sort((a,b)=>a.roll_no.localeCompare(b.roll_no,undefined,{numeric:true}))}
  const distanceMeters=(lat1:number,lon1:number,lat2:number,lon2:number)=>{const rad=(v:number)=>v*Math.PI/180;const dLat=rad(lat2-lat1),dLon=rad(lon2-lon1);const a=Math.sin(dLat/2)**2+Math.cos(rad(lat1))*Math.cos(rad(lat2))*Math.sin(dLon/2)**2;return 6371000*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a))}
  const validateGate=async()=>{
    setScanError('')
    const found=standards.find(s=>s.qr_token===token.trim())
    if(!found){setScanError('This classroom QR code is not recognized.');return}
    setScanned(found)
    setGpsStatus('checking')
    if(!navigator.geolocation){setGpsStatus('blocked');setScanError('Location is required to verify the school campus.');return}
    navigator.geolocation.getCurrentPosition(pos=>{
      const distance=distanceMeters(pos.coords.latitude,pos.coords.longitude,geofence.lat,geofence.lng)
      setGps({lat:pos.coords.latitude,lng:pos.coords.longitude,distance})
      if(distance>geofence.radius_meters){setGpsStatus('blocked');setScanError('You are outside the permitted school campus radius.');return}
      setGpsStatus('passed')
      const match=scheduleRows.find(s=>s.is_active&&timeString>=s.start_time&&timeString<=s.end_time)
      if(!match){setScanError('Attendance is closed. Current time is outside the active Morning / Afternoon schedule.');return}
      setActiveSession(match.session_name);setStep(2)
    },()=>{setGpsStatus('blocked');setScanError('Location permission is required. Enable location and retry.')},{enableHighAccuracy:true,timeout:10000,maximumAge:30000})
  }
  const verifyTeacher=()=>{
    const found=seedTeachers.find(t=>t.emp_id.toLowerCase()===empId.trim().toLowerCase())
    if(!found){setScanError('Employee ID was not found. Check the ID and retry.');return}
    if(!found.allotments.some(a=>a.standard_id===scanned?.id)){setScanError('This teacher is not allotted to the scanned standard.');return}
    setTeacher(found);setScanError('')
    const allotted=found.allotments.filter(a=>a.standard_id===scanned?.id)
    if(allotted.length===1){setSectionId(allotted[0].section_id);setStep(3)}else{setSectionId('');setStep(3)}
  }
  const chooseSection=(id:string)=>{setSectionId(id);setMarks({})}
  const openPreview=()=>{if(alreadySubmitted)return;setPreview(true)}
  const confirmSubmit=()=>{
    if(!scanned||!teacher||!sectionId||!gps)return
    const payload={date:today(),session:activeSession,standard_id:scanned.id,section_id:sectionId,marked_by_emp_id:teacher.emp_id,submitted_at:new Date(Date.now()+clockOffset).toISOString(),gps_coordinates:{lat:gps.lat,lng:gps.lng},attendance:students.map(s=>({student_id:s.id,status:marks[s.id]||'PRESENT'}))}
    const item:QueueItem={id:crypto.randomUUID(),payload,status:'PENDING',created_at:new Date().toISOString()}
    setQueue(items=>[item,...items]);setPreview(false);setStep(4)
    notify?.(online?'Attendance saved in frontend preview. Backend sync will be connected later.':'Saved Offline')
  }
  const pending=queue.filter(q=>q.status==='PENDING').length
  const sectionOptions=teacher&&scanned?teacher.allotments.filter(a=>a.standard_id===scanned.id).map(a=>scanned.sections.find(s=>s.id===a.section_id)).filter(Boolean):[]
  const reset=()=>{setStep(1);setToken('');setScanned(null);setEmpId('');setTeacher(null);setSectionId('');setMarks({});setPreview(false);setScanError('');setGpsStatus('idle')}
  const stepNames=['Scan QR','Verify teacher','Mark attendance','Complete']
  return <div className="qr-attendance">
    <div className="qr-attendance-head"><div><span className="section-eyebrow">MOBILE ATTENDANCE · 6-STEP FLOW</span><h2>QR Attendance</h2><p>Scan the classroom code, verify your teacher ID and mark the register.</p></div><div className={'qr-network '+(online?'is-online':'is-offline')}>{online?<Wifi size={15}/>:<WifiOff size={15}/>} {online?'Online':'Offline'}</div></div>
    <div className="qr-progress">{stepNames.map((name,i)=><div className={'qr-progress-step '+(step===i+1?'current':step>i+1?'done':'')} key={name}><span>{step>i+1?<Check size={13}/>:i+1}</span><small>{name}</small></div>)}</div>
    <div className="qr-main-card">
      {step===1&&<><div className="qr-step-title"><div className="qr-step-icon"><QrCode/></div><div><span>STEP 01 · GATEKEEPER</span><h3>Scan classroom QR</h3><p>Use the permanent QR displayed on the classroom board.</p></div></div>
        <div className="qr-camera-box">{cameraOn?<video ref={videoRef} muted playsInline/>:<div className="qr-camera-placeholder"><QrCode size={48}/><b>Classroom QR scanner</b><span>Point your camera at the classroom QR code.</span></div>}</div>
        <div className="qr-camera-actions"><button className="qr-secondary" onClick={()=>{setCameraError('');setCameraOn(v=>!v)}}><Camera size={16}/>{cameraOn?'Stop camera':'Open camera'}</button><span>Permanent classroom QR · UUID token</span></div>
        <label className="qr-field">QR token<input value={token} onChange={e=>setToken(e.target.value)} placeholder="Scan or enter QR token"/></label>
        <div className="qr-demo-hint">Demo QR token: <button onClick={()=>setToken('qr-grade-10-permanent-uuid')}>Grade 10</button> <button onClick={()=>setToken('qr-grade-9-permanent-uuid')}>Grade 9</button></div>
        <button className="qr-primary" onClick={validateGate} disabled={!token.trim()}>Validate QR & campus <ChevronRight size={17}/></button>
        <div className="qr-security-row"><span><MapPin size={14}/> Demo campus radius {geofence.radius_meters}m</span><span><Clock3 size={14}/> Demo schedule validation</span></div>
        {gpsStatus==='passed'&&<div className="qr-success-line"><Check size={15}/> Demo campus check passed · {Math.round(gps?.distance||0)}m from configured point</div>}
      </>}
      {step===2&&scanned&&<><div className="qr-step-title"><div className="qr-step-icon"><ShieldCheck/></div><div><span>STEP 02 · TEACHER VERIFICATION</span><h3>Verify your identity</h3><p>Enter your employee ID. Only allotted teachers can mark this class.</p></div></div><div className="qr-class-chip"><QrCode size={16}/>{scanned.name}<span>{activeSession}</span></div><label className="qr-field">Teacher employee ID<input value={empId} onChange={e=>setEmpId(e.target.value)} placeholder="e.g. TCH-001" autoCapitalize="characters"/></label><button className="qr-primary" onClick={verifyTeacher}>Verify teacher <ChevronRight size={17}/></button><div className="qr-demo-hint">Demo IDs: <button onClick={()=>setEmpId('TCH-001')}>TCH-001</button><button onClick={()=>setEmpId('TCH-014')}>TCH-014</button></div></>}
      {step===3&&teacher&&scanned&&<><div className="qr-step-title"><div className="qr-step-icon"><Users/></div><div><span>STEP 03 · ATTENDANCE REGISTER</span><h3>Mark student attendance</h3><p>Students default to Present. Tap a student to mark Absent.</p></div></div>
        <div className="qr-teacher-card"><img src={teacher.profile_photo_url} alt={teacher.full_name}/><div><b>{teacher.full_name}</b><span>{teacher.emp_id} · Verified teacher</span></div><span className="qr-verified"><ShieldCheck size={14}/> Verified</span></div>
        <div className="qr-register-meta"><div><small>STANDARD</small><b>{scanned.name}</b></div><div><small>SESSION</small><b>{activeSession}</b></div><div><small>DATE</small><b>{new Date().toLocaleDateString('en-IN')}</b></div></div>
        {sectionOptions.length>1?<label className="qr-field">Select allotted section<select value={sectionId} onChange={e=>chooseSection(e.target.value)}><option value="">Choose section</option>{sectionOptions.map(s=><option key={s!.id} value={s!.id}>{s!.name}</option>)}</select></label>:<div className="qr-section-auto"><span>SECTION AUTO-SELECTED</span><b>{sectionOptions[0]?.name||section?.name||'Section'}</b></div>}
        {sectionId&&<><div className="qr-list-heading"><b>Student list</b><span>{total} active students · sorted by roll number</span></div>{alreadySubmitted&&<div className="qr-locked"><ShieldCheck size={16}/> Attendance already submitted for this session. Editing is locked.</div>}
          <div className="qr-student-list">{students.map(s=>{const isPresent=(marks[s.id]||'PRESENT')==='PRESENT';return <button type="button" disabled={alreadySubmitted} className={'qr-student-row '+(isPresent?'present':'absent')} key={s.id} onClick={()=>setMarks(m=>({...m,[s.id]:isPresent?'ABSENT':'PRESENT'}))}><span className="qr-roll">{s.roll_no}</span><span className="qr-student-name">{s.full_name}</span><span className={'qr-status-pill '+(isPresent?'present':'absent')}>{isPresent?'PRESENT':'ABSENT'}</span><span className={'qr-switch '+(isPresent?'on':'')}></span></button>})}</div>
          <div className="qr-sticky-counts"><div><small>Total</small><b>{total}</b></div><div><small>Present</small><b className="green-count">{present}</b></div><div><small>Absent</small><b className="red-count">{absent}</b></div><button className="qr-primary" disabled={alreadySubmitted||!total} onClick={openPreview}>Preview & Submit <ChevronRight size={16}/></button></div></>}
      </>}
      {step===4&&<div className="qr-complete"><div className="qr-complete-icon"><Check size={32}/></div><span>ATTENDANCE SAVED</span><h3>{online?'Saved · backend sync pending':'Saved Offline'}</h3><p>Your attendance has been stored on this device. Backend submission and parent alerts will be enabled when the backend is connected.</p><div className="qr-queue-status"><span>{online?'Backend sync not connected':'Waiting for connection'}</span><b>{pending} pending</b></div><button className="qr-primary" onClick={reset}>Start next attendance <ChevronRight size={16}/></button></div>}
    </div>
    {scanError&&<div className="qr-error"><X size={15}/>{scanError}</div>}{cameraError&&<div className="qr-error">{cameraError}</div>}
    <div className="qr-bottom-grid"><div className="qr-info-card"><div><Smartphone size={17}/><b>Offline-first register</b></div><p>Local queue stores lightweight attendance JSON on this device. Backend sync will be connected later.</p><span><Clock3 size={13}/> Demo clock offset: {Math.round(clockOffset/1000)}s · Local preview time {timeString}</span></div><div className="qr-info-card"><div><Download size={17}/><b>Sync queue</b><span className="qr-pending-count">{pending} pending</span></div><p>{queue.length} local submissions · {queue.filter(q=>q.status==='SYNCED').length} synced.</p><span>{online?'Online · backend sync pending':'Offline · saved locally'}</span></div></div>
    {preview&&scanned&&teacher&&<div className="qr-modal-backdrop" role="presentation"><section className="qr-preview-modal" role="dialog" aria-modal="true" aria-labelledby="qr-preview-title"><header><div><span>STEP 04 · FINAL VERIFICATION</span><h3 id="qr-preview-title">Preview attendance</h3></div><button onClick={()=>setPreview(false)} aria-label="Close preview"><X size={18}/></button></header><div className="qr-preview-details"><span><small>DATE</small><b>{new Date().toLocaleDateString('en-IN')}</b></span><span><small>SESSION</small><b>{activeSession}</b></span><span><small>STANDARD / SECTION</small><b>{scanned.name} · {section?.name}</b></span><span><small>TEACHER ID</small><b>{teacher.emp_id}</b></span></div><div className="qr-preview-counts"><span>Total <b>{total}</b></span><span>Present <b className="green-count">{present}</b></span><span>Absent <b className="red-count">{absent}</b></span></div><div className="qr-preview-list">{[...students].sort((a,b)=>((marks[a.id]||'PRESENT')==='ABSENT'?0:1)-((marks[b.id]||'PRESENT')==='ABSENT'?0:1)).map(s=><div className={'qr-preview-student '+((marks[s.id]||'PRESENT')==='ABSENT'?'absent':'present')} key={s.id}><span>{s.roll_no} · {s.full_name}</span><b>{marks[s.id]||'PRESENT'}</b></div>)}</div><footer><button className="qr-secondary" onClick={()=>setPreview(false)}>Back to list</button><button className="qr-primary" onClick={confirmSubmit}>Confirm & Submit <Check size={16}/></button></footer></section></div>}
  </div>
}
