import { useEffect, useState } from "react";
import { Check, ChevronRight, GraduationCap, LockKeyhole, QrCode, ShieldCheck, Wifi, WifiOff } from "lucide-react";
import { supabase } from "../lib/supabase";
import "./mobile-qr-attendance.css";

type Student = { person_id: string; full_name: string; roll_number: string };
type QrInfo = { school_id: string; school_name: string; standard_name: string; sections: string[]; academic_year: string };
const today = () => { const d = new Date(); return [d.getFullYear(),String(d.getMonth()+1).padStart(2,"0"),String(d.getDate()).padStart(2,"0")].join("-"); };
const sessionCode = () => new Date().getHours() < 12 ? "MORNING" : "AFTERNOON";

export default function PublicQRAttendance({ token }: { token: string }) {
 const [info,setInfo]=useState<QrInfo|null>(null),[loading,setLoading]=useState(true);
 const [teacherId,setTeacherId]=useState(""),[password,setPassword]=useState("");
 const [teacher,setTeacher]=useState<{person_id:string;full_name:string}|null>(null);
 const [sections,setSections]=useState<string[]>([]),[section,setSection]=useState("");
 const [students,setStudents]=useState<Student[]>([]),[marks,setMarks]=useState<Record<string,"PRESENT"|"ABSENT">>({}),[checkedIn,setCheckedIn]=useState(false);
 const [busy,setBusy]=useState(false),[error,setError]=useState(""),[complete,setComplete]=useState(false);
 const [online,setOnline]=useState(navigator.onLine);
 const date=today(),session=sessionCode();
 useEffect(()=>{const on=()=>setOnline(true),off=()=>setOnline(false);window.addEventListener("online",on);window.addEventListener("offline",off);return()=>{window.removeEventListener("online",on);window.removeEventListener("offline",off)}},[]);
 useEffect(()=>{let live=true;setLoading(true);supabase.functions.invoke("qr-attendance",{body:{action:"resolve_qr",qr_token:token}}).then(({data,error})=>{if(!live)return;if(error||data?.error){setError(data?.error||error?.message||"This QR code could not be validated.");}else setInfo(data as QrInfo);setLoading(false)});return()=>{live=false}},[token]);
 const present=students.filter(s=>(marks[s.person_id]||"PRESENT")==="PRESENT").length;
 const absent=students.length-present;
 const call=async(action:string,extra:Record<string,unknown>={})=>{
  const {data,error}=await supabase.functions.invoke("qr-attendance",{body:{action,qr_token:token,...extra}});
  if(error||data?.error)throw new Error(data?.error||error?.message||"Attendance request failed.");
  return data;
 };
 const verify=async()=>{
  if(busy)return;setBusy(true);setError("");
  try{const data=await call("verify_teacher",{teacher_id:teacherId.trim(),password});setTeacher(data.teacher);setSections(data.assigned_sections||[]);setSection((data.assigned_sections||[]).length===1?data.assigned_sections[0]:"");}
  catch(e){setError(e instanceof Error?e.message:"Teacher verification failed.");}
  finally{setBusy(false)}
 };
 const checkIn=async()=>{
  if(!teacher||!section||busy||!online)return;setBusy(true);setError("");
  try{const data=await call("check_in",{teacher_id:teacherId.trim(),password,section_name:section,attendance_date:date,session_code:session});setStudents(data.students||[]);setMarks({});setCheckedIn(true);}
  catch(e){setError(e instanceof Error?e.message:"Teacher check-in failed.");}
  finally{setBusy(false)}
 };
 const submit=async()=>{
  if(!teacher||!students.length||busy||!online)return;setBusy(true);setError("");
  try{await call("submit_attendance",{teacher_id:teacherId.trim(),password,section_name:section,attendance_date:date,session_code:session,marks:students.map(s=>({student_person_id:s.person_id,attendance_status:marks[s.person_id]||"PRESENT"}))});setComplete(true);}
  catch(e){setError(e instanceof Error?e.message:"Attendance could not be submitted.");}
  finally{setBusy(false)}
 };
 if(!token)return <main className="qr-attendance"><div className="qr-main-card"><h2>Classroom QR missing</h2><p>Scan the permanent QR code displayed in your classroom.</p></div></main>;
 return <main className="qr-attendance">
  <header className="qr-attendance-head"><div><span className="section-eyebrow">SCHOOL ATTENDANCE · QR ACCESS</span><h2>{info?.school_name||"Classroom Attendance"}</h2><p>Teacher scan-in and student attendance register.</p></div><div className={"qr-network "+(online?"is-online":"is-offline")}>{online?<Wifi size={15}/>:<WifiOff size={15}/>} {online?"Online":"Offline"}</div></header>
  {loading?<div className="qr-main-card">Validating classroom QR…</div>:error&&!info?<div className="qr-main-card"><div className="qr-error">{error}</div></div>:info&&<div className="qr-main-card">
   <div className="qr-step-title"><div className="qr-step-icon"><QrCode/></div><div><span>PERMANENT CLASSROOM QR</span><h3>{info.standard_name}</h3><p>Academic year {info.academic_year} · {date} · {session}</p></div></div>
   {complete?<div className="qr-complete-panel"><Check size={36}/><h2>Attendance submitted</h2><p>Teacher check-in and {students.length} student records have been saved.</p></div>:!teacher?<><label className="qr-field">Teacher ID<input value={teacherId} onChange={e=>setTeacherId(e.target.value)} placeholder="Enter your school-issued Teacher ID" autoCapitalize="characters"/></label><label className="qr-field">Attendance password<input type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="Password provided by school office" autoComplete="current-password"/></label><div className="qr-security-row"><span><ShieldCheck size={14}/> No RADX app account required</span><span><LockKeyhole size={14}/> School-issued credentials</span></div><button className="qr-primary" onClick={()=>void verify()} disabled={busy||!teacherId.trim()||!password}>{busy?"Verifying…":"Verify Teacher"} <ChevronRight size={17}/></button></>:!checkedIn?<><div className="qr-class-chip"><GraduationCap size={16}/>{teacher.full_name}<span>Teacher verified</span></div><label className="qr-field">Assigned section<select value={section} onChange={e=>setSection(e.target.value)}><option value="">Select section</option>{sections.map(s=><option key={s} value={s}>{s}</option>)}</select></label><button className="qr-primary" onClick={()=>void checkIn()} disabled={busy||!section||!online}>{busy?"Checking in…":"Mark Teacher Present & Open Register"} <ChevronRight size={17}/></button></>:<><div className="qr-register-meta"><div><b>{teacher.full_name}</b><span>{info.standard_name} · Section {section} · {students.length} students</span></div><span className="qr-verified"><ShieldCheck size={14}/> Teacher Present</span></div><div className="qr-register-list">{students.length===0?<div className="empty-module">No students are allocated to this section yet.</div>:students.map(student=><div className="qr-register-row" key={student.person_id}><div><b>{student.full_name}</b><small>{student.roll_number}</small></div><div className="qr-mark-toggle"><button className={(marks[student.person_id]||"PRESENT")==="PRESENT"?"selected-present":""} onClick={()=>setMarks(v=>({...v,[student.person_id]:"PRESENT"}))}>Present</button><button className={marks[student.person_id]==="ABSENT"?"selected-absent":""} onClick={()=>setMarks(v=>({...v,[student.person_id]:"ABSENT"}))}>Absent</button></div></div>)}</div><div className="qr-summary-strip"><span>{students.length} Students</span><span>{present} Present</span><span>{absent} Absent</span></div><button className="qr-primary" onClick={()=>void submit()} disabled={busy||!online||!students.length}>{busy?"Submitting…":"Submit Attendance"} <Check size={17}/></button></>}
   {error&&<div className="qr-error" role="alert">{error}</div>}
   {!online&&<div className="qr-error">Internet connection is required to verify credentials and securely submit attendance. Please reconnect before continuing.</div>}
  </div>}
 </main>;
}
