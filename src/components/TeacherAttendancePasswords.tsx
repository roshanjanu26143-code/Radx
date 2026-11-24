import { useState, type FormEvent } from "react";
import { KeyRound, ShieldCheck } from "lucide-react";
import { supabase } from "../lib/supabase";

type Teacher = { id: string; name: string };
export default function TeacherAttendancePasswords({ schoolId, teachers, notify }: { schoolId: string; teachers: Teacher[]; notify: (message: string) => void }) {
 const [teacherId,setTeacherId]=useState("");
 const [password,setPassword]=useState("");
 const [confirm,setConfirm]=useState("");
 const [saving,setSaving]=useState(false);
 const selected=teachers.find(t=>t.id===teacherId);
 const submit=async(event:FormEvent<HTMLFormElement>)=>{
  event.preventDefault();
  if(!selected){notify("Select a teacher profile.");return}
  if(password.length<8||password.length>72){notify("Password must be 8 to 72 characters.");return}
  if(password!==confirm){notify("The passwords do not match.");return}
  setSaving(true);
  const {data,error}=await supabase.functions.invoke("qr-attendance",{body:{action:"set_password",school_id:schoolId,teacher_person_id:teacherId,password}});
  setSaving(false);
  if(error||!data?.success){notify(data?.error||error?.message||"Attendance password could not be saved.");return}
  setPassword("");setConfirm("");notify("QR attendance password saved for "+selected.name+". Share it privately with the teacher.");
 };
 return <section className="workspace-panel">
  <div className="workspace-heading"><div><span className="section-eyebrow">CLASSROOM QR SECURITY</span><h2>Teacher QR passwords</h2><p>Set or reset the password teachers use after scanning their permanent classroom QR. This does not create an app login.</p></div></div>
  {!teachers.length?<div className="empty-module">Create a teacher profile first.</div>:<form className="people-form" onSubmit={submit}>
   <div className="people-form-grid">
    <label>Teacher<select value={teacherId} onChange={e=>setTeacherId(e.target.value)} required><option value="">Select teacher</option>{teachers.map(t=><option key={t.id} value={t.id}>{t.name} · {t.id}</option>)}</select></label>
    <label>New attendance password<input type="password" value={password} onChange={e=>setPassword(e.target.value)} minLength={8} maxLength={72} autoComplete="new-password" required placeholder="8–72 characters"/></label>
    <label>Confirm password<input type="password" value={confirm} onChange={e=>setConfirm(e.target.value)} minLength={8} maxLength={72} autoComplete="new-password" required placeholder="Re-enter password"/></label>
   </div>
   <button className="primary-action" type="submit" disabled={saving||!teacherId}>{saving?"Saving securely…": "Save QR attendance password"}</button>
   <p className="people-form-note"><KeyRound size={14}/> Passwords are stored as salted PBKDF2 hashes. Only the QR attendance service can verify them.</p>
   <p className="people-form-note"><ShieldCheck size={14}/> Five incorrect attempts temporarily lock the credential for 15 minutes.</p>
  </form>}
 </section>;
}
