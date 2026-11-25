import { useState, type FormEvent } from 'react'
import { BellRing, ShieldCheck, Smartphone } from 'lucide-react'
import { supabase } from '../lib/supabase'
import './ParentNotifications.css'

function decodeVapidKey(value: string) {
  const padding = '='.repeat((4 - value.length % 4) % 4)
  const base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  return Uint8Array.from([...raw].map(char => char.charCodeAt(0)))
}

export default function ParentNotifications() {
  const [schoolId,setSchoolId] = useState('')
  const [phone,setPhone] = useState('')
  const [otp,setOtp] = useState('')
  const [step,setStep] = useState<'phone'|'otp'|'done'>('phone')
  const [busy,setBusy] = useState(false)
  const [message,setMessage] = useState('')
  const [error,setError] = useState('')
  const [inbox,setInbox] = useState<any[]>([])

  const requestCode = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError(''); setMessage('')
    const {data,error:invokeError} = await supabase.functions.invoke('parent-push-registration',{body:{action:'request_otp',school_id:schoolId,phone}})
    setBusy(false)
    if(invokeError || data?.error){setError(data?.error || invokeError?.message || 'Could not send verification code.');return}
    setStep('otp');setMessage('A verification code was sent to the registered parent mobile number.')
  }
  const verify = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError(''); setMessage('')
    try {
      const publicKey = (import.meta as any).env?.VITE_VAPID_PUBLIC_KEY as string | undefined
      let subscription: PushSubscription | null = null
      if(publicKey && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window) {
        const permission = await Notification.requestPermission()
        if(permission === 'granted') {
          const registration = await navigator.serviceWorker.register('/sw.js')
          await navigator.serviceWorker.ready
          subscription = await registration.pushManager.getSubscription() || await registration.pushManager.subscribe({
            userVisibleOnly:true,applicationServerKey:decodeVapidKey(publicKey),
          })
        }
      }
      const {data,error:invokeError} = await supabase.functions.invoke('parent-push-registration',{
        body:{action:'verify_and_subscribe',school_id:schoolId,phone,otp,subscription:subscription?.toJSON() || null},
      })
      if(invokeError || data?.error) throw new Error(data?.error || invokeError?.message || 'Could not verify this mobile number.')
      setInbox(data.inbox || [])
      setStep('done');setMessage(subscription ? 'Your parent inbox is ready and push notifications are enabled on this device.' : 'Your parent inbox is ready. Browser push was not enabled on this device.')
    } catch(e) { setError(e instanceof Error ? e.message : 'Could not enable notifications.') }
    finally { setBusy(false) }
  }
  return <main className="parent-push-page">
    <section className="parent-push-card">
      <div className="parent-push-mark"><BellRing size={25}/></div>
      <span className="parent-push-eyebrow">RADX · PARENT CONNECT</span>
      <h1>School updates, right on your phone.</h1>
      <p>Enable notifications to receive important school circulars, reminders and announcements.</p>
      {step==='phone' && <form onSubmit={requestCode}>
        <label>School ID<input value={schoolId} onChange={e=>setSchoolId(e.target.value.toUpperCase())} placeholder="Enter your school ID" required/></label>
        <label>Registered parent mobile number<input type="tel" value={phone} onChange={e=>setPhone(e.target.value)} placeholder="Mobile number used in admission" required/></label>
        <button disabled={busy}>{busy?'Sending code…':'Send verification code'}</button>
      </form>}
      {step==='otp' && <form onSubmit={verify}>
        <label>Six-digit verification code<input inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={otp} onChange={e=>setOtp(e.target.value.replace(/\D/g,'').slice(0,6))} placeholder="000000" required/></label>
        <button disabled={busy || otp.length!==6}>{busy?'Verifying…':'Verify & enable notifications'}</button>
        <button type="button" className="parent-push-back" onClick={()=>{setStep('phone');setOtp('')}}>Change mobile number</button>
      </form>}
      {step==='done' && <><div className="parent-push-success"><ShieldCheck size={24}/><b>Parent inbox verified</b><span>{inbox.length} school updates available</span></div><div className="parent-push-inbox">{inbox.length ? inbox.map(item=><article key={item.id}><time>{new Date(item.created_at).toLocaleString('en-IN',{dateStyle:'medium',timeStyle:'short'})}</time><b>{item.title}</b><p>{item.body}</p>{(item.attachments||[]).map((file:any)=><a key={file.path} href={file.url} target="_blank" rel="noreferrer">{file.name}</a>)}</article>) : <p>No school updates yet. New circulars will appear here.</p>}</div></>}
      {message && <div className="parent-push-message"><Smartphone size={15}/>{message}</div>}
      {error && <div className="parent-push-error">{error}</div>}
      <small>Your mobile number is matched against the contact details provided to the school. Verification codes expire after five minutes.</small>
    </section>
  </main>
}
