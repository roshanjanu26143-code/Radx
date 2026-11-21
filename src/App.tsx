import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { supabase } from './lib/supabase'
import {
  Activity, AlarmClock, ArrowDownRight, ArrowRight, ArrowUpRight, Bell, BookOpen,
  Bus, CalendarDays, ChartNoAxesCombined, Check, ChevronDown, ChevronLeft,
  ChevronRight, CircleHelp, ClipboardCheck, CreditCard, FileText, GraduationCap,
  LayoutDashboard, Library, LogOut, Menu, MessageSquareText, Search, Settings,
  ShieldCheck, Sparkles, Users, Wallet, X, Mail, LockKeyhole, Building2,
  Eye, EyeOff, BadgeCheck, CircleAlert,
} from 'lucide-react'

const navGroups = [
  { label: 'WORKSPACE', items: [
    { name: 'Dashboard', icon: LayoutDashboard },
    { name: 'Students', icon: GraduationCap, count: '1,248' },
    { name: 'Teachers & Staff', icon: Users },
    { name: 'Attendance', icon: ClipboardCheck },
    { name: 'Academics', icon: BookOpen },
  ]},
  { label: 'SCHOOL OPERATIONS', items: [
    { name: 'Fees & Finance', icon: Wallet },
    { name: 'Examinations', icon: FileText },
    { name: 'Transport', icon: Bus },
    { name: 'Library', icon: Library },
    { name: 'Announcements', icon: MessageSquareText },
  ]},
  { label: 'INSIGHTS & CONTROL', items: [
    { name: 'AI Insights', icon: Sparkles, special: true },
    { name: 'Reports', icon: ChartNoAxesCombined },
    { name: 'Administration', icon: ShieldCheck },
    { name: 'Settings', icon: Settings },
  ]},
]

const stats = [
  { label: 'Total students', value: '1,248', change: '+8.2%', note: 'vs. last term', icon: GraduationCap, tone: 'mint' },
  { label: 'Teaching staff', value: '86', change: '+3.1%', note: 'vs. last term', icon: Users, tone: 'lavender' },
  { label: 'Today attendance', value: '94.6%', change: '+2.4%', note: 'vs. yesterday', icon: ClipboardCheck, tone: 'blue' },
  { label: 'Fee collection', value: '₹18.4L', change: '76.8%', note: 'of monthly target', icon: Wallet, tone: 'peach' },
]

const activities = [
  { initials: 'AK', name: 'Ananya Krishnan', detail: 'Admission completed · Grade 6', time: '10:42 AM', color: 'coral' },
  { initials: 'RV', name: 'Rahul Varma', detail: 'Fee payment received · ₹12,500', time: '10:18 AM', color: 'blue' },
  { initials: 'SM', name: 'Staff meeting', detail: 'Academic block · Room 204', time: '09:55 AM', color: 'violet' },
  { initials: 'PK', name: 'Priya Kumar', detail: 'Attendance marked · Grade 8A', time: '09:32 AM', color: 'green' },
]

const events = [
  { day: '24', month: 'NOV', title: 'Unit Test – Mathematics', sub: 'Grade 6–8 · 09:30 AM', color: 'green' },
  { day: '26', month: 'NOV', title: 'Parent–Teacher Meeting', sub: 'Auditorium · 10:00 AM', color: 'purple' },
  { day: '28', month: 'NOV', title: 'Annual Sports Practice', sub: 'School ground · 08:00 AM', color: 'orange' },
]

