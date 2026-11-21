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

export function Dashboard({ onSignOut }: { onSignOut: () => void }) {
  const [active, setActive] = useState('Dashboard')
  const [mobileOpen, setMobileOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [showNotifications, setShowNotifications] = useState(false)
  const [showProfile, setShowProfile] = useState(false)
  const [showAi, setShowAi] = useState(false)
  const [aiPrompt, setAiPrompt] = useState('')
  const [toast, setToast] = useState('')
  const visibleActivities = useMemo(() => activities.filter(a => `${a.name} ${a.detail}`.toLowerCase().includes(query.toLowerCase())), [query])

  const notify = (message: string) => { setToast(message); window.setTimeout(() => setToast(''), 2600) }

  return <div className="app-shell">
    {mobileOpen && <button className="mobile-scrim" onClick={() => setMobileOpen(false)} aria-label="Close navigation" />}
    <aside className={`sidebar ${mobileOpen ? 'sidebar-open' : ''}`}>
      <div className="brand-lockup">
        <div className="brand-mark"><GraduationCap size={23} strokeWidth={2.2}/></div>
        <div><div className="brand-name">AI <span>ACADAMIX</span></div><div className="brand-powered">POWERED BY <b>RADX</b></div></div>
        <button className="icon-button sidebar-close" onClick={() => setMobileOpen(false)}><X size={18}/></button>
      </div>
      <button className="school-switcher" onClick={() => notify('School switcher will be connected to your school accounts.') }>
        <div className="school-avatar">SV</div><div className="school-copy"><b>Smart Valley School</b><span>School workspace</span></div><ChevronDown size={16} className="muted-icon"/>
      </button>
      <nav className="nav-list">
        {navGroups.map(group => <div className="nav-group" key={group.label}>
          <div className="nav-heading">{group.label}</div>
          {group.items.map(item => { const Icon = item.icon; return <button key={item.name} className={`nav-item ${active === item.name ? 'active' : ''} ${('special' in item && item.special) ? 'nav-ai' : ''}`} onClick={() => { setActive(item.name); setMobileOpen(false); if (item.name === 'AI Insights') setShowAi(true) }}>
            <Icon size={18} strokeWidth={1.9}/><span>{item.name}</span>{'count' in item && <small>{item.count}</small>}{'special' in item && item.special && <span className="new-pill">AI</span>}
          </button> })}
        </div>)}
      </nav>
      <div className="sidebar-bottom">
        <div className="help-card"><div className="help-icon"><CircleHelp size={17}/></div><div><b>Need a hand?</b><span>Visit our help centre</span></div><ArrowUpRight size={15}/></div>
        <div className="sidebar-user"><div className="user-avatar">RS</div><div className="user-copy"><b>Roshan S</b><span>School administrator</span></div><button className="icon-button" onClick={() => setShowProfile(!showProfile)}><MoreDots/></button></div>
        {showProfile && <div className="profile-pop"><button onClick={() => notify('Profile settings are coming soon.')}>My profile</button><button onClick={onSignOut}>Sign out</button></div>}
      </div>
    </aside>

    <main className="main-area">
      <header className="topbar">
        <div className="topbar-left"><button className="icon-button mobile-menu" onClick={() => setMobileOpen(true)}><Menu size={20}/></button><div className="breadcrumb">Workspace <ChevronRight size={14}/> <b>{active}</b></div></div>
        <div className="topbar-right"><div className="search-box"><Search size={17}/><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search anything..."/><kbd>⌘ K</kbd></div><button className="icon-button notification-button" onClick={() => setShowNotifications(!showNotifications)}><Bell size={19}/><i/></button><div className="top-divider"/><button className="top-profile" onClick={() => setShowProfile(!showProfile)}><div className="user-avatar small">RS</div><span>Roshan S</span><ChevronDown size={14}/></button></div>
        {showNotifications && <div className="notification-pop"><b>Notifications</b><p><span className="notification-dot"/> 3 new admissions need review.</p><p><span className="notification-dot blue-dot"/> Fee collection report is ready.</p><p><span className="notification-dot orange-dot"/> Unit test schedule is due tomorrow.</p></div>}
      </header>

      <div className="page-content">
        <div className="welcome-row"><div><div className="eyebrow"><span className="live-dot"/> MONDAY, 21 NOVEMBER 2026</div><h1>Good morning, Roshan <span className="wave">✦</span></h1><p>Here's what's happening at your school today.</p></div><button className="date-button" onClick={() => notify('Calendar view will be available in the next module.')}><CalendarDays size={17}/> This week <ChevronDown size={15}/></button></div>

        <section className="hero-banner"><div className="hero-copy"><div className="hero-label"><Sparkles size={14}/> YOUR SCHOOL, AT A GLANCE</div><h2>Make every school day<br/>a little <em>smarter.</em></h2><p>All your school operations, connected in one calm and intelligent workspace.</p><button onClick={() => setShowAi(true)} className="hero-cta">Explore AI Insights <ArrowRight size={16}/></button></div><div className="hero-art"><div className="orbit orbit-one"/><div className="orbit orbit-two"/><div className="hero-glow"><GraduationCap size={74} strokeWidth={1.2}/></div><div className="float-card float-top"><span className="float-check"><Check size={13}/></span><div><b>School running smoothly</b><small>All systems look good</small></div></div><div className="float-card float-bottom"><div className="mini-bars"><i/><i/><i/><i/><i/></div><div><b>94.6%</b><small>Attendance today</small></div></div></div><div className="hero-decoration">✳</div></section>

        <section className="stats-grid">{stats.map((stat, i) => {const Icon=stat.icon; return <article className="stat-card" key={stat.label}><div className="stat-top"><div className={`stat-icon ${stat.tone}`}><Icon size={19}/></div><span className="stat-index">0{i+1}</span></div><div className="stat-label">{stat.label}</div><div className="stat-bottom"><strong>{stat.value}</strong><span className="stat-change"><ArrowUpRight size={13}/>{stat.change}</span></div><div className="stat-note">{stat.note}</div></article>})}</section>

        <div className="content-grid"><section className="panel attendance-panel"><div className="panel-header"><div><div className="panel-kicker">LIVE OVERVIEW</div><h3>Attendance overview</h3><p>Daily student attendance for this week</p></div><button className="more-button" onClick={() => setActive('Attendance')}>View report <ArrowRight size={15}/></button></div><div className="attendance-summary"><div><strong>94.6<span>%</span></strong><div className="positive-note"><ArrowUpRight size={13}/> 2.4% <span>from yesterday</span></div></div><div className="legend"><span><i className="legend-present"/> Present</span><span><i className="legend-absent"/> Absent</span></div></div><div className="chart-wrap"><div className="chart-y"><span>100%</span><span>75%</span><span>50%</span><span>25%</span><span>0%</span></div><div className="chart-main"><div className="chart-gridlines"><i/><i/><i/><i/><i/></div><div className="bars">{[{d:'Mon',p:91,a:9},{d:'Tue',p:96,a:4},{d:'Wed',p:89,a:11},{d:'Thu',p:95,a:5},{d:'Fri',p:94,a:6},{d:'Sat',p:72,a:28}].map((v,i)=><div className="bar-column" key={v.d}><div className="bar-stack" style={{height:`${v.p}%`}}><div className="bar-present"/><div className="bar-absent" style={{height:`${v.a/(v.p+v.a)*100}%`}}/></div><span className={i===0?'today-label':''}>{v.d}</span></div>)}</div></div></div></section>

        <section className="panel events-panel"><div className="panel-header"><div><div className="panel-kicker">DON'T MISS A THING</div><h3>Upcoming events</h3><p>What's coming up at school</p></div><button className="round-arrow" onClick={() => notify('Full calendar will be available soon.')}><ArrowUpRight size={17}/></button></div><div className="event-list">{events.map(event=><div className="event-row" key={event.title}><div className={`event-date ${event.color}`}><b>{event.day}</b><span>{event.month}</span></div><div className="event-info"><b>{event.title}</b><span>{event.sub}</span></div><ChevronRight size={16} className="event-chevron"/></div>)}</div><button className="all-events" onClick={() => notify('Opening the school calendar soon.')}>View school calendar <ArrowRight size={15}/></button></section></div>

        <div className="bottom-grid"><section className="panel activity-panel"><div className="panel-header"><div><div className="panel-kicker">HAPPENING NOW</div><h3>Recent activity</h3></div><button className="more-button" onClick={() => notify('Activity history is coming soon.')}>See all <ArrowRight size={15}/></button></div><div className="activity-list">{visibleActivities.length ? visibleActivities.map(a=><div className="activity-row" key={a.name}><div className={`activity-avatar ${a.color}`}>{a.initials}</div><div className="activity-info"><b>{a.name}</b><span>{a.detail}</span></div><time>{a.time}</time></div>) : <div className="empty-search">No activity matches “{query}”.</div>}</div></section>
          <section className="ai-card"><div className="ai-card-top"><div className="ai-spark"><Sparkles size={18}/></div><span>ACADAMIX INTELLIGENCE</span><span className="ai-live">PREVIEW</span></div><h3>A clearer picture.<br/><em>Better decisions.</em></h3><p>Get a little help making sense of attendance, student progress and school trends.</p><button onClick={() => setShowAi(true)}>Ask AI Acadamix <ArrowRight size={16}/></button><div className="ai-decoration">✳</div></section></div>
        <footer className="footer"><span>© 2026 AI ACADAMIX</span><span>Thoughtfully built for better schools <b>·</b> Powered by RADX</span><span className="footer-status"><i/> All systems operational</span></footer>
      </div>
    </main>

    {showAi && <div className="modal-backdrop" onClick={() => setShowAi(false)}><div className="ai-modal" onClick={e => e.stopPropagation()}><div className="modal-head"><div className="ai-spark"><Sparkles size={18}/></div><div><b>AI Acadamix</b><span>Your school intelligence assistant</span></div><button className="icon-button" onClick={() => setShowAi(false)}><X size={18}/></button></div><div className="ai-modal-body"><div className="assistant-bubble"><Sparkles size={16}/><div><b>Hello, Roshan!</b><p>I'm your AI school assistant. Soon, I’ll help you understand attendance patterns, spot fee trends and prepare school reports. What would you like to explore?</p></div></div><div className="prompt-chips"><button onClick={() => setAiPrompt('Summarise this week’s attendance')}>Weekly attendance</button><button onClick={() => setAiPrompt('Show fee collection insights')}>Fee insights</button><button onClick={() => setAiPrompt('Prepare a school performance summary')}>School performance</button></div></div><form className="ai-input-row" onSubmit={e => {e.preventDefault(); if(aiPrompt.trim()) notify('AI responses will be enabled after the AI service is connected.');}}><input value={aiPrompt} onChange={e => setAiPrompt(e.target.value)} placeholder="Ask about your school..."/><button type="submit"><ArrowRight size={17}/></button></form><div className="modal-foot">AI assistant preview · Connect an AI provider to enable responses</div></div></div>}
    {toast && <div className="toast"><Check size={16}/>{toast}</div>}
  </div>
}

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
    return <Dashboard onSignOut={async () => {
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
