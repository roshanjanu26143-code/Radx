import { MessageCircle, MessageSquare, ShieldCheck, Clock3, BellRing, FileText, CalendarDays, Wallet, Bus, Users, CheckCircle2, AlertCircle, LockKeyhole } from 'lucide-react'
import './CommunicationConnectors.css'

type Props={channel:'WhatsApp'|'SMS'}
const whatsappFeatures=[
 {icon:BellRing,title:'Attendance alerts',detail:'Notify the selected parent contact when attendance is recorded or a student is absent.'},
 {icon:FileText,title:'Announcements & circulars',detail:'Send school notices to all parents, a standard, a section or an individual student contact.'},
 {icon:CalendarDays,title:'Exam schedule & results',detail:'Share examination dates, result availability and important academic updates.'},
 {icon:Wallet,title:'Fee reminders',detail:'Send due-date reminders and payment acknowledgements.'},
 {icon:Bus,title:'Transport updates',detail:'Share route, bus and important transport notifications.'},
]
const smsFeatures=[
 {icon:BellRing,title:'Attendance SMS',detail:'Short attendance and absence alerts to the primary parent contact.'},
 {icon:FileText,title:'Urgent school notices',detail:'Deliver concise alerts when a WhatsApp message is not suitable.'},
 {icon:CalendarDays,title:'Exam reminders',detail:'Send exam dates, schedule changes and result notifications.'},
 {icon:Wallet,title:'Fee due reminders',detail:'Send concise fee due and payment confirmation messages.'},
 {icon:Bus,title:'Transport alerts',detail:'Notify parents about delays, route changes and bus updates.'},
]
export default function CommunicationConnectors({channel}:Props){
 const isWhatsApp=channel==='WhatsApp'
 const features=isWhatsApp?whatsappFeatures:smsFeatures
 return <div className="communication-connectors">
  <section className="connector-hero">
   <div className={'connector-brand '+(isWhatsApp?'whatsapp':'sms')}>{isWhatsApp?<MessageCircle size={27}/>:<MessageSquare size={27}/>}</div>
   <div className="connector-heading"><span className="section-eyebrow">COMMUNICATION CONNECTOR</span><h2>{isWhatsApp?'WhatsApp Business':'SMS Gateway'}</h2><p>{isWhatsApp?'Send school updates directly to parents through the WhatsApp Business Platform.':'Send important school updates to parent mobile numbers through an SMS provider.'}</p></div>
   <span className="connector-status"><i/> Not connected</span>
  </section>
  <section className="connector-panel">
   <div className="connector-panel-title"><div><h3>Available communication features</h3><p>These are the school events this connector can support after provider setup.</p></div><span className="connector-count">{features.length} features</span></div>
   <div className="connector-feature-grid">{features.map(item=><article className="connector-feature" key={item.title}><span className="connector-feature-icon"><item.icon size={18}/></span><div><b>{item.title}</b><p>{item.detail}</p></div></article>)}</div>
  </section>
  <section className="connector-panel">
   <div className="connector-panel-title"><div><h3>Delivery rules</h3><p>RADX uses the contact and audience selected by the school.</p></div></div>
   <div className="connector-rules">
    <div><Users size={17}/><span><b>Primary parent contact</b><small>Uses the Father, Mother or Guardian contact selected in Student Admission.</small></span></div>
    <div><Clock3 size={17}/><span><b>Delivery history</b><small>Store queued, sent, delivered and failed status against each message.</small></span></div>
    <div><ShieldCheck size={17}/><span><b>School data isolation</b><small>Messages and delivery records remain scoped to the active school.</small></span></div>
   </div>
  </section>
  <section className="connector-setup-notice">
   <div className="setup-notice-icon"><LockKeyhole size={19}/></div>
   <div><b>Provider setup is pending</b><p>{isWhatsApp?'Connect a WhatsApp Business Platform provider, verify the business phone number and configure approved message templates.':'Connect an SMS provider and configure the sender ID and delivery credentials.'} Provider credentials will be stored securely as server-side secrets, never in the browser or school tables.</p><small><AlertCircle size={14}/> No messages will be sent until the provider is configured and verified.</small></div>
  </section>
  <div className="connector-footer"><span><CheckCircle2 size={15}/> Feature layout ready</span><span>Configuration can be completed later in Settings → Connectors.</span></div>
 </div>
}