type NavItem = { label: string; icon: typeof LayoutDashboard; children: string[] }
const schoolNavigation: NavItem[] = [
 {label:'Overview',icon:LayoutDashboard,children:['Dashboard']},
 {label:'Admission',icon:GraduationCap,children:['Create Student']},
 {label:'Academic',icon:BookOpen,children:['Standard','Attendance','Exam Schedules','Performance']},
 {label:'Peoples',icon:Users,children:['Teachers','Staff','Driver & Cleaner','Parent Book']},
 {label:'Transport',icon:Bus,children:['Routes','Buses','Allotment']},
 {label:'Connectors',icon:Activity,children:['OpenCV','GPS - Bus']},
 {label:'Settings',icon:Settings,children:['Common Settings']},
]
type StandardRow={name:string;sections:string[]}
type RouteRow={name:string;start:string;stops:string[];end:string}
export function Dashboard({onSignOut,schoolName,schoolId}:{onSignOut:()=>void;schoolName:string;schoolId:string}) {
 const [activeParent,setActiveParent]=useState('Overview'),[activeChild,setActiveChild]=useState('Dashboard')
 const [dashboardView,setDashboardView]=useState('Academic'),[mobileOpen,setMobileOpen]=useState(false),[showProfile,setShowProfile]=useState(false),[toast,setToast]=useState('')
 const [standards,setStandards]=useState<StandardRow[]>(Array.from({length:12},(_,i)=>({name:'Standard '+(i+1),sections:[]})))
 const [selectedStandard,setSelectedStandard]=useState('Standard 1'),[newSection,setNewSection]=useState('')
 const [routes,setRoutes]=useState<RouteRow[]>([]),[routeName,setRouteName]=useState(''),[routeStart,setRouteStart]=useState(''),[routeEnd,setRouteEnd]=useState(''),[routeStops,setRouteStops]=useState('')
 const [buses,setBuses]=useState<{number:string;driver:string;cleaner:string;route:string}[]>([])
 const [busNumber,setBusNumber]=useState(''),[busDriver,setBusDriver]=useState(''),[busCleaner,setBusCleaner]=useState(''),[busRoute,setBusRoute]=useState('')
 const [townFilter,setTownFilter]=useState(''),[villageFilter,setVillageFilter]=useState(''),[filterAll,setFilterAll]=useState(false)
 const notify=(message:string)=>{setToast(message);window.setTimeout(()=>setToast(''),2800)}
 const currentParent=schoolNavigation.find(item=>item.label===activeParent)||schoolNavigation[0]
 const selectParent=(item:NavItem)=>{setActiveParent(item.label);setActiveChild(item.children[0]);setMobileOpen(false)}
 const selectChild=(item:NavItem,child:string)=>{setActiveParent(item.label);setActiveChild(child);setMobileOpen(false)}
 const addSection=(event:FormEvent<HTMLFormElement>)=>{event.preventDefault();const clean=newSection.trim().toUpperCase();if(!clean)return;const row=standards.find(item=>item.name===selectedStandard);if(row?.sections.includes(clean)){notify('This section already exists.');return}if((row?.sections.length||0)>=10){notify('A standard can have a maximum of 10 sections.');return}setStandards(items=>items.map(item=>item.name===selectedStandard?{...item,sections:[...item.sections,clean]}:item));setNewSection('');notify('Section '+clean+' added.')}
 const addRoute=(event:FormEvent<HTMLFormElement>)=>{event.preventDefault();setRoutes(items=>[...items,{name:routeName.trim(),start:routeStart.trim(),stops:routeStops.split(',').map(x=>x.trim()).filter(Boolean),end:routeEnd.trim()}]);setRouteName('');setRouteStart('');setRouteEnd('');setRouteStops('');notify('Route created.')}
 const addBus=(event:FormEvent<HTMLFormElement>)=>{event.preventDefault();setBuses(items=>[...items,{number:busNumber.trim(),driver:busDriver.trim(),cleaner:busCleaner.trim(),route:busRoute}]);setBusNumber('');setBusDriver('');setBusCleaner('');setBusRoute('');notify('Bus added.')}
 const dashboard=()=> <section className="workspace-panel"><div className="workspace-heading"><div><span className="section-eyebrow">SCHOOL OVERVIEW</span><h2>Dashboard</h2><p>Choose the area you want to review.</p></div></div><div className="dashboard-switches">{['Academic','Transport','Finance'].map(item=><button key={item} className={dashboardView===item?'selected':''} onClick={()=>setDashboardView(item)}>{item}</button>)}</div><div className="dashboard-view-card"><div className="dashboard-view-icon">{dashboardView==='Academic'?<BookOpen/>:dashboardView==='Transport'?<Bus/>:<Wallet/>}</div><div><h3>{dashboardView} overview</h3><p>{dashboardView==='Academic'?'Standards, attendance, exam schedules and performance.':dashboardView==='Transport'?'Routes, buses and student allotments.':'Finance dashboard section.'}</p></div><button onClick={()=>dashboardView==='Academic'?selectChild(schoolNavigation[2],'Standard'):dashboardView==='Transport'?selectChild(schoolNavigation[4],'Routes'):notify('Finance module will be connected in its implementation step.')}>Open {dashboardView} <ArrowRight size={15}/></button></div></section>
 const content=()=>{
  if(activeParent==='Overview')return dashboard()
  if(activeParent==='Academic'&&activeChild==='Standard')return <section className="workspace-panel"><div className="workspace-heading"><div><span className="section-eyebrow">ACADEMIC STRUCTURE</span><h2>Standards & Sections</h2><p>12 standards are created by default. Maximum 10 sections per standard.</p></div></div><div className="standard-layout"><div className="standard-list"><b>Standards</b>{standards.map(row=><button key={row.name} className={selectedStandard===row.name?'chosen':''} onClick={()=>setSelectedStandard(row.name)}>{row.name}<span>{row.sections.length}/10</span></button>)}</div><div className="section-editor"><div className="section-editor-head"><div><span className="section-eyebrow">SELECTED STANDARD</span><h3>{selectedStandard}</h3></div><span className="count-pill">{standards.find(row=>row.name===selectedStandard)?.sections.length||0}/10 sections</span></div><form className="inline-create-form" onSubmit={addSection}><input value={newSection} onChange={e=>setNewSection(e.target.value)} placeholder="Section name (A, B, C...)" required/><button type="submit" disabled={(standards.find(row=>row.name===selectedStandard)?.sections.length||0)>=10}>+ Add section</button></form><div className="section-chip-list">{(standards.find(row=>row.name===selectedStandard)?.sections||[]).length?standards.find(row=>row.name===selectedStandard)?.sections.map(section=><span className="section-chip" key={section}>{section}</span>):<div className="empty-module"><BookOpen size={24}/><b>No sections created</b><span>Add the first section for this standard.</span></div>}</div></div></div></section>
  if(activeParent==='Academic'&&activeChild==='Attendance')return <ModulePlaceholder title="Attendance report" subtitle="Attendance reports for each standard and each section." icon={<ClipboardCheck/>} details={['Choose a standard','Choose a section','View attendance report']}/>
  if(activeParent==='Academic'&&activeChild==='Exam Schedules')return <ModulePlaceholder title="Exam schedules" subtitle="Exam schedules will be allotted by AI. AI implementation will be done later." icon={<CalendarDays/>} details={['AI scheduling is planned','No AI schedules are generated yet']}/>
  if(activeParent==='Academic'&&activeChild==='Performance')return <ModulePlaceholder title="Performance" subtitle="Performance overview of each standard." icon={<ChartNoAxesCombined/>} details={['Select a standard','Performance data will appear when marks are available']}/>
  if(activeParent==='Admission')return <ModulePlaceholder title="Create Student" subtitle="Create a new student admission record." icon={<GraduationCap/>} details={['Student admission form will be implemented in this section']}/>
  if(activeParent==='Peoples')return <ModulePlaceholder title={activeChild} subtitle="School people directory." icon={<Users/>} details={[activeChild+' records','Create and manage records in this section']}/>
  if(activeParent==='Transport'&&activeChild==='Routes')return <section className="workspace-panel"><div className="workspace-heading"><div><span className="section-eyebrow">TRANSPORT MANAGEMENT</span><h2>Routes</h2><p>Enter a start point, intermediate stops and end point.</p></div></div><form className="module-form" onSubmit={addRoute}><label>Route name<input value={routeName} onChange={e=>setRouteName(e.target.value)} placeholder="e.g. Route 01" required/></label><div className="form-two-col"><label>Start point<input value={routeStart} onChange={e=>setRouteStart(e.target.value)} placeholder="Ambur" required/></label><label>End point<input value={routeEnd} onChange={e=>setRouteEnd(e.target.value)} placeholder="School" required/></label></div><label>Intermediate stops <span className="field-hint">(comma separated)</span><input value={routeStops} onChange={e=>setRouteStops(e.target.value)} placeholder="Sugarmill, Vengili, Zameen"/></label><button className="primary-action" type="submit">+ Create route</button></form><div className="route-list">{routes.map((route,index)=><article className="route-card" key={route.name+index}><div className="route-card-title"><b>{route.name}</b><span>{route.stops.length+2} points</span></div><div className="route-timeline"><span className="route-point start-point">{route.start}</span>{route.stops.map((stop,i)=><span className="route-point" key={stop+i}>{stop}</span>)}<span className="route-point end-point">{route.end}</span></div></article>)}{!routes.length&&<div className="empty-module"><Bus size={24}/><b>No routes created</b><span>Create your first route above.</span></div>}</div></section>
  if(activeParent==='Transport'&&activeChild==='Buses')return <section className="workspace-panel"><div className="workspace-heading"><div><span className="section-eyebrow">TRANSPORT MANAGEMENT</span><h2>Buses</h2><p>Register bus number and choose its driver, cleaner and route.</p></div></div><form className="module-form" onSubmit={addBus}><div className="form-two-col"><label>Bus number<input value={busNumber} onChange={e=>setBusNumber(e.target.value)} placeholder="TN 23 AB 1234" required/></label><label>Route<select value={busRoute} onChange={e=>setBusRoute(e.target.value)} required><option value="">Choose route</option>{routes.map(route=><option key={route.name} value={route.name}>{route.name}</option>)}</select></label></div><div className="form-two-col"><label>Driver<input value={busDriver} onChange={e=>setBusDriver(e.target.value)} placeholder="Driver name" required/></label><label>Cleaner<input value={busCleaner} onChange={e=>setBusCleaner(e.target.value)} placeholder="Cleaner name" required/></label></div><button className="primary-action" type="submit" disabled={!routes.length}>+ Add bus</button>{!routes.length&&<span className="field-hint">Create a route before adding a bus.</span>}</form><div className="simple-table"><div className="simple-table-head"><span>Bus number</span><span>Driver</span><span>Cleaner</span><span>Route</span></div>{buses.map(bus=><div className="simple-table-row" key={bus.number}><b>{bus.number}</b><span>{bus.driver}</span><span>{bus.cleaner}</span><span>{bus.route}</span></div>)}{!buses.length&&<div className="empty-table">No buses added yet.</div>}</div></section>
  if(activeParent==='Transport'&&activeChild==='Allotment')return <section className="workspace-panel"><div className="workspace-heading"><div><span className="section-eyebrow">TRANSPORT MANAGEMENT</span><h2>Student allotment</h2><p>Select route and bus, then filter students by town/city or sub-town/village.</p></div></div><div className="module-form"><div className="form-two-col"><label>Route<select><option value="">Choose route</option>{routes.map(route=><option key={route.name}>{route.name}</option>)}</select></label><label>Bus<select><option value="">Choose bus</option>{buses.map(bus=><option key={bus.number}>{bus.number}</option>)}</select></label></div><div className="form-two-col"><label>Town / City<input value={townFilter} onChange={e=>setTownFilter(e.target.value)} placeholder="Town or city"/></label><label>Sub-town / Village<input value={villageFilter} onChange={e=>setVillageFilter(e.target.value)} placeholder="Village or locality"/></label></div><label className="filter-all"><input type="checkbox" checked={filterAll} onChange={e=>setFilterAll(e.target.checked)}/> Show all students</label><div className="allotment-empty"><Users size={25}/><b>Student shortlist</b><span>Matching students will appear when student address records are connected. Current filter: {filterAll?'All students':[townFilter,villageFilter].filter(Boolean).join(' / ')||'No address selected'}.</span></div><button className="primary-action" type="button" onClick={()=>notify('Allotment will work after student address records are connected.')}>Allot selected students</button></div><div className="tracking-note"><b>Bus QR tracking</b><span>QR generation and live route tracking will activate after GPS - Bus is connected.</span></div></section>
  if(activeParent==='Connectors')return <ModulePlaceholder title={activeChild} subtitle={activeChild==='OpenCV'?'OpenCV camera connector.':'GPS connector for bus routes.'} icon={<Activity/>} details={[activeChild+' is not connected yet','Connector setup will be added here']}/>
  if(activeParent==='Settings')return <section className="workspace-panel"><div className="workspace-heading"><div><span className="section-eyebrow">SCHOOL CONFIGURATION</span><h2>Common settings</h2><p>School profile and School ID.</p></div></div><div className="settings-info-grid"><div><span>School name</span><b>{schoolName||'Not available'}</b></div><div><span>School ID</span><b>{schoolId||'Not available'}</b></div><div><span>Account</span><b>School administrator</b></div></div></section>
  return <ModulePlaceholder title={activeChild} subtitle="School workspace module." icon={<FileText/>} details={['This section is ready for its implementation step']}/>
 }
 return <div className="app-shell vertical-app-shell">{mobileOpen&&<button className="mobile-scrim" onClick={()=>setMobileOpen(false)} aria-label="Close navigation"/>}
 <aside className={'sidebar vertical-sidebar '+(mobileOpen?'sidebar-open':'')}><div className="brand-lockup"><div className="brand-mark"><GraduationCap size={23}/></div><div><div className="brand-name">AI <span>ACADAMIX</span></div><div className="brand-powered">POWERED BY <b>RADX</b></div></div><button className="icon-button sidebar-close" onClick={()=>setMobileOpen(false)}><X size={18}/></button></div>
 <div className="school-switcher"><div className="school-avatar">{(schoolName||'S').slice(0,2).toUpperCase()}</div><div className="school-copy"><b>{schoolName||'School workspace'}</b><span>{schoolId}</span></div></div>
 <div className="vertical-nav-layout"><nav className="parent-tabs" aria-label="Parent tabs">{schoolNavigation.map(item=>{const Icon=item.icon;return <button key={item.label} className={'parent-tab '+(activeParent===item.label?'active':'')} onClick={()=>selectParent(item)}><Icon size={17}/><span>{item.label}</span><ChevronRight size={14}/></button>})}</nav><nav className="child-tabs" aria-label="Child tabs"><div className="child-tabs-heading">{activeParent}</div>{currentParent.children.map(child=><button key={child} className={'child-tab '+(activeChild===child?'active':'')} onClick={()=>selectChild(currentParent,child)}>{child}</button>)}</nav></div>
 <div className="sidebar-bottom vertical-sidebar-bottom"><div className="sidebar-user"><div className="user-avatar">AD</div><div className="user-copy"><b>Admin</b><span>School administrator</span></div><button className="icon-button" onClick={()=>setShowProfile(!showProfile)}><span className="more-dots">•••</span></button></div>{showProfile&&<div className="profile-pop"><button onClick={()=>{setActiveParent('Settings');setActiveChild('Common Settings');setShowProfile(false)}}>School settings</button><button onClick={onSignOut}>Sign out</button></div>}</div></aside>
 <main className="main-area vertical-main-area"><header className="topbar"><div className="topbar-left"><button className="icon-button mobile-menu" onClick={()=>setMobileOpen(true)}><Menu size={20}/></button><div className="breadcrumb">ACADAMIX <ChevronRight size={14}/><span>{activeParent}</span><ChevronRight size={14}/><b>{activeChild}</b></div></div><div className="topbar-right"><div className="search-box"><Search size={17}/><input placeholder="Search this workspace..."/></div><button className="top-profile" onClick={()=>setShowProfile(!showProfile)}><div className="user-avatar small">AD</div><span>Admin</span><ChevronDown size={14}/></button></div></header>
 <div className="page-content vertical-page-content"><div className="workspace-page-heading"><div><span className="section-eyebrow">{activeParent.toUpperCase()}</span><h1>{activeChild}</h1><p>{activeParent==='Overview'?'Your school workspace at a glance.':'Manage '+activeChild.toLowerCase()+' for '+(schoolName||'your school')+'.'}</p></div><span className="school-id-badge">{schoolId}</span></div>{content()}<footer className="footer"><span>© 2026 AI ACADAMIX</span><span>Powered by RADX</span><span className="footer-status"><i/> School workspace</span></footer></div></main>{toast&&<div className="toast"><Check size={16}/>{toast}</div>}</div>
}
function ModulePlaceholder({title,subtitle,icon,details}:{title:string;subtitle:string;icon:React.ReactNode;details:string[]}){return <section className="workspace-panel"><div className="module-placeholder"><div className="module-placeholder-icon">{icon}</div><h2>{title}</h2><p>{subtitle}</p><ul>{details.map(item=><li key={item}>{item}</li>)}</ul></div></section>}
function MoreDots() { return <span className="more-dots">•••</span> }

export default App


const accessRoles = [
  'Admin',
  'Cashier-Staff',
  'Accountant-Staff',
  'Principal',
  'Assistant Principal',
  'Correspondent',
  'Academic Director',
]

function AuthScreen() {
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [schoolId, setSchoolId] = useState('')
  const [role, setRole] = useState('Admin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [schoolStatus, setSchoolStatus] = useState<'idle' | 'checking' | 'verified' | 'unavailable'>('idle')
  const [authenticated, setAuthenticated] = useState(false)
  const [isLoggingIn, setIsLoggingIn] = useState(false)
  const [showResendConfirmation, setShowResendConfirmation] = useState(false)
  const [isResendingConfirmation, setIsResendingConfirmation] = useState(false)
  const [notice, setNotice] = useState('')
  const [schoolName, setSchoolName] = useState('')
  const [schoolLogoUrl, setSchoolLogoUrl] = useState('')
  const [adminEmail, setAdminEmail] = useState('')
  const [adminPassword, setAdminPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [isRegistering, setIsRegistering] = useState(false)
  const [registrationPending, setRegistrationPending] = useState<{
    userId: string
    email: string
    schoolName: string
    token: string
    needsEmailConfirmation: boolean
  } | null>(null)
  const [registrationResult, setRegistrationResult] = useState<{
    schoolId: string
    schoolName: string
    adminEmail: string
    needsEmailConfirmation: boolean
    userId: string
    registrationToken: string
  } | null>(null)
  const [setupStep, setSetupStep] = useState<'details' | 'plans'>('details')
  const [setupComplete, setSetupComplete] = useState<{ plan: string; trialEndsAt: string | null; status: string } | null>(null)
  const [setupSaving, setSetupSaving] = useState(false)
  const [selectedPlan, setSelectedPlan] = useState('BASIC')
  const [schoolDetails, setSchoolDetails] = useState({ address_line_1: '', address_line_2: '', pincode: '', city_town: '', state: '', school_started_year: '', student_strength: '', bus_count: '', staff_count: '', teacher_count: '' })

  useEffect(() => {
    const timer = window.setTimeout(() => setNotice(''), 4200)
    return () => window.clearTimeout(timer)
  }, [notice])

  const verifySchool = async () => {
    if (!schoolId.trim()) {
      setSchoolStatus('idle')
      setNotice('Enter your School ID to continue.')
      return
    }
    setSchoolStatus('checking')
    setNotice('')
    try {
      const { data, error } = await supabase.functions.invoke('verify-school', {
        body: { school_id: schoolId.trim().toUpperCase() },
      })
      if (error || !data?.school) {
        setSchoolStatus('unavailable')
        setNotice(data?.error || error?.message || 'No registered school was found for this School ID.')
        return
      }
      setSchoolName(data.school.school_name)
      setSchoolLogoUrl(data.school.school_logo_url || '')
      setSchoolStatus('verified')
    } catch {
      setSchoolStatus('unavailable')
      setNotice('School ID verification failed. Check your connection and retry.')
    }
  }

  const submitLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (role !== 'Admin') {
      setNotice('Staff role accounts are not configured yet. Please use the Admin account until staff account setup is available.')
      return
    }
    setIsLoggingIn(true)
    setNotice('')
    const cleanEmail = email.trim().toLowerCase()
    try {
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email: cleanEmail,
        password,
      })
      if (authError || !authData.user) {
        if (authError?.message.toLowerCase().includes('email not confirmed')) setShowResendConfirmation(true)
        throw new Error(authError?.message || 'Login failed. Check your email and password.')
      }
      setShowResendConfirmation(false)

      const { data: school, error: schoolError } = await supabase
        .from('school_tenants')
        .select('admin_user_id, admin_email, school_id, school_name')
        .eq('school_id', schoolId.trim().toUpperCase())
        .maybeSingle()

      if (schoolError) throw schoolError
      if (!school || school.admin_user_id !== authData.user.id || school.admin_email?.toLowerCase() !== cleanEmail) {
        await supabase.auth.signOut()
        throw new Error('This email is not the Admin account registered for the verified School ID.')
      }

      setSchoolName(school.school_name)
      setSchoolId(school.school_id)
      setAuthenticated(true)
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Login failed. Please try again.')
    } finally {
      setIsLoggingIn(false)
    }
  }

  const resendConfirmationEmail = async () => {
    const cleanEmail = email.trim().toLowerCase()
    if (!cleanEmail) {
      setNotice('Enter your registered email ID first.')
      return
    }
    setIsResendingConfirmation(true)
    setNotice('')
    try {
      const { error } = await supabase.auth.resend({ type: 'signup', email: cleanEmail })
      if (error) throw error
      setNotice('A new confirmation email has been sent. Open the latest email and click Confirm your email before logging in.')
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not resend the confirmation email. Please try again.')
    } finally {
      setIsResendingConfirmation(false)
    }
  }

  const finishSchoolRegistration = async (pending: NonNullable<typeof registrationPending>) => {
    setIsRegistering(true)
    setNotice('')
    try {
      const { data, error } = await supabase.functions.invoke('register-school', {
        body: {
          user_id: pending.userId,
          email: pending.email,
          school_name: pending.schoolName,
          registration_token: pending.token,
        },
      })
      if (error) throw error
      if (!data?.school?.school_id) throw new Error('The School ID was not returned. Please retry.')
      setRegistrationResult({
        schoolId: data.school.school_id,
        schoolName: data.school.school_name,
        adminEmail: data.school.admin_email,
        needsEmailConfirmation: pending.needsEmailConfirmation,
        userId: pending.userId,
        registrationToken: pending.token,
      })
      setRegistrationPending(null)
      setAdminPassword('')
      setConfirmPassword('')
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'School registration could not be completed. Please retry.')
    } finally {
      setIsRegistering(false)
    }
  }

  const saveSchoolSetup = async () => {
    if (!registrationResult) return
    setSetupSaving(true)
    setNotice('')
    try {
      const { data, error } = await supabase.functions.invoke('complete-school-setup', {
        body: {
          user_id: registrationResult.userId,
          email: registrationResult.adminEmail,
          registration_token: registrationResult.registrationToken,
          school_id: registrationResult.schoolId,
          details: {
            address_line_1: schoolDetails.address_line_1.trim(),
            address_line_2: schoolDetails.address_line_2.trim() || null,
            pincode: schoolDetails.pincode.trim(),
            city_town: schoolDetails.city_town.trim(),
            state: schoolDetails.state.trim(),
            school_started_year: Number(schoolDetails.school_started_year),
            student_strength: Number(schoolDetails.student_strength),
            bus_count: Number(schoolDetails.bus_count),
            staff_count: Number(schoolDetails.staff_count),
            teacher_count: Number(schoolDetails.teacher_count),
          },
          plan_code: selectedPlan,
        },
      })
      if (error) throw error
      if (!data?.success) throw new Error(data?.error || 'School setup could not be saved.')
      setSetupComplete({ plan: selectedPlan, trialEndsAt: data.trial_ends_at || null, status: data.plan_status })
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'School setup could not be saved. Please retry.')
    } finally {
      setSetupSaving(false)
    }
  }

  const submitRegister = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (adminPassword !== confirmPassword) {
      setNotice('Passwords do not match.')
      return
    }
    if (!schoolName.trim() || !adminEmail.trim()) {
      setNotice('Enter the school name and Admin email ID.')
      return
    }

    setIsRegistering(true)
    setNotice('')
    const registrationToken = crypto.randomUUID()
    const cleanSchoolName = schoolName.trim()
    const cleanEmail = adminEmail.trim().toLowerCase()
    try {
      const { data, error } = await supabase.auth.signUp({
        email: cleanEmail,
        password: adminPassword,
        options: {
          data: {
            school_name: cleanSchoolName,
            registration_token: registrationToken,
          },
        },
      })
      if (error) {
        setNotice(error.message)
        return
      }
      if (!data.user) {
        setNotice('Admin account could not be created. Please try again.')
        return
      }

      let adminUser = data.user
      let needsEmailConfirmation = !data.session

      // Supabase deliberately returns a placeholder user ID when this email
      // already has an account. Sign in to obtain the real authenticated user.
      if (Array.isArray(data.user.identities) && data.user.identities.length === 0) {
        const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
          email: cleanEmail,
          password: adminPassword,
        })
        if (signInError || !signInData.user) {
          setNotice('This Admin email already has an account. Enter the password previously used for this account to finish school registration.')
          return
        }
        adminUser = signInData.user
        needsEmailConfirmation = false

        const { error: metadataError } = await supabase.auth.updateUser({
          data: {
            school_name: cleanSchoolName,
            registration_token: registrationToken,
          },
        })
        if (metadataError) {
          setNotice('Your account was verified, but school registration could not be prepared. Please retry.')
          return
        }
      }

      const pending = {
        userId: adminUser.id,
        email: cleanEmail,
        schoolName: cleanSchoolName,
        token: registrationToken,
        needsEmailConfirmation,
      }
      setRegistrationPending(pending)
      await finishSchoolRegistration(pending)
    } catch {
      setNotice('Registration could not be completed. Check your connection and retry.')
    } finally {
      setIsRegistering(false)
    }
  }

  if (authenticated) {
    return <Dashboard schoolName={schoolName} schoolId={schoolId} onSignOut={async () => {
      await supabase.auth.signOut()
      setAuthenticated(false)
      setPassword('')
      setSchoolStatus('idle')
      setNotice('You have been signed out.')
    }} />
  }

  return <main className="auth-page">
    <div className="auth-topline">
      <div className="auth-brand">
        <div className="auth-brand-mark"><GraduationCap size={25} strokeWidth={2.1}/></div>
        <div><div className="auth-brand-name">AI <span>ACADAMIX</span></div><div className="auth-brand-powered">POWERED BY <b>RADX</b></div></div>
      </div>
      <div className="auth-top-note"><span className="auth-secure-dot"/> SCHOOL MANAGEMENT SYSTEM</div>
    </div>

    <div className="auth-layout">
      <section className="auth-intro">
        <div className="auth-intro-kicker"><span/> ONE CONNECTED SCHOOL WORKSPACE</div>
        <h1>Every school day,<br/>made <em>smarter.</em></h1>
        <p>One secure place for your school's people, academics and everyday operations.</p>
        <div className="auth-illustration" aria-hidden="true">
          <div className="auth-orbit auth-orbit-a"/><div className="auth-orbit auth-orbit-b"/>
          <div className="auth-illustration-core"><GraduationCap size={88} strokeWidth={1.25}/></div>
          <div className="auth-float auth-float-one"><span><BadgeCheck size={16}/></span><div><b>One School ID</b><small>Your school's identity</small></div></div>
          <div className="auth-float auth-float-two"><span><ShieldCheck size={16}/></span><div><b>Role-based access</b><small>Right access for every role</small></div></div>
        </div>
        <div className="auth-intro-foot"><span>AI ACADAMIX</span><i/> POWERED BY RADX</div>
      </section>

      <section className="auth-card-wrap">
        <div className="auth-card">
          <div className="auth-card-heading">
            <div className="auth-card-icon">{mode === 'login' ? <LockKeyhole size={20}/> : <Building2 size={20}/>}</div>
            <div className="auth-mode-switch"><button className={mode === 'login' ? 'selected' : ''} onClick={() => {setMode('login');setNotice('')}} type="button">Log in</button><button className={mode === 'register' ? 'selected' : ''} onClick={() => {setMode('register');setNotice('')}} type="button">Register</button></div>
          </div>
          {mode === 'login' ? <>
            {schoolStatus !== 'verified' ? <>
              <h2>Enter your School ID</h2>
              <p className="auth-subtitle">Verify your registered school before opening the login form.</p>
              <form onSubmit={event => { event.preventDefault(); verifySchool() }}>
                <label className="auth-label" htmlFor="school-id">School ID</label>
                <div className="auth-input-with-action">
                  <div className="auth-input-icon"><Building2 size={17}/></div>
                  <input id="school-id" value={schoolId} onChange={e => {setSchoolId(e.target.value);setSchoolStatus('idle')}} placeholder="Enter your School ID" autoComplete="organization" required/>
                  <button type="submit" className="verify-button" disabled={schoolStatus === 'checking'}>{schoolStatus === 'checking' ? 'Checking…' : 'Verify ID'}</button>
                </div>
                <div className={`school-identity ${schoolStatus === 'unavailable' ? 'school-identity-pending' : ''}`}>
                  <div className="school-identity-logo">{schoolLogoUrl ? <img src={schoolLogoUrl} alt="" /> : <Building2 size={19}/>}</div>
                  <div>
                    <b>{schoolStatus === 'unavailable' ? 'School ID not verified' : schoolStatus === 'checking' ? 'Checking School ID…' : 'School details will appear here'}</b>
                    <span>{schoolStatus === 'unavailable' ? 'Check the ID and try again.' : schoolStatus === 'checking' ? 'Looking up your registered school.' : 'Enter your School ID and select Verify ID to continue.'}</span>
                  </div>
                  {schoolStatus === 'unavailable' && <CircleAlert size={17}/>}
                </div>
              </form>
            </> : <>
              <h2>Welcome back</h2>
              <p className="auth-subtitle">Log in to {schoolName || 'your school'}'s management workspace.</p>
              <div className="school-identity">
                <div className="school-identity-logo">{schoolLogoUrl ? <img src={schoolLogoUrl} alt="" /> : <Building2 size={19}/>}</div>
                <div><b>{schoolName || schoolId}</b><span>Verified School ID · {schoolId}</span></div>
                <BadgeCheck size={17}/>
              </div>
              <button type="button" className="verify-button" onClick={() => {setSchoolStatus('idle');setEmail('');setPassword('')}}>Change School ID</button>
              <form onSubmit={submitLogin}>
                <label className="auth-label" htmlFor="access-role">Choose your role</label>
                <div className="auth-select-wrap"><select id="access-role" value={role} onChange={e => setRole(e.target.value)}>{accessRoles.map(item => <option key={item} value={item}>{item}</option>)}</select><span>⌄</span></div>
                <label className="auth-label" htmlFor="login-email">Email ID</label>
                <div className="auth-input"><Mail size={17}/><input id="login-email" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="Enter your registered email" autoComplete="username" required/></div>
                <div className="auth-password-label"><label className="auth-label" htmlFor="login-password">Password</label><span>{role === 'Admin' ? 'Admin account' : 'Account created by your Admin'}</span></div>
                <div className="auth-input"><LockKeyhole size={17}/><input id="login-password" type={showPassword ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} placeholder="Enter your password" autoComplete="current-password" required/><button type="button" className="password-toggle" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? 'Hide password' : 'Show password'}>{showPassword ? <EyeOff size={17}/> : <Eye size={17}/>}</button></div>
                {role === 'Admin' ? <p className="role-hint">Admin can log in using the email ID and password registered for the school.</p> : <p className="role-hint">Use the email ID given to you by your Admin. Your Admin created your password. If you don't know it, ask your Admin.</p>}
                {showResendConfirmation && role === 'Admin' && <button type="button" className="verify-button" onClick={resendConfirmationEmail} disabled={isResendingConfirmation}>{isResendingConfirmation ? 'Sending confirmation email…' : 'Resend confirmation email'}</button>}
                <button className="auth-submit" type="submit" disabled={isLoggingIn}>{isLoggingIn ? 'Signing in…' : 'Log in to ACADAMIX'} <ArrowRight size={17}/></button>
              </form>
            </>}
            <div className="auth-register-prompt">New to ACADAMIX? <button type="button" onClick={() => {setMode('register');setNotice('')}}>Register a school account <ArrowRight size={14}/></button></div>
          </> : <>
            {registrationResult ? <>
              {setupComplete ? <>
                <h2>School setup completed</h2>
                <p className="auth-subtitle">Your school details and plan selection have been saved.</p>
                <div className="school-id-info school-id-success"><BadgeCheck size={19}/><div><b>{registrationResult.schoolName}</b><span>School ID · {registrationResult.schoolId}</span><code>{setupComplete.plan} PLAN</code>{setupComplete.plan === 'BASIC' && setupComplete.trialEndsAt ? <span>14-day free trial ends on {new Date(setupComplete.trialEndsAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' })}.</span> : <span>Payment is not connected yet. You can complete payment when billing is enabled.</span>}</div></div>
                {registrationResult.needsEmailConfirmation && <p className="role-hint">Check your Admin email and confirm your account before logging in.</p>}
                <button className="auth-submit" type="button" onClick={() => { setSchoolId(registrationResult.schoolId); setSchoolName(registrationResult.schoolName); setEmail(registrationResult.adminEmail); setRegistrationResult(null); setSetupComplete(null); setSetupStep('details'); setMode('login'); setSchoolStatus('idle') }}>Continue to log in <ArrowRight size={17}/></button>
              </> : setupStep === 'details' ? <>
                <h2>Complete school details</h2>
                <p className="auth-subtitle">School ID <b>{registrationResult.schoolId}</b> is ready. Add your school information to view the plans.</p>
                <form className="school-setup-form" onSubmit={event => { event.preventDefault(); setSetupStep('plans') }}>
                  <label className="auth-label" htmlFor="setup-address1">Address line 1</label><div className="auth-input"><Building2 size={17}/><input id="setup-address1" value={schoolDetails.address_line_1} onChange={e => setSchoolDetails(v => ({...v,address_line_1:e.target.value}))} placeholder="Door no., street and area" required /></div>
                  <label className="auth-label" htmlFor="setup-address2">Address line 2 <span className="optional-label">(optional)</span></label><div className="auth-input"><Building2 size={17}/><input id="setup-address2" value={schoolDetails.address_line_2} onChange={e => setSchoolDetails(v => ({...v,address_line_2:e.target.value}))} placeholder="Landmark or locality" /></div>
                  <div className="school-form-grid"><div><label className="auth-label" htmlFor="setup-pincode">Pincode</label><input className="school-plain-input" id="setup-pincode" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} value={schoolDetails.pincode} onChange={e => setSchoolDetails(v => ({...v,pincode:e.target.value.replace(/\D/g,'').slice(0,6)}))} placeholder="6-digit pincode" required /></div><div><label className="auth-label" htmlFor="setup-city">City / Town</label><input className="school-plain-input" id="setup-city" value={schoolDetails.city_town} onChange={e => setSchoolDetails(v => ({...v,city_town:e.target.value}))} placeholder="City or town" required /></div></div>
                  <label className="auth-label" htmlFor="setup-state">State</label><div className="auth-input"><input id="setup-state" value={schoolDetails.state} onChange={e => setSchoolDetails(v => ({...v,state:e.target.value}))} placeholder="State" required /></div>
                  <div className="school-form-grid"><div><label className="auth-label" htmlFor="setup-started">School started year</label><input className="school-plain-input" id="setup-started" type="number" min="1800" max={new Date().getFullYear()} value={schoolDetails.school_started_year} onChange={e => setSchoolDetails(v => ({...v,school_started_year:e.target.value}))} placeholder="e.g. 2005" required /></div><div><label className="auth-label" htmlFor="setup-students">Current students</label><input className="school-plain-input" id="setup-students" type="number" min="0" value={schoolDetails.student_strength} onChange={e => setSchoolDetails(v => ({...v,student_strength:e.target.value}))} placeholder="Student count" required /></div></div>
                  <div className="school-form-grid school-count-grid"><div><label className="auth-label" htmlFor="setup-buses">Buses</label><input className="school-plain-input" id="setup-buses" type="number" min="0" value={schoolDetails.bus_count} onChange={e => setSchoolDetails(v => ({...v,bus_count:e.target.value}))} placeholder="0" required /></div><div><label className="auth-label" htmlFor="setup-staff">Staff</label><input className="school-plain-input" id="setup-staff" type="number" min="0" value={schoolDetails.staff_count} onChange={e => setSchoolDetails(v => ({...v,staff_count:e.target.value}))} placeholder="0" required /></div><div><label className="auth-label" htmlFor="setup-teachers">Teachers</label><input className="school-plain-input" id="setup-teachers" type="number" min="0" value={schoolDetails.teacher_count} onChange={e => setSchoolDetails(v => ({...v,teacher_count:e.target.value}))} placeholder="0" required /></div></div>
                  <button className="auth-submit" type="submit">Continue to plans <ArrowRight size={17}/></button>
                </form>
              </> : <>
                <h2>Choose your school plan</h2><p className="auth-subtitle">Compare the available plans. BASIC includes a 14-day free trial. Payment is not required now.</p>
                <div className="plan-selection-grid">
                  <button type="button" className={`plan-option basic-plan ${selectedPlan === 'BASIC' ? 'chosen' : ''}`} onClick={() => setSelectedPlan('BASIC')}><span className="plan-tag">14 DAYS FREE</span><b>BASIC</b><strong>Free trial</strong><span>Full BASIC access for 14 days.</span><i>{selectedPlan === 'BASIC' ? 'Selected' : 'Choose BASIC'}</i></button>
                  <button type="button" className={`plan-option ${selectedPlan === 'PRO' ? 'chosen' : ''}`} onClick={() => setSelectedPlan('PRO')}><span className="plan-tag muted-plan-tag">DETAILS LATER</span><b>PRO</b><strong>Coming soon</strong><span>PRO plan details will be announced later.</span><i>{selectedPlan === 'PRO' ? 'Selected' : 'Choose PRO'}</i></button>
                  <button type="button" className={`plan-option ${selectedPlan === 'PREMIUM' ? 'chosen' : ''}`} onClick={() => setSelectedPlan('PREMIUM')}><span className="plan-tag">PAID PLAN</span><b>PREMIUM</b><strong>Premium plan</strong><span>For schools that need a larger plan.</span><i>{selectedPlan === 'PREMIUM' ? 'Selected' : 'Choose PREMIUM'}</i></button>
                  <button type="button" className={`plan-option ${selectedPlan === 'CUSTOM' ? 'chosen' : ''}`} onClick={() => setSelectedPlan('CUSTOM')}><span className="plan-tag">FLEXIBLE</span><b>CUSTOM</b><strong>Custom plan</strong><span>Plan configuration for your school.</span><i>{selectedPlan === 'CUSTOM' ? 'Selected' : 'Choose CUSTOM'}</i></button>
                </div>
                <p className="plan-payment-note">No payment gateway is connected. If you select a paid plan, it will be saved as pending payment. You can complete payment later.</p>
                <div className="plan-actions"><button type="button" className="plan-back-button" onClick={() => setSetupStep('details')}>Back to details</button><button className="auth-submit" type="button" onClick={saveSchoolSetup} disabled={setupSaving}>{setupSaving ? 'Saving plan…' : selectedPlan === 'BASIC' ? 'Start 14-day free trial' : 'Save plan for later'} <ArrowRight size={17}/></button></div>
              </>}
            </> : registrationPending ? <>
              <h2>Finishing registration</h2>
              <p className="auth-subtitle">Your Admin account exists. Generate your School ID to complete registration.</p>
              <div className="school-id-info">
                <CircleAlert size={18}/>
                <div><b>School ID generation is pending</b><span>Your registration details are saved. Retry to finish this step.</span></div>
              </div>
              <button className="auth-submit" type="button" onClick={() => finishSchoolRegistration(registrationPending)} disabled={isRegistering}>
                {isRegistering ? 'Generating School ID…' : 'Retry School ID generation'} <ArrowRight size={17}/>
              </button>
            </> : <>
              <h2>Register your school</h2>
              <p className="auth-subtitle">Create your school account to get started with ACADAMIX.</p>
              <form onSubmit={submitRegister}>
                <label className="auth-label" htmlFor="school-name">School name</label>
                <div className="auth-input"><Building2 size={17}/><input id="school-name" value={schoolName} onChange={e => setSchoolName(e.target.value)} placeholder="Enter your school's name" required/></div>
                <label className="auth-label" htmlFor="admin-email">Admin email ID</label>
                <div className="auth-input"><Mail size={17}/><input id="admin-email" type="email" value={adminEmail} onChange={e => setAdminEmail(e.target.value)} placeholder="Enter admin email ID" autoComplete="email" required/></div>
                <label className="auth-label" htmlFor="admin-password">Create password</label>
                <div className="auth-input"><LockKeyhole size={17}/><input id="admin-password" type="password" value={adminPassword} onChange={e => setAdminPassword(e.target.value)} placeholder="Create a password" autoComplete="new-password" required/></div>
                <label className="auth-label" htmlFor="confirm-password">Confirm password</label>
                <div className="auth-input"><LockKeyhole size={17}/><input id="confirm-password" type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} placeholder="Re-enter your password" autoComplete="new-password" required/></div>
                <div className="school-id-info"><BadgeCheck size={17}/><div><b>School ID generated after successful registration</b><span>RADX assigns the next queue number automatically and displays the ID to the Admin.</span></div></div>
                <button className="auth-submit" type="submit" disabled={isRegistering}>
                  {isRegistering ? 'Registering school…' : 'Register school account'} <ArrowRight size={17}/>
                </button>
              </form>
              <div className="auth-register-prompt">Already registered? <button type="button" onClick={() => {setMode('login');setNotice('')}}>Back to log in <ArrowRight size={14}/></button></div>
            </>}
          </>}
        </div>
        <div className="auth-card-footer"><span><ShieldCheck size={14}/> Secure school access</span><span>© 2026 RADX</span></div>
      </section>
    </div>
    {notice && <div className="auth-notice" role="status"><CircleAlert size={16}/>{notice}<button onClick={() => setNotice('')} aria-label="Dismiss message"><X size={15}/></button></div>}
  </main>
}

function App() {
  const [showWelcome, setShowWelcome] = useState(true)
  useEffect(() => {
    const timer = window.setTimeout(() => setShowWelcome(false), 1000)
    return () => window.clearTimeout(timer)
  }, [])
  if (showWelcome) return <div className="splash-screen"><div className="splash-mark"><GraduationCap size={42}/></div><div className="splash-title">AI <span>ACADAMIX</span></div><div className="splash-powered">POWERED BY RADX</div><div className="splash-loader"><i/></div></div>
  return <AuthScreen/>
}
