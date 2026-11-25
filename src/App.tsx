import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { supabase } from './lib/supabase'
import MobileQRAttendance from './components/MobileQRAttendance'
import PublicQRAttendance from './components/PublicQRAttendance'
import TeacherAttendancePasswords from './components/TeacherAttendancePasswords'
import OverviewDashboard from './components/OverviewDashboard'
import TeacherClassAllotment from './components/TeacherClassAllotment'
import SeatAllotment from './components/SeatAllotment'
import AttendanceReports from './components/AttendanceReports'
import FeesFinance from './components/FeesFinance'
import ExaminationManagement from './components/ExaminationManagement'
import AcademicPlanning from './components/AcademicPlanning'
import TransportManagement from './components/TransportManagement'
import AnnouncementManagement from './components/AnnouncementManagement'
import ParentNotifications from './components/ParentNotifications'
import CommunicationConnectors from './components/CommunicationConnectors'
import { AppStepper, FileUploadField, StorageStatusCard, TermsDialog, useAppToast, ConfirmDialog, LoadingButton, ProgressBar } from './components/AppUI'
import BusGpsTracker, { PublicBusTrackingPage, readBusTrackingPayload } from './components/BusGpsTracker'
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
 {label:'Admission',icon:GraduationCap,children:['Create Student','Create Teacher','Create Staff','Create Driver & Cleaner']},
 {label:'Academic',icon:BookOpen,children:['Standard','Teacher Allotment','Subjects','Timetable','Exam Schedules','Seat Allotment','Attendance Reports','Performance','Attendance','Marks Entry','Student Results']},
 {label:'Transport',icon:Bus,children:['Live tracking','Routes','Students','Buses']},
 {label:'Peoples',icon:Users,children:['Students','Teachers','Staff','Driver & Cleaner','Parent Book','Announcements']},
 {label:'Finance',icon:Wallet,children:['Finance','Fees','Fees Structure','Pending Fees']},
 {label:'Connectors',icon:Activity,children:['WhatsApp','SMS','OpenCV','GPS - Bus']},
 {label:'Settings',icon:Settings,children:['Common Settings','Notifications','QR Attendance Passwords','Role Users','Audit Log']},
]
type StandardRow={name:string;sections:string[];groups?:string[]}
type RouteRow={name:string;start:string;stops:string[];end:string}
type RoleUserRow={id:string;role:string;email:string;pages:string[];status:string;personId:string|null}
type PeopleRecord={id:string;type:string;name:string;details:Record<string,string>}
type PeopleIdSettings={studentPrefix:string;teacherPrefix:string;staffPrefix:string;driverPrefix:string;cleanerPrefix:string;studentNext:number;teacherNext:number;staffNext:number;driverNext:number;cleanerNext:number}
const rolePageDefaults:Record<string,string[]> = {
 'Cashier-Staff':['Finance','Fees','Fees Structure','Students','Pending Fees'],
 'Academic Director':['Standard','Teacher Allotment','Subjects','Timetable','Exam Schedules','Seat Allotment','Marks Entry','Attendance','Attendance Reports','Student Results','Performance'],
 'Teacher':['Timetable','Attendance','Attendance Reports','Marks Entry'],
}
const pageDisplayName=(page:string)=>({'Timetable':'Time Table','Exam Schedules':'Exam Schedule','Attendance Reports':'Attendance Report','Performance':'Students Performance'} as Record<string,string>)[page]||page
const rolePageOptions = schoolNavigation.flatMap(group=>group.children
 .filter(child=>!(group.label==='Settings'&&(child==='Role Users'||child==='Audit Log')))
 .map(child=>({parent:group.label,child,label:pageDisplayName(child)})))
const readNavigationFromUrl=()=>{const params=new URLSearchParams(window.location.search);const requestedParent=params.get('tab')||'Overview';const group=schoolNavigation.find(item=>item.label===requestedParent)||schoolNavigation[0];const requestedChild=params.get('page')||group.children[0];const requestedView=params.get('view')||'Academic';const views=['Academic','Finance','Transportation','Attendance report'];return {parent:group.label,child:group.children.includes(requestedChild)?requestedChild:group.children[0],view:views.includes(requestedView)?requestedView:'Academic'}}
export function Dashboard({onSignOut,schoolName,schoolId,userRole,allowedPages,teacherPersonId}:{onSignOut:()=>void;schoolName:string;schoolId:string;userRole:string;allowedPages:string[];teacherPersonId:string|null}) {
 const [activeParent,setActiveParent]=useState(()=>readNavigationFromUrl().parent),[activeChild,setActiveChild]=useState(()=>readNavigationFromUrl().child)
 const [dashboardView,setDashboardView]=useState(()=>readNavigationFromUrl().view),[mobileOpen,setMobileOpen]=useState(false)
 const { notify: showToast } = useAppToast()
 const [pendingRoleRemoval,setPendingRoleRemoval]=useState<RoleUserRow|null>(null)
 const [standards,setStandards]=useState<StandardRow[]>([{name:'LKG',sections:[]},{name:'UKG',sections:[]},...Array.from({length:12},(_,i)=>({name:'Standard '+(i+1),sections:[]}))])
 const [selectedStandard,setSelectedStandard]=useState('Standard 1'),[newSection,setNewSection]=useState('')
 const [newGroup,setNewGroup]=useState(''),[studentStandardSelection,setStudentStandardSelection]=useState(''),[studentGroupSelection,setStudentGroupSelection]=useState('')
 const [routes,setRoutes]=useState<RouteRow[]>([]),[routeName,setRouteName]=useState(''),[routeStart,setRouteStart]=useState(''),[routeEnd,setRouteEnd]=useState(''),[routeStops,setRouteStops]=useState('')
 const [buses,setBuses]=useState<{number:string;driver:string;cleaner:string;route:string}[]>([])
 const [busNumber,setBusNumber]=useState(''),[busDriver,setBusDriver]=useState(''),[busCleaner,setBusCleaner]=useState(''),[busRoute,setBusRoute]=useState('')
 const [townFilter,setTownFilter]=useState(''),[villageFilter,setVillageFilter]=useState(''),[filterAll,setFilterAll]=useState(false)
 const [adminAutoLogout,setAdminAutoLogout]=useState('8 hours'),[roleAutoLogout,setRoleAutoLogout]=useState('8 hours'),[adminKeepSignedIn,setAdminKeepSignedIn]=useState(true)
 const [roleUserRole,setRoleUserRole]=useState('Cashier-Staff'),[roleUserEmail,setRoleUserEmail]=useState(''),[roleUserInitialPassword,setRoleUserInitialPassword]=useState(''),[roleUserPersonId,setRoleUserPersonId]=useState('')
 const [roleUserPages,setRoleUserPages]=useState<string[]>(rolePageDefaults['Cashier-Staff'])
 const [roleUsers,setRoleUsers]=useState<RoleUserRow[]>([]),[roleUsersLoading,setRoleUsersLoading]=useState(false),[roleUserSaving,setRoleUserSaving]=useState(false)
 const [auditLogs,setAuditLogs]=useState<{id:number;actor_email:string|null;action:string;entity_type:string;details:Record<string,unknown>;created_at:string}[]>([])
 const [peopleRecords,setPeopleRecords]=useState<PeopleRecord[]>([])
 const [createdStaffCredentials,setCreatedStaffCredentials]=useState<{email:string;password:string;name:string;personId:string}|null>(null)
 const [workspaceLoaded,setWorkspaceLoaded]=useState(false),[workspaceLoadError,setWorkspaceLoadError]=useState('')
 const [peopleIdSettings,setPeopleIdSettings]=useState<PeopleIdSettings>({studentPrefix:'ADM',teacherPrefix:'TCH',staffPrefix:'STF',driverPrefix:'DRV',cleanerPrefix:'CLN',studentNext:1,teacherNext:1,staffNext:1,driverNext:1,cleanerNext:1})
 const [studentManualAdmission,setStudentManualAdmission]=useState(false)
 const [manualAdmissionNumber,setManualAdmissionNumber]=useState('')
 const [driverCleanerRole,setDriverCleanerRole]=useState('Driver')
 const academicYear=(()=>{const now=new Date();const start=now.getMonth()>=3?now.getFullYear():now.getFullYear()-1;return start+'-'+String(start+1).slice(-2)})()

 useEffect(()=>{
  let cancelled=false
  const loadWorkspace=async()=>{
   setWorkspaceLoadError('')
   const [peopleResult,workspaceResult]=await Promise.all([
    supabase.from('school_people').select('person_id,record_type,full_name,details').eq('school_id',schoolId).order('created_at',{ascending:false}),
    supabase.from('school_workspace_state').select('standards,routes,buses,people_id_settings,session_settings').eq('school_id',schoolId).maybeSingle()
   ])
   if(peopleResult.error)throw peopleResult.error
   if(workspaceResult.error)throw workspaceResult.error
   if(cancelled)return
   setPeopleRecords((peopleResult.data||[]).map(row=>({id:row.person_id,type:row.record_type,name:row.full_name,details:(row.details||{}) as Record<string,string>})))
   if(workspaceResult.data){
    const saved=workspaceResult.data
    if(Array.isArray(saved.standards)&&saved.standards.length){const savedStandards=saved.standards as StandardRow[];const early=[{name:'LKG',sections:[]},{name:'UKG',sections:[]}].filter(row=>!savedStandards.some(item=>item.name===row.name));setStandards([...early,...savedStandards])}
    if(Array.isArray(saved.routes))setRoutes(saved.routes as RouteRow[])
    if(Array.isArray(saved.buses))setBuses(saved.buses as {number:string;driver:string;cleaner:string;route:string}[])
    if(saved.people_id_settings&&typeof saved.people_id_settings==='object')setPeopleIdSettings(current=>({...current,...saved.people_id_settings}));if(saved.session_settings&&typeof saved.session_settings==='object'){if(typeof saved.session_settings.adminAutoLogout==='string')setAdminAutoLogout(saved.session_settings.adminAutoLogout);if(typeof saved.session_settings.roleAutoLogout==='string')setRoleAutoLogout(saved.session_settings.roleAutoLogout);if(typeof saved.session_settings.adminKeepSignedIn==='boolean')setAdminKeepSignedIn(saved.session_settings.adminKeepSignedIn)}
   }
   setWorkspaceLoaded(true)
  }
  loadWorkspace().catch(error=>{if(!cancelled){setWorkspaceLoadError(error instanceof Error?error.message:'Could not load school data.');setWorkspaceLoaded(false)}})
  return ()=>{cancelled=true}
 },[schoolId])
 useEffect(()=>{
  if(!workspaceLoaded||userRole!=='Admin')return
  const timer=window.setTimeout(async()=>{
   const {error}=await supabase.from('school_workspace_state').upsert({school_id:schoolId,standards,routes,buses,people_id_settings:peopleIdSettings,session_settings:{adminAutoLogout,roleAutoLogout,adminKeepSignedIn},updated_at:new Date().toISOString()},{onConflict:'school_id'})
   if(error)setWorkspaceLoadError('Workspace settings could not be saved: '+error.message)
   else setWorkspaceLoadError('')
  },650)
  return ()=>window.clearTimeout(timer)
 },[schoolId,workspaceLoaded,standards,routes,buses,peopleIdSettings,adminAutoLogout,roleAutoLogout,adminKeepSignedIn])
 useEffect(()=>{
  const onPopState=()=>{const next=readNavigationFromUrl();setActiveParent(next.parent);setActiveChild(next.child);setDashboardView(next.view)}
  window.addEventListener('popstate',onPopState)
  return ()=>window.removeEventListener('popstate',onPopState)
 },[])
 useEffect(()=>{
  const url=new URL(window.location.href)
  if(url.searchParams.get('tab')===activeParent&&url.searchParams.get('page')===activeChild&&url.searchParams.get('view')===dashboardView)return
  url.searchParams.set('tab',activeParent);url.searchParams.set('page',activeChild);url.searchParams.set('view',dashboardView)
  window.history.replaceState(window.history.state,'',url)
 },[activeParent,activeChild,dashboardView])

 const nextPersonId=(type:'Student'|'Teacher'|'Staff'|'Driver & Cleaner',workRole?:string)=>{const key=type==='Student'?'student':type==='Teacher'?'teacher':type==='Staff'?'staff':workRole==='Cleaner'?'cleaner':'driver';const prefix=peopleIdSettings[(key+'Prefix') as keyof PeopleIdSettings] as string;const seq=peopleIdSettings[(key+'Next') as keyof PeopleIdSettings] as number;return prefix+'-'+String(seq).padStart(5,'0')}
 const addPerson=async(event:FormEvent<HTMLFormElement>,type:'Student'|'Teacher'|'Staff'|'Driver & Cleaner')=>{
  event.preventDefault()
  const form=event.currentTarget
  if(!workspaceLoaded){notify('School data is still loading. Please wait and retry.');return}
  const formData=new FormData(form)
  const documentFiles=formData.getAll('documents').filter((item):item is File=>item instanceof File&&item.size>0)
  formData.delete('documents')
  const data=Object.fromEntries(formData.entries()) as Record<string,string>
  const name=(data.name||'').trim()
  const staffEmail=String(data.staff_email||'').trim().toLowerCase()
  const staffPassword=String(data.staff_password||'')
  if(type==='Staff'&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(staffEmail)){notify('Enter a valid staff email address.');return}
  if(type==='Staff'&&(staffPassword.length<8||staffPassword.length>72)){notify('Set a staff login password between 8 and 72 characters.');return}
  const hasMobile=(value?:string)=>!!value?.trim()&&value.trim()!=='-'
  if(!name){notify('Enter the name to continue.');return}
  if(type==='Student'&&!hasMobile(data.mother_phone)&&!hasMobile(data.father_phone)&&!hasMobile(data.guardian_phone)){notify('Enter a mobile number for the mother, father or guardian.');return}
  if(type==='Student'&&data.guardian_name?.trim()&&data.guardian_name.trim()!=='-'&&!data.guardian_relationship?.trim()){notify('Enter the guardian relationship.');return}
  if((type==='Student'&&data.primary_contact==='Father'&&!hasMobile(data.father_phone))||(type==='Student'&&data.primary_contact==='Mother'&&!hasMobile(data.mother_phone))||(type==='Student'&&data.primary_contact==='Guardian'&&!hasMobile(data.guardian_phone))){notify('Enter the mobile number for the selected primary contact.');return}
  const generated=type==='Student'&&studentManualAdmission?manualAdmissionNumber.trim():nextPersonId(type,data.work_role)
  if(!generated){notify('Enter the manual admission number.');return}
  if(peopleRecords.some(person=>person.id.toLowerCase()===generated.toLowerCase())){notify('This ID / admission number already exists.');return}
  const details={...data}
  if(type==='Staff'){delete details.staff_password;details.email=staffEmail}
  const attendancePassword=type==='Teacher'?String(details.attendance_password||''):''
  delete details.attendance_password
  if(type==='Teacher'&&attendancePassword.length<8){notify('Set a teacher attendance password with at least 8 characters.');return}
  for(const [key,value] of Object.entries(details)){
    if(key==='phone'||key.endsWith('_phone')){
      const digits=value.replace(/\D/g,'')
      if(value.trim()&&value.trim()!=='-'&&!/^[6-9]\d{9}$/.test(digits)){notify('Enter a valid 10-digit Indian mobile number.');return}
      details[key]=value.trim()&&value.trim()!=='-'?'+91'+digits:''
    }
  }
  if(type==='Student')details.academic_year=academicYear
  if(type==='Teacher')details.joining_year=String(new Date().getFullYear())
  if(type==='Student'){details.section='';details.primary_contact=details.primary_contact||(details.father_phone?'Father':details.mother_phone?'Mother':'Guardian')}
  const uploadedDocuments:{name:string;path:string;mime_type:string;size:number}[]=[]
  try{
    for(const file of (type==='Student'?documentFiles:[])){
      const safeName=file.name.replace(/[^a-zA-Z0-9._-]/g,'_')
      const path=schoolId+'/'+generated+'/'+crypto.randomUUID()+'-'+safeName
      const {error:uploadError}=await supabase.storage.from('school-person-documents').upload(path,file,{contentType:file.type,upsert:false})
      if(uploadError)throw new Error('Document upload failed: '+uploadError.message)
      uploadedDocuments.push({name:file.name,path,mime_type:file.type,size:file.size})
    }
    if(uploadedDocuments.length)details.document_files=JSON.stringify(uploadedDocuments)
    const {data:saved,error}=await supabase.from('school_people').insert({school_id:schoolId,person_id:generated,record_type:type,full_name:name,details}).select('person_id,record_type,full_name,details').single()
    if(error)throw error
    if(!saved)throw new Error('The saved person record was not returned.')
    if(type==='Teacher'){
      const {data:credential,error:credentialError}=await supabase.functions.invoke('qr-attendance',{body:{action:'set_password',school_id:schoolId,teacher_person_id:generated,password:attendancePassword}})
      if(credentialError||!credential?.success){
        await supabase.from('school_people').delete().eq('school_id',schoolId).eq('person_id',generated)
        throw new Error(credential?.error||credentialError?.message||'Teacher attendance password could not be saved.')
      }
    }
    if(type==='Staff'){
      const {data:account,error:accountError}=await supabase.functions.invoke('invite-school-user',{body:{school_id:schoolId,email:staffEmail,role:'Staff',allowed_pages:['Dashboard'],initial_password:staffPassword,person_id:generated}})
      if(accountError||!account?.success){
        await supabase.from('school_people').delete().eq('school_id',schoolId).eq('person_id',generated)
        throw new Error(account?.error||accountError?.message||'Staff login account could not be created.')
      }
      setCreatedStaffCredentials({email:staffEmail,password:staffPassword,name,personId:generated})
    }
    setPeopleRecords(items=>[{id:saved.person_id,type:saved.record_type,name:saved.full_name,details:(saved.details||{}) as Record<string,string>},...items])
    setPeopleIdSettings(current=>{
      const key=type==='Student'?'student':type==='Teacher'?'teacher':type==='Staff'?'staff':details.work_role==='Cleaner'?'cleaner':'driver'
      const counter=(key+'Next') as keyof PeopleIdSettings
      return type==='Student'&&studentManualAdmission?current:{...current,[counter]:(current[counter] as number)+1}
    })
    setManualAdmissionNumber('')
    form.reset();if(type==='Student'){setStudentStandardSelection('');setStudentGroupSelection('')}
    notify(type==='Staff'?'Staff profile and direct login account created. Share the displayed credentials with the staff member.':type+' saved to the school database. ID: '+generated)
  }catch(error){
    if(uploadedDocuments.length)await supabase.storage.from('school-person-documents').remove(uploadedDocuments.map(item=>item.path))
    const message=error instanceof Error?error.message:'Could not save this record.'
    notify(message.includes('duplicate key')?'This ID / admission number already exists in the school database.':message)
  }
}
const notify=(message:string)=>showToast(message,/could not|failed|error|invalid|not saved|cannot/i.test(message)?'danger':'success')
 const visibleNavigation=userRole==='Admin'?schoolNavigation:schoolNavigation.map(group=>({...group,children:group.children.filter(child=>allowedPages.includes(child))})).filter(group=>group.children.length>0)
 const currentParent=visibleNavigation.find(item=>item.label===activeParent)||visibleNavigation[0]||schoolNavigation[0]
 useEffect(()=>{if(userRole!=='Admin'&&!visibleNavigation.some(group=>group.label===activeParent&&group.children.includes(activeChild))){const first=visibleNavigation[0];if(first)navigateTo(first.label,first.children[0])}},[userRole,allowedPages.join('|'),activeParent,activeChild])
 useEffect(()=>{if(activeParent==='Settings'&&activeChild==='Role Users')void loadRoleUsers();if(activeParent==='Settings'&&activeChild==='Audit Log'){supabase.from('school_audit_logs').select('id,actor_email,action,entity_type,details,created_at').eq('school_id',schoolId).order('created_at',{ascending:false}).limit(100).then(({data,error})=>{if(error)notify('Could not load audit history: '+error.message);else setAuditLogs((data||[]) as typeof auditLogs)})}},[activeParent,activeChild,schoolId])
 const navigateTo=(parent:string,child:string)=>{const url=new URL(window.location.href);url.searchParams.set('tab',parent);url.searchParams.set('page',child);window.history.pushState({acadamixNavigation:true},'',url);setActiveParent(parent);setActiveChild(child);setMobileOpen(false)}
 const selectParent=(item:NavItem)=>navigateTo(item.label,item.children[0])
 const selectChild=(item:NavItem,child:string)=>navigateTo(item.label,child)
 useEffect(()=>{const handleTransportNavigate=(event:Event)=>{const page=(event as CustomEvent<string>).detail;if(['Live tracking','Routes','Students','Buses'].includes(page))navigateTo('Transport',page)};window.addEventListener('radx-transport-navigate',handleTransportNavigate);return()=>window.removeEventListener('radx-transport-navigate',handleTransportNavigate)},[])
 const assignStudentSection=async(id:string,section:string)=>{if(!workspaceLoaded){notify('School data is still loading. Please wait and retry.');return}const person=peopleRecords.find(item=>item.id===id);if(!person)return;const details={...person.details,section};const {error}=await supabase.from('school_people').update({details,updated_at:new Date().toISOString()}).eq('school_id',schoolId).eq('person_id',id);if(error){notify('Section assignment could not be saved: '+error.message);return}setPeopleRecords(items=>items.map(item=>item.id===id?{...item,details}:item));notify('Section assignment saved.')}
 const addSection=(event:FormEvent<HTMLFormElement>)=>{event.preventDefault();if(!workspaceLoaded){notify('School data is still loading. Please wait and retry.');return}const clean=newSection.trim().toUpperCase();if(!clean)return;const row=standards.find(item=>item.name===selectedStandard);if(row?.sections.includes(clean)){notify('This section already exists.');return}if((row?.sections.length||0)>=10){notify('A standard can have a maximum of 10 sections.');return}setStandards(items=>items.map(item=>item.name===selectedStandard?{...item,sections:[...item.sections,clean]}:item));setNewSection('');notify('Section '+clean+' added.')}
 const addAcademicGroup=(event:FormEvent<HTMLFormElement>)=>{event.preventDefault();const clean=newGroup.trim();if(!clean)return;if((standards.find(item=>item.name==='Standard 11')?.groups||[]).some(group=>group.toLowerCase()===clean.toLowerCase())){notify('This academic group already exists.');return}setStandards(items=>items.map(item=>item.name==='Standard 11'||item.name==='Standard 12'?{...item,groups:[...(standards.find(row=>row.name==='Standard 11')?.groups||[]),clean]}:item));setNewGroup('');notify(clean+' group added for Standards 11 and 12.')}
 const addRoute=(event:FormEvent<HTMLFormElement>)=>{event.preventDefault();if(!workspaceLoaded){notify('School data is still loading. Please wait and retry.');return}setRoutes(items=>[...items,{name:routeName.trim(),start:routeStart.trim(),stops:routeStops.split(',').map(x=>x.trim()).filter(Boolean),end:routeEnd.trim()}]);setRouteName('');setRouteStart('');setRouteEnd('');setRouteStops('');notify('Route created.')}
 const addBus=(event:FormEvent<HTMLFormElement>)=>{event.preventDefault();if(!workspaceLoaded){notify('School data is still loading. Please wait and retry.');return}setBuses(items=>[...items,{number:busNumber.trim(),driver:busDriver.trim(),cleaner:busCleaner.trim(),route:busRoute}]);setBusNumber('');setBusDriver('');setBusCleaner('');setBusRoute('');notify('Bus added.')}
 const changeRoleUserRole=(nextRole:string)=>{setRoleUserRole(nextRole);setRoleUserPages(rolePageDefaults[nextRole]||[]);setRoleUserInitialPassword('');setRoleUserPersonId('')}
 const toggleRoleUserPage=(page:string)=>setRoleUserPages(items=>items.includes(page)?items.filter(item=>item!==page):[...items,page])
 const loadRoleUsers=async()=>{setRoleUsersLoading(true);const {data,error}=await supabase.from('school_user_roles').select('id,email,role,allowed_pages,status,person_id').eq('school_id',schoolId).order('created_at',{ascending:false});setRoleUsersLoading(false);if(error){notify('Could not load role users: '+error.message);return}setRoleUsers((data||[]).map(row=>({id:row.id,email:row.email,role:row.role,pages:row.allowed_pages||[],status:row.status,personId:row.person_id||null})))}
 const createRoleUser=async(event:FormEvent<HTMLFormElement>)=>{event.preventDefault();const cleanEmail=roleUserEmail.trim().toLowerCase();if(!cleanEmail){notify('Enter the user email.');return}if((roleUserRole==='Teacher'||roleUserRole==='Staff')&&!roleUserPersonId){notify(`Select the ${roleUserRole.toLowerCase()} profile to link this login.`);return}if((roleUserRole==='Teacher'||roleUserRole==='Staff')&&(roleUserInitialPassword.length<8||roleUserInitialPassword.length>72)){notify('Enter an initial password between 8 and 72 characters.');return}setRoleUserSaving(true);const {data,error}=await supabase.functions.invoke('invite-school-user',{body:{school_id:schoolId,email:cleanEmail,role:roleUserRole,allowed_pages:roleUserPages,initial_password:(roleUserRole==='Teacher'||roleUserRole==='Staff')?roleUserInitialPassword:undefined,person_id:(roleUserRole==='Teacher'||roleUserRole==='Staff')?roleUserPersonId:undefined}});setRoleUserSaving(false);if(error||!data?.success){notify(data?.error||error?.message||'Account could not be created.');return}setRoleUserEmail('');setRoleUserInitialPassword('');setRoleUserPersonId('');await loadRoleUsers();notify(roleUserRole==='Teacher'?'Teacher account created and linked. Share the initial password privately with the teacher.':roleUserRole==='Staff'?'Staff account created directly. Share the email and password with the staff member.':'Invitation sent to '+cleanEmail+'. They can set their password from the email.')}
 const updateRoleUserPerson=async(user:RoleUserRow,personId:string)=>{const {error}=await supabase.from('school_user_roles').update({person_id:personId||null,updated_at:new Date().toISOString()}).eq('school_id',schoolId).eq('id',user.id);if(error){notify('Profile mapping failed: '+error.message);return}await loadRoleUsers();notify(`${user.role} account linked to the profile.`)}
 const updateRoleUserStatus=async(user:RoleUserRow)=>{const next=user.status==='active'?'suspended':'active';const {error}=await supabase.from('school_user_roles').update({status:next,updated_at:new Date().toISOString()}).eq('school_id',schoolId).eq('id',user.id);if(error){notify('Could not update account: '+error.message);return}await loadRoleUsers();notify('Account '+next+'.')}
 const removeRoleUser=(user:RoleUserRow)=>setPendingRoleRemoval(user)
 const confirmRemoveRoleUser=async()=>{if(!pendingRoleRemoval)return;const user=pendingRoleRemoval;const {error}=await supabase.from('school_user_roles').delete().eq('school_id',schoolId).eq('id',user.id);if(error){notify('Could not remove role user: '+error.message);return}setPendingRoleRemoval(null);await loadRoleUsers();notify('Role assignment removed. The Auth account remains.')}
 const dashboard=()=> <OverviewDashboard schoolId={schoolId} schoolName={schoolName} academicYear={academicYear} onNavigate={(parent,child)=>navigateTo(parent,child)}/>
 const content=()=>{
  if(activeParent==='Overview')return dashboard()
  if(activeParent==='Academic'&&activeChild==='Standard')return <section className="workspace-panel"><div className="workspace-heading"><div><span className="section-eyebrow">ACADEMIC STRUCTURE</span><h2>Standards & Sections</h2><p>LKG, UKG and Standards 1–12 are available by default. Each standard supports up to 10 sections.</p></div></div><div className="standard-layout"><div className="standard-list"><b>Standards</b>{standards.map(row=><button key={row.name} className={selectedStandard===row.name?'chosen':''} onClick={()=>setSelectedStandard(row.name)}>{row.name}<span>{row.sections.length}/10</span></button>)}</div><div className="section-editor"><div className="section-editor-head"><div><span className="section-eyebrow">SELECTED STANDARD</span><h3>{selectedStandard}</h3></div><span className="count-pill">{standards.find(row=>row.name===selectedStandard)?.sections.length||0}/10 sections</span></div><form className="inline-create-form" onSubmit={addSection}><input value={newSection} onChange={e=>setNewSection(e.target.value)} placeholder="Section name (A, B, C...)" required/><button type="submit" disabled={(standards.find(row=>row.name===selectedStandard)?.sections.length||0)>=10}>+ Add section</button></form><div className="section-chip-list">{(standards.find(row=>row.name===selectedStandard)?.sections||[]).length?standards.find(row=>row.name===selectedStandard)?.sections.map(section=><span className="section-chip" key={section}>{section}</span>):<div className="empty-module"><BookOpen size={24}/><b>No sections created</b><span>Add the first section for this standard.</span></div>}</div></div></div>{(selectedStandard==='Standard 11'||selectedStandard==='Standard 12')&&<div className="section-editor" style={{marginTop:16}}><div className="section-editor-head"><div><span className="section-eyebrow">HIGHER SECONDARY</span><h3>Academic groups</h3><p>Standard 12 follows the same group structure configured in Standard 11.</p></div></div>{selectedStandard==='Standard 11'&&<form className="inline-create-form" onSubmit={addAcademicGroup}><input value={newGroup} onChange={e=>setNewGroup(e.target.value)} placeholder="e.g. Bio-Maths, Pure Science, Computer Science" required/><button type="submit">+ Add group</button></form>}<div className="section-chip-list">{(standards.find(row=>row.name==='Standard 11')?.groups||[]).map(group=><span className="section-chip" key={group}>{group}</span>)}{!(standards.find(row=>row.name==='Standard 11')?.groups||[]).length&&<span className="field-hint">Add groups from Standard 11. They will be available for Standard 12 too.</span>}</div></div>}<StandardStudentAllocation standard={selectedStandard} standards={standards} records={peopleRecords} onAssign={assignStudentSection}/></section>
  if(activeParent==='Academic'&&activeChild==='Teacher Allotment')return <TeacherClassAllotment schoolId={schoolId} teachers={peopleRecords.filter(p=>p.type==='Teacher').map(p=>({id:p.id,name:p.name,range:p.details.teaching_range||''}))} standards={standards}/>
  if(activeParent==='Academic'&&activeChild==='Seat Allotment')return <SeatAllotment schoolId={schoolId} academicYear={academicYear} notify={notify}/>
  if(activeParent==='Academic'&&['Subjects','Timetable'].includes(activeChild))return <AcademicPlanning schoolId={schoolId} academicYear={academicYear} standards={standards} teachers={peopleRecords.filter(p=>p.type==='Teacher').map(p=>({id:p.id,name:p.name}))} page={activeChild} userRole={userRole} allowedPages={allowedPages} notify={notify}/>
  if(activeParent==='Academic'&&activeChild==='Attendance')return <MobileQRAttendance schoolId={schoolId} standards={standards} people={peopleRecords} notify={notify} userRole={userRole} teacherPersonId={teacherPersonId}/>
   if(activeParent==='Academic'&&activeChild==='Attendance Reports')return <AttendanceReports schoolId={schoolId} userRole={userRole}/>
  if(activeParent==='Academic'&&['Exam Schedules','Marks Entry','Student Results','Performance'].includes(activeChild))return <ExaminationManagement schoolId={schoolId} schoolName={schoolName} academicYear={academicYear} standards={standards} page={activeChild} userRole={userRole} allowedPages={allowedPages} notify={notify}/>
  
  if(activeParent==='Admission'&&activeChild==='Create Student')return <section className="workspace-panel"><div className="workspace-heading"><div><span className="section-eyebrow">STUDENT ADMISSION</span><h2>Create Student</h2><p>Enter student, parent or guardian and joining details.</p></div></div><form className="people-form" onSubmit={event=>addPerson(event,'Student')}><div className="people-form-grid"><label>Admission number<div className="id-entry-row"><input name="admission_number" value={studentManualAdmission?manualAdmissionNumber:nextPersonId('Student')} onChange={e=>setManualAdmissionNumber(e.target.value)} readOnly={!studentManualAdmission} placeholder="Generated admission number"/><label className="inline-check"><input type="checkbox" checked={studentManualAdmission} onChange={e=>{setStudentManualAdmission(e.target.checked);setManualAdmissionNumber('')}}/> Enter manually</label></div></label><label>Student name<input name="name" placeholder="Full name" required/></label><label>Date of birth<input name="dob" type="date" required/></label><label>Gender<select name="gender" required><option value="">Select gender</option><option>Male</option><option>Female</option><option>Other</option></select></label><label>Mother name<input name="mother_name" placeholder="Mother's full name"/></label><label>Father name<input name="father_name" placeholder="Father's full name"/></label><label>Mother mobile number<IndianPhoneInput name="mother_phone"/></label><label>Father mobile number<IndianPhoneInput name="father_phone"/></label><label>Guardian name <span className="field-hint">(optional)</span><input name="guardian_name" defaultValue="-" placeholder="Enter - if no guardian"/></label><label>Guardian relationship<input name="guardian_relationship" defaultValue="-" placeholder="e.g. Uncle, Grandmother; - if none"/></label><label>Guardian mobile number<IndianPhoneInput name="guardian_phone" allowDash defaultValue="-"/></label><fieldset className="primary-contact-field"><legend>Primary contact for bus & SMS</legend><label><input type="radio" name="primary_contact" value="Father" defaultChecked/> Father</label><label><input type="radio" name="primary_contact" value="Mother"/> Mother</label><label><input type="radio" name="primary_contact" value="Guardian"/> Guardian</label></fieldset><label>Address line 1<input name="address_line_1" placeholder="Door no., street and area" required/></label><label>Address line 2<input name="address_line_2" placeholder="Landmark / locality"/></label><label>Town / City<input name="town_city" placeholder="Town or city" required/></label><label>Sub-town / Village<input name="sub_town" placeholder="Sub-town or village"/></label><label>Current academic year of joining<input name="academic_year" value={academicYear} readOnly/></label><label>Previous schooling<input name="previous_schooling" placeholder="Previous school name"/></label><label>Joining standard<select name="joining_standard" value={studentStandardSelection} onChange={e=>{setStudentStandardSelection(e.target.value);setStudentGroupSelection('')}} required><option value="">Select standard</option>{standards.map(row=><option key={row.name} value={row.name}>{row.name}</option>)}</select></label>{(studentStandardSelection==='Standard 11'||studentStandardSelection==='Standard 12')&&<label>Academic group<select name="academic_group" value={studentGroupSelection} onChange={e=>setStudentGroupSelection(e.target.value)} required><option value="">Select group</option>{(standards.find(row=>row.name==='Standard 11')?.groups||[]).map(group=><option key={group}>{group}</option>)}</select></label>}</div><p className="people-form-note">Required documents can be uploaded later from the student profile.</p>
  <button className="primary-action" type="submit">+ Create student</button><p className="people-form-note">Admission number uses the prefix and sequence configured in Settings. You can switch on manual entry if needed.</p></form></section>
  if(activeParent==='Admission'&&activeChild==='Create Teacher')return <section className="workspace-panel"><div className="workspace-heading"><div><span className="section-eyebrow">PEOPLE REGISTRATION</span><h2>Create Teacher</h2><p>Enter teacher profile, subject and experience details.</p></div></div><form className="people-form" onSubmit={event=>addPerson(event,'Teacher')}><div className="people-form-grid"><label>Teacher ID<input value={nextPersonId('Teacher')} readOnly/></label><label>Teacher name<input name="name" placeholder="Full name" required/></label><label>Date of birth<input name="dob" type="date" required/></label><label>Gender<select name="gender" required><option value="">Select gender</option><option>Male</option><option>Female</option><option>Other</option></select></label><label>Experience subject<input name="experience_subject" placeholder="e.g. Mathematics" required/></label><label>Experience years<input name="experience_years" type="number" min="0" step="1" placeholder="Years" required/></label><label>Teaching range<select name="teaching_range" required><option value="">Select teaching range</option><option>KG - UKG</option><option>1 - 5</option><option>6 - 8</option><option>9 - 10</option><option>11 - 12</option></select></label><label>Previous teaching academic name<input name="previous_teaching_school" placeholder="Previous school / institution"/></label><label>Joining year<input name="joining_year" value={new Date().getFullYear()} readOnly/></label><label>Phone number<IndianPhoneInput name="phone" required/></label><label>Address<input name="address" placeholder="Door no., street and area" required/></label><label>Town / City<input name="town_city" placeholder="Town or city" required/></label><label>Salary per month<input name="salary_per_month" type="number" min="0" step="0.01" placeholder="Monthly salary" required/></label><label>QR attendance password<input name="attendance_password" type="password" minLength={8} autoComplete="new-password" placeholder="Set a private attendance password" required/><small>Teacher uses this only after scanning the classroom QR. No RADX app account is created.</small></label></div><button className="primary-action" type="submit">+ Create teacher</button></form></section>
  if(activeParent==='Admission'&&activeChild==='Create Staff')return <section className="workspace-panel"><div className="workspace-heading"><div><span className="section-eyebrow">PEOPLE REGISTRATION</span><h2>Create Staff</h2><p>Create the staff profile and RADX login directly. No invitation or acceptance step.</p></div></div><form className="people-form" onSubmit={event=>addPerson(event,'Staff')}><div className="people-form-grid"><label>Staff ID<input value={nextPersonId('Staff')} readOnly/></label><label>Staff name<input name="name" placeholder="Full name" required/></label><label>Phone number<IndianPhoneInput name="phone" required/></label><label>Address<input name="address" placeholder="Door no., street and area" required/></label><label>Town / City<input name="town_city" placeholder="Town or city" required/></label><label>Role of work<input name="work_role" placeholder="e.g. Office assistant, Lab assistant" required/></label><label>Email ID<input name="staff_email" type="email" autoComplete="email" placeholder="staff@school.com" required/></label><label>Login password<input name="staff_password" type="password" minLength={8} maxLength={72} autoComplete="new-password" placeholder="Set initial password" required/></label><label>Salary per month<input name="salary_per_month" type="number" min="0" step="0.01" placeholder="Monthly salary" required/></label></div><p className="people-form-note">The Admin creates the login immediately. Share the Email ID and password with the staff member directly. Password is never saved in the staff profile.</p><button className="primary-action" type="submit">+ Create staff & login</button></form>{createdStaffCredentials&&<div className="role-user-form" style={{marginTop:18}}><div className="permission-heading"><div><b>Staff login created</b><span>Share these credentials with the staff member. This password is shown only in this confirmation.</span></div></div><div className="settings-info-grid"><div><span>Staff</span><b>{createdStaffCredentials.name} · {createdStaffCredentials.personId}</b></div><div><span>Email ID</span><b>{createdStaffCredentials.email}</b></div><div><span>Temporary password</span><b>{createdStaffCredentials.password}</b></div></div><button className="primary-action" type="button" onClick={()=>{void navigator.clipboard.writeText('RADX Staff Login\nEmail: '+createdStaffCredentials.email+'\nPassword: '+createdStaffCredentials.password);notify('Staff login credentials copied.')}}>Copy login credentials</button><button className="session-force-button" type="button" onClick={()=>setCreatedStaffCredentials(null)}>Close credentials</button></div>}</section>
  if(activeParent==='Admission'&&activeChild==='Create Driver & Cleaner')return <section className="workspace-panel"><div className="workspace-heading"><div><span className="section-eyebrow">TRANSPORT PEOPLE REGISTRATION</span><h2>Create Driver & Cleaner</h2><p>Register a driver or cleaner with their contact details.</p></div></div><form className="people-form" onSubmit={event=>addPerson(event,'Driver & Cleaner')}><div className="people-form-grid"><label>Person ID<input value={nextPersonId('Driver & Cleaner',driverCleanerRole)} readOnly/></label><label>Name<input name="name" placeholder="Full name" required/></label><label>Phone number<IndianPhoneInput name="phone" required/></label><label>Role of work<select name="work_role" value={driverCleanerRole} onChange={e=>setDriverCleanerRole(e.target.value)} required><option value="Driver">Driver</option><option value="Cleaner">Cleaner</option></select></label><label>Address<input name="address" placeholder="Door no., street and area" required/></label><label>Town / City<input name="town_city" placeholder="Town or city" required/></label><label>Salary per month<input name="salary_per_month" type="number" min="0" step="0.01" placeholder="Monthly salary" required/></label></div><p className="people-form-note">Required proof documents can be uploaded later from the person profile.</p><button className="primary-action" type="submit">+ Create driver / cleaner</button></form></section>
  if(activeParent==='Admission')return <ModulePlaceholder title={activeChild} subtitle="School admission and people registration." icon={<Users/>} details={['Select a creation tab to register a person']}/>
  if(activeParent==='Finance')return <FeesFinance schoolId={schoolId} schoolName={schoolName} page={activeChild} userRole={userRole} notify={notify}/>
  if(activeParent==='Peoples'&&activeChild==='Announcements')return <AnnouncementManagement schoolId={schoolId} standards={standards} notify={notify}/>
  if(activeParent==='Peoples'&&activeChild==='Parent Book')return <ParentsBook records={peopleRecords} notify={notify}/>
  if(activeParent==='Peoples')return <PeopleDirectory records={peopleRecords.filter(record=>activeChild==='Students'?record.type==='Student':activeChild==='Teachers'?record.type==='Teacher':activeChild==='Staff'?record.type==='Staff':record.type==='Driver & Cleaner')}/>
  if(activeParent==='Transport')return <TransportManagement schoolId={schoolId} peopleRecords={peopleRecords} page={activeChild} notify={notify}/>;
  if(activeParent==='Transport'&&activeChild==='Routes')return <section className="workspace-panel"><div className="workspace-heading"><div><span className="section-eyebrow">TRANSPORT MANAGEMENT</span><h2>Routes</h2><p>Enter a start point, intermediate stops and end point.</p></div></div><form className="module-form" onSubmit={addRoute}><label>Route name<input value={routeName} onChange={e=>setRouteName(e.target.value)} placeholder="e.g. Route 01" required/></label><div className="form-two-col"><label>Start point<input value={routeStart} onChange={e=>setRouteStart(e.target.value)} placeholder="Ambur" required/></label><label>End point<input value={routeEnd} onChange={e=>setRouteEnd(e.target.value)} placeholder="School" required/></label></div><label>Intermediate stops <span className="field-hint">(comma separated)</span><input value={routeStops} onChange={e=>setRouteStops(e.target.value)} placeholder="Sugarmill, Vengili, Zameen"/></label><button className="primary-action" type="submit">+ Create route</button></form><div className="route-list">{routes.map((route,index)=><article className="route-card" key={route.name+index}><div className="route-card-title"><b>{route.name}</b><span>{route.stops.length+2} points</span></div><div className="route-timeline"><span className="route-point start-point">{route.start}</span>{route.stops.map((stop,i)=><span className="route-point" key={stop+i}>{stop}</span>)}<span className="route-point end-point">{route.end}</span></div></article>)}{!routes.length&&<div className="empty-module"><Bus size={24}/><b>No routes created</b><span>Create your first route above.</span></div>}</div></section>
  if(activeParent==='Transport'&&activeChild==='Buses')return <section className="workspace-panel"><div className="workspace-heading"><div><span className="section-eyebrow">TRANSPORT MANAGEMENT</span><h2>Buses</h2><p>Register bus number and choose its driver, cleaner and route.</p></div></div><form className="module-form" onSubmit={addBus}><div className="form-two-col"><label>Bus number<input value={busNumber} onChange={e=>setBusNumber(e.target.value)} placeholder="TN 23 AB 1234" required/></label><label>Route<select value={busRoute} onChange={e=>setBusRoute(e.target.value)} required><option value="">Choose route</option>{routes.map(route=><option key={route.name} value={route.name}>{route.name}</option>)}</select></label></div><div className="form-two-col"><label>Driver<input value={busDriver} onChange={e=>setBusDriver(e.target.value)} placeholder="Driver name" required/></label><label>Cleaner<input value={busCleaner} onChange={e=>setBusCleaner(e.target.value)} placeholder="Cleaner name" required/></label></div><button className="primary-action" type="submit" disabled={!routes.length}>+ Add bus</button>{!routes.length&&<span className="field-hint">Create a route before adding a bus.</span>}</form><div className="simple-table"><div className="simple-table-head"><span>Bus number</span><span>Driver</span><span>Cleaner</span><span>Route</span></div>{buses.map(bus=><div className="simple-table-row" key={bus.number}><b>{bus.number}</b><span>{bus.driver}</span><span>{bus.cleaner}</span><span>{bus.route}</span></div>)}{!buses.length&&<div className="empty-table">No buses added yet.</div>}</div></section>
  if(activeParent==='Transport'&&activeChild==='Allotment')return <section className="workspace-panel"><div className="workspace-heading"><div><span className="section-eyebrow">TRANSPORT MANAGEMENT</span><h2>Student allotment</h2><p>Select route and bus, then filter students by town/city or sub-town/village.</p></div></div><div className="module-form"><div className="form-two-col"><label>Route<select><option value="">Choose route</option>{routes.map(route=><option key={route.name}>{route.name}</option>)}</select></label><label>Bus<select><option value="">Choose bus</option>{buses.map(bus=><option key={bus.number}>{bus.number}</option>)}</select></label></div><div className="form-two-col"><label>Town / City<input value={townFilter} onChange={e=>setTownFilter(e.target.value)} placeholder="Town or city"/></label><label>Sub-town / Village<input value={villageFilter} onChange={e=>setVillageFilter(e.target.value)} placeholder="Village or locality"/></label></div><label className="filter-all"><input type="checkbox" checked={filterAll} onChange={e=>setFilterAll(e.target.checked)}/> Show all students</label><div className="allotment-empty"><Users size={25}/><b>Student shortlist</b><span>Matching students will appear when student address records are connected. Current filter: {filterAll?'All students':[townFilter,villageFilter].filter(Boolean).join(' / ')||'No address selected'}.</span></div><button className="primary-action" type="button" onClick={()=>notify('Allotment will work after student address records are connected.')}>Allot selected students</button></div><div className="tracking-note"><b>Bus QR tracking</b><span>QR generation and live route tracking will activate after GPS - Bus is connected.</span></div></section>
  if(activeParent==='Connectors'&&activeChild==='WhatsApp')return <CommunicationConnectors channel='WhatsApp'/>
  if(activeParent==='Connectors'&&activeChild==='SMS')return <CommunicationConnectors channel='SMS'/>
  if(activeParent==='Connectors'&&activeChild==='GPS - Bus')return <BusGpsTracker schoolId={schoolId} schoolName={schoolName} notify={notify}/>
  if(activeParent==='Connectors')return <ModulePlaceholder title={activeChild} subtitle='OpenCV camera connector.' icon={<Activity/>} details={['OpenCV is not connected yet','Connector setup will be added here']}/>
  if(activeParent==='Settings'&&activeChild==='QR Attendance Passwords')return <TeacherAttendancePasswords schoolId={schoolId} teachers={peopleRecords.filter(p=>p.type==='Teacher').map(p=>({id:p.id,name:p.name}))} notify={notify}/>
  if(activeParent==='Settings'&&activeChild==='Role Users')return <section className="workspace-panel"><div className="workspace-heading"><div><span className="section-eyebrow">USER ACCESS MANAGEMENT</span><h2>Role Users</h2><p>Create school users and assign the pages they can access.</p></div></div><form className="role-user-form" onSubmit={createRoleUser}><div className="role-user-fields"><label>Select role<select value={roleUserRole} onChange={e=>changeRoleUserRole(e.target.value)}>{accessRoles.filter(item=>item!=='Admin').map(item=><option key={item} value={item}>{item}</option>)}</select></label><label>Email ID<input type="email" value={roleUserEmail} onChange={e=>setRoleUserEmail(e.target.value)} placeholder="user@school.com" required/></label>{(roleUserRole==='Teacher'||roleUserRole==='Staff')&&<label>{roleUserRole} profile<select value={roleUserPersonId} onChange={e=>setRoleUserPersonId(e.target.value)} required><option value="">Choose the {roleUserRole.toLowerCase()} profile</option>{peopleRecords.filter(person=>person.type===roleUserRole).map(person=><option key={person.id} value={person.id}>{person.name} · {person.id}</option>)}</select></label>}{(roleUserRole==='Teacher'||roleUserRole==='Staff')&&<label>Initial {roleUserRole.toLowerCase()} app password<input type="password" value={roleUserInitialPassword} onChange={e=>setRoleUserInitialPassword(e.target.value)} placeholder="Set a password (minimum 8 characters)" minLength={8} maxLength={72} autoComplete="new-password" required/><small>{roleUserRole==='Teacher'?'This is the RADX app login password. QR attendance uses the separate password entered during Teacher admission.':'The Admin creates this password directly. Share it privately with the staff member.'}</small></label>}<div className="role-hint">{roleUserRole==='Teacher'?'Teacher QR attendance password is set separately during admission. This password creates the RADX app login.':roleUserRole==='Staff'?'No invitation is sent. The Admin creates the password and shares the login details directly.':'Supabase sends a secure invitation email. The user sets their own password.'}</div></div><div className="permission-heading"><div><b>Page access</b><span>Default pages for the selected role are enabled. You can enable or disable other pages manually.</span></div><span>{roleUserPages.length} selected</span></div><div className="permission-grid">{rolePageOptions.map(option=>{const key=option.child;const checked=roleUserPages.includes(key);return <label className={'permission-option '+(checked?'permission-enabled':'')} key={option.parent+':'+option.child}><input type="checkbox" checked={checked} onChange={()=>toggleRoleUserPage(key)}/><span><b>{option.label}</b><small>{option.parent}</small></span><i>{checked?'Enabled':'Disabled'}</i></label>})}<div className="permission-option permission-locked"><span className="permission-lock"><ShieldCheck size={15}/></span><span><b>Audit Log</b><small>Admin only</small></span><i>Restricted</i></div></div><button className="primary-action" type="submit" disabled={roleUserSaving}>{roleUserSaving?'Creating account…':(roleUserRole==='Staff'||roleUserRole==='Teacher'?'+ Create role account':'+ Invite role user')}</button><p className="role-user-note">Invitation links are sent by Supabase Auth. Audit Log remains Admin-only.</p></form><div className="role-user-list"><div className="permission-heading"><div><b>School role accounts</b><span>{roleUsersLoading?'Loading saved accounts…':'Saved in Supabase.'}</span></div><span>{roleUsers.length} users</span></div>{roleUsers.map(user=><article className="role-user-row" key={user.id}><div className="role-user-avatar">{user.role.slice(0,1)}</div><div className="role-user-summary"><b>{user.email}</b><span>{user.role} · {user.pages.length} pages · {user.status}</span><small>{user.pages.join(' · ')||'No pages assigned'}</small>{(user.role==='Teacher'||user.role==='Staff')&&<select aria-label={'Link '+user.role.toLowerCase()+' profile for '+user.email} value={user.personId||''} onChange={e=>void updateRoleUserPerson(user,e.target.value)}><option value="">Link {user.role.toLowerCase()} profile…</option>{peopleRecords.filter(p=>p.type===user.role).map(p=><option key={p.id} value={p.id}>{p.name} · {p.id}</option>)}</select>}</div><button type="button" onClick={()=>updateRoleUserStatus(user)}>{user.status==='active'?'Suspend':'Activate'}</button><button type="button" onClick={()=>removeRoleUser(user)}>Remove role</button></article>)}{!roleUsersLoading&&roleUsers.length===0&&<div className="empty-table">No role accounts created yet.</div>}</div></section>
  if(activeParent==='Settings'&&activeChild==='Audit Log')return <section className="workspace-panel"><div className="workspace-heading"><div><span className="section-eyebrow">SECURITY & COMPLIANCE</span><h2>Audit Log</h2><p>Recent role-account changes for this school.</p></div></div>{auditLogs.length?auditLogs.map(log=><article className="role-user-row" key={log.id}><div className="role-user-avatar"><ShieldCheck size={16}/></div><div className="role-user-summary"><b>{log.action}</b><span>{log.actor_email||'System'} · {log.entity_type}</span><small>{String(log.details?.email||'')} · {new Date(log.created_at).toLocaleString('en-IN')}</small></div></article>):<div className="empty-table">No audit events are available yet.</div>}</section>
  if(activeParent==='Settings'&&activeChild==='Notifications')return <NotificationCenter notify={notify}/>
  if(activeParent==='Settings')return <><StorageStatusCard/><section className="workspace-panel"><div className="workspace-heading"><div><span className="section-eyebrow">SCHOOL CONFIGURATION</span><h2>Common settings</h2><section className="workspace-panel"><div className="workspace-heading"><div><span className="section-eyebrow">PEOPLE ID CONFIGURATION</span><h2>Admission & people ID settings</h2><p>Set the prefix and next number used to generate each person's ID.</p></div></div><div className="people-id-settings-grid">{[{key:'studentPrefix',label:'Student / Admission prefix',counter:'studentNext',counterLabel:'Next admission number'},{key:'teacherPrefix',label:'Teacher ID prefix',counter:'teacherNext',counterLabel:'Next teacher number'},{key:'staffPrefix',label:'Staff ID prefix',counter:'staffNext',counterLabel:'Next staff number'},{key:'driverPrefix',label:'Driver ID prefix',counter:'driverNext',counterLabel:'Next driver number'},{key:'cleanerPrefix',label:'Cleaner ID prefix',counter:'cleanerNext',counterLabel:'Next cleaner number'}].map(item=><div className="people-id-setting" key={item.key}><label>{item.label}<input value={peopleIdSettings[item.key as keyof PeopleIdSettings] as string} maxLength={8} onChange={e=>setPeopleIdSettings(current=>({...current,[item.key]:e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g,'')}))}/></label><label>{item.counterLabel}<input type="number" min="1" value={peopleIdSettings[item.counter as keyof PeopleIdSettings] as number} onChange={e=>setPeopleIdSettings(current=>({...current,[item.counter]:Math.max(1,Number(e.target.value)||1)}))}/></label><span>Preview: {peopleIdSettings[item.key as keyof PeopleIdSettings]}-{String(peopleIdSettings[item.counter as keyof PeopleIdSettings]).padStart(5,'0')}</span></div>)}</div><p className="people-form-note">ID prefixes and next numbers are saved to this school's workspace database and reused after you sign in again.</p></section><p>School profile and School ID.</p></div></div><div className="settings-info-grid"><div><span>School name</span><b>{schoolName||'Not available'}</b></div><div><span>School ID</span><b>{schoolId||'Not available'}</b></div><div><span>Account</span><b>School administrator</b></div></div></section><section className="workspace-panel"><div className="workspace-heading"><div><span className="section-eyebrow">DEVICE & SESSION CONTROL</span><h2>Login and logout settings</h2><p>Control how long accounts stay signed in on this device.</p></div></div><div className="session-setting-row"><div><b>Keep Admin signed in on this device</b><p>Admin stays signed in until manually signing out or reaching the auto-logout time.</p></div><label className="session-toggle"><input type="checkbox" checked={adminKeepSignedIn} onChange={e=>setAdminKeepSignedIn(e.target.checked)}/><span>{adminKeepSignedIn?'Enabled':'Disabled'}</span></label></div><div className="session-setting-row"><div><b>Admin automatic logout</b><p>Automatically sign out the Admin after the selected time.</p></div><select value={adminAutoLogout} onChange={e=>setAdminAutoLogout(e.target.value)}><option>15 minutes</option><option>30 minutes</option><option>1 hour</option><option>4 hours</option><option>8 hours</option><option>12 hours</option><option>24 hours</option></select></div><div className="session-setting-row"><div><b>Role users automatic logout</b><p>Automatically sign out other role accounts on this device after the selected time.</p></div><select value={roleAutoLogout} onChange={e=>setRoleAutoLogout(e.target.value)}><option>15 minutes</option><option>30 minutes</option><option>1 hour</option><option>4 hours</option><option>8 hours</option><option>12 hours</option><option>24 hours</option></select></div><div className="session-actions"><button className="primary-action" type="button" onClick={()=>notify('Session settings updated. Saving to the school database…')}>Save session settings</button><button className="session-force-button" type="button" onClick={()=>notify('Manual force logout for role users will be activated with backend session controls.')}>Force logout role users on this device</button></div><p className="session-footnote">Frontend preview only: automatic expiry and remote force logout require backend session management and will be connected after frontend completion.</p></section></>
  return <ModulePlaceholder title={activeChild} subtitle="School workspace module." icon={<FileText/>} details={['This section is ready for its implementation step']}/>
 }
 return <div className="app-shell vertical-app-shell">{mobileOpen&&<button className="mobile-scrim" onClick={()=>setMobileOpen(false)} aria-label="Close navigation"/>}
 <aside className={'sidebar vertical-sidebar '+(mobileOpen?'sidebar-open':'')}><div className="brand-lockup"><div className="brand-mark"><GraduationCap size={23}/></div><div><div className="brand-name">AI <span>ACADAMIX</span></div><div className="brand-powered">POWERED BY <b>RADX</b></div></div><button className="icon-button sidebar-close" onClick={()=>setMobileOpen(false)}><X size={18}/></button></div>
 <div className="school-switcher"><div className="school-avatar">{(schoolName||'S').slice(0,2).toUpperCase()}</div><div className="school-copy"><b>{schoolName||'School workspace'}</b><span>{schoolId}</span></div></div>
 <div className="vertical-nav-layout"><nav className="parent-tabs" aria-label="Main modules">{visibleNavigation.map(item=>{const Icon=item.icon;const isActive=activeParent===item.label;return <button key={item.label} type="button" aria-current={isActive?'page':undefined} aria-expanded={isActive} className={'parent-tab '+(isActive?'active':'')} onClick={()=>selectParent(item)}><Icon size={18}/><span>{item.label}</span><ChevronRight className="nav-chevron" size={15}/></button>})}</nav><section className="child-navigation" aria-label={activeParent+' pages'}><div className="child-navigation-heading"><span>MODULE PAGES</span><b>{activeParent}</b><small>Choose a page to open</small></div><div className="child-tabs">{currentParent.children.filter(child=>userRole==='Admin'||allowedPages.includes(child)).map((child,index)=><button key={child} type="button" aria-current={activeChild===child?'page':undefined} className={'child-tab '+(activeChild===child?'active':'')} onClick={()=>selectChild(currentParent,child)}><span className="child-tab-index">{String(index+1).padStart(2,'0')}</span><span className="child-tab-label">{pageDisplayName(child)}</span>{activeChild===child&&<Check size={15}/>}</button>)}</div></section></div>
 <div className="sidebar-bottom vertical-sidebar-bottom"><div className="sidebar-user"><div className="user-avatar">AD</div><div className="user-copy"><b>{userRole}</b><span>{userRole==='Admin'?'School administrator':'School team member'}</span></div></div><button className="sidebar-signout" onClick={onSignOut}><LogOut size={16}/><span>Sign out</span></button></div></aside>
 <main className="main-area vertical-main-area"><header className="topbar"><div className="topbar-left"><button className="icon-button mobile-menu" onClick={()=>setMobileOpen(true)}><Menu size={20}/></button><div className="breadcrumb">ACADAMIX <ChevronRight size={14}/><span>{activeParent}</span><ChevronRight size={14}/><b>{pageDisplayName(activeChild)}</b></div></div><div className="topbar-right"><div className="search-box"><Search size={17}/><input placeholder="Search this workspace..."/></div><div className="top-profile"><div className="user-avatar small">{userRole.slice(0,1)}</div><span>{userRole}</span></div></div></header>
 <div className="page-content vertical-page-content"><div className="workspace-page-heading"><div><span className="section-eyebrow">{activeParent.toUpperCase()}</span><h1>{pageDisplayName(activeChild)}</h1><p>{activeParent==='Overview'?'Your school workspace at a glance.':'Manage '+pageDisplayName(activeChild).toLowerCase()+' for '+(schoolName||'your school')+'.'}</p></div><span className="school-id-badge">{schoolId}</span></div>{!workspaceLoaded&&!workspaceLoadError&&<div className="inline-notice notice-neutral" role="status"><Activity size={16}/><div><b>Loading school data</b><p>Fetching your saved records and settings.</p></div></div>}{workspaceLoadError&&<div className="inline-notice notice-warning" role="alert"><CircleAlert size={16}/><div><b>School data sync issue</b><p>{workspaceLoadError}</p></div></div>}{content()}<footer className="footer"><span>© 2026 AI ACADAMIX</span><span>Powered by RADX</span><span className="footer-status"><i/> School workspace</span></footer></div></main><ConfirmDialog open={!!pendingRoleRemoval} title="Remove role assignment?" message={pendingRoleRemoval ? ('Remove '+pendingRoleRemoval.email+' from this school workspace? Their Auth account will remain, but this school role will be removed.') : ''} confirmLabel="Remove role" onConfirm={confirmRemoveRoleUser} onCancel={()=>setPendingRoleRemoval(null)}/></div>
}

type NoticeTone='success'|'info'|'warning'|'danger'
function NotificationCenter({notify}:{notify:(message:string)=>void}) {
 const [live,setLive]=useState(true)
 const [showSuccess,setShowSuccess]=useState(true)
 const [showWarning,setShowWarning]=useState(true)
 const [dialogOpen,setDialogOpen]=useState(false)
 const [progress,setProgress]=useState<number|null>(null)
 useEffect(()=>{
  if(progress===null)return
  const timer=window.setInterval(()=>setProgress(value=>value===null||value>=100?null:Math.min(100,value+10)),260)
  return ()=>window.clearInterval(timer)
 },[progress])
 const push=(tone:NoticeTone)=>{
  const messages:Record<NoticeTone,{title:string;body:string}>={
   success:{title:'Changes saved',body:'Your school settings were saved successfully.'},
   info:{title:'New update available',body:'A new attendance summary is ready to review.'},
   warning:{title:'Action needs attention',body:'Some student records are missing contact details.'},
   danger:{title:'Sync failed',body:'The latest update could not be synced. Please retry.'}
  }
  notify(messages[tone].title+' — '+messages[tone].body)
 }
 return <div className="notification-center">
  <section className="workspace-panel notification-section">
   <div className="workspace-heading"><div><span className="section-eyebrow">STATUS INDICATORS</span><h2>Live pills</h2><p>Compact status indicators for live services, connections and background activity.</p></div><span className={'live-pill '+(live?'is-live':'is-paused')}><i/>{live?'LIVE':'PAUSED'}</span></div>
   <div className="notification-pill-row"><span className="notice-pill notice-online"><i/>System online</span><span className="notice-pill notice-connected"><i/>GPS connected</span><span className="notice-pill notice-neutral"><i/>Last sync · Just now</span><button className="notice-text-button" type="button" onClick={()=>setLive(value=>!value)}>{live?'Pause live status':'Resume live status'}</button></div>
  </section>
  <section className="workspace-panel notification-section">
   <div className="workspace-heading"><div><span className="section-eyebrow">INLINE FEEDBACK</span><h2>Inline alerts</h2><p>Contextual alerts stay beside the content that needs attention.</p></div></div>
   <div className="inline-notice-list">
    {showSuccess&&<div className="inline-notice notice-success" role="status"><Check size={18}/><div><b>Admission saved</b><p>The student profile was added to the current academic year.</p></div><button type="button" aria-label="Dismiss success alert" onClick={()=>setShowSuccess(false)}><X size={16}/></button></div>}
    {showWarning&&<div className="inline-notice notice-warning" role="alert"><CircleAlert size={18}/><div><b>Review incomplete records</b><p>Three student profiles need a parent or guardian mobile number.</p></div><button type="button" aria-label="Dismiss warning alert" onClick={()=>setShowWarning(false)}><X size={16}/></button></div>}
    {!showSuccess&&!showWarning&&<p className="notice-empty">All inline alerts are dismissed. <button type="button" onClick={()=>{setShowSuccess(true);setShowWarning(true)}}>Restore alerts</button></p>}
   </div>
  </section>
  <section className="workspace-panel notification-section">
   <div className="workspace-heading"><div><span className="section-eyebrow">CONFIRMATION FLOW</span><h2>Dialog notification</h2><p>Use a focused dialog when an action needs explicit confirmation.</p></div></div>
   <div className="notice-demo-row"><div><b>Archive an academic year</b><p>This example asks for confirmation before continuing.</p></div><button className="primary-action" type="button" onClick={()=>setDialogOpen(true)}>Open confirmation dialog</button></div>
  </section>
  <section className="workspace-panel notification-section">
   <div className="workspace-heading"><div><span className="section-eyebrow">TOAST FEEDBACK</span><h2>Stacked toasts</h2><p>Multiple updates stack neatly without replacing earlier messages.</p></div></div>
   <div className="notice-action-row"><button type="button" onClick={()=>push('success')}>Success toast</button><button type="button" onClick={()=>push('info')}>Info toast</button><button type="button" onClick={()=>push('warning')}>Warning toast</button><button type="button" onClick={()=>push('danger')}>Error toast</button></div>
  </section>
  <section className="workspace-panel notification-section">
   <div className="workspace-heading"><div><span className="section-eyebrow">BACKGROUND TASK</span><h2>Progress toast</h2><p>Show progress while a longer task such as import, backup or sync is running.</p></div></div>
   <div className="progress-toast-demo"><div className="progress-toast-copy"><span className="progress-toast-icon"><Activity size={17}/></span><div><b>{progress===null?'School data backup':'Backing up school data'}</b><p>{progress===null?'Start a simulated backup to preview progress feedback.':'Keep this page open while the task progresses.'}</p></div><strong>{progress===null?'Ready':progress+'%'}</strong></div><ProgressBar value={progress??0} label="Backup progress"/><button className="primary-action" type="button" disabled={progress!==null} onClick={()=>setProgress(0)}>{progress===null?'Start simulated backup':'Backup in progress'}</button></div>
   <p className="notification-footnote">These examples preview frontend notification patterns. Live service status, delivery and task progress will be connected to backend events later.</p>
  </section>
  {progress!==null&&<div className="progress-toast-floating" role="status" aria-live="polite"><span className="progress-toast-icon"><Activity size={17}/></span><div className="progress-toast-floating-copy"><b>Backing up school data</b><span>{progress}% complete</span><ProgressBar value={progress} label="Backup progress"/></div></div>}
  {dialogOpen&&<div className="notice-dialog-backdrop" role="presentation" onMouseDown={event=>{if(event.target===event.currentTarget)setDialogOpen(false)}}><section className="notice-dialog" role="dialog" aria-modal="true" aria-labelledby="notice-dialog-title"><div className="notice-dialog-icon"><CircleAlert size={22}/></div><h2 id="notice-dialog-title">Archive academic year?</h2><p>Archiving hides this academic year from active lists. Existing student records and reports remain available.</p><div className="notice-dialog-actions"><button type="button" className="notice-cancel" onClick={()=>setDialogOpen(false)}>Cancel</button><button type="button" className="notice-confirm" onClick={()=>{setDialogOpen(false);notify('Confirmation preview: academic year archive action is not connected yet.')}}>Confirm archive</button></div></section></div>}
 </div>
}

function ModulePlaceholder({title,subtitle,icon,details}:{title:string;subtitle:string;icon:React.ReactNode;details:string[]}){return <section className="workspace-panel"><div className="module-placeholder"><div className="module-placeholder-icon">{icon}</div><h2>{title}</h2><p>{subtitle}</p><ul>{details.map(item=><li key={item}>{item}</li>)}</ul></div></section>}

function IndianPhoneInput({name,required=false,allowDash=false,defaultValue}:{name:string;required?:boolean;allowDash?:boolean;defaultValue?:string}) {
 return <div className="indian-phone-input"><span>+91</span><input name={name} type="tel" inputMode="numeric" autoComplete="tel-national" maxLength={allowDash?10:10} minLength={allowDash?0:10} pattern={allowDash?'(?:[6-9][0-9]{9}|-)':'[6-9][0-9]{9}'} defaultValue={defaultValue} onInput={event=>{const value=event.currentTarget.value;if(allowDash&&value.trim()==='-')return;event.currentTarget.value=value.replace(/\D/g,'').slice(0,10)}} placeholder={allowDash?'10-digit mobile or -':'10-digit mobile number'} required={required} title="Enter a valid 10-digit Indian mobile number"/></div>
}

function PeopleDirectory({records}:{records:PeopleRecord[]}){const [selected,setSelected]=useState<PeopleRecord|null>(null);return <section className="workspace-panel"><div className="workspace-heading"><div><span className="section-eyebrow">SCHOOL PEOPLE</span><h2>Created people records</h2><p>Student, teacher, staff, driver and cleaner records created in this frontend preview. Select a card to view the complete profile.</p></div><span className="count-pill">{records.length} records</span></div>{records.length?<div className="people-card-grid">{records.map(record=><button type="button" className="people-profile-card" key={record.type+record.id} onClick={()=>setSelected(record)}><div className="people-record-avatar">{record.name.slice(0,1).toUpperCase()}</div><div className="people-record-main"><b>{record.name}</b><span>{record.type} · ID: {record.id}</span><small>{[record.details.phone,record.details.town_city,record.details.joining_standard,record.details.section||'Unassigned',record.details.work_role].filter(Boolean).join(' · ')}</small></div><ArrowRight size={15}/></button>)}</div>:<div className="empty-module"><Users size={24}/><b>No people records yet</b><span>Create a student, teacher, staff member or driver / cleaner from the Admission tabs.</span></div>}{selected&&<div className="family-modal-backdrop" onClick={()=>setSelected(null)}><section className="family-modal people-detail-modal" role="dialog" aria-modal="true" aria-label="People profile" onClick={event=>event.stopPropagation()}><div className="family-modal-head"><div><span className="section-eyebrow">{selected.type.toUpperCase()} PROFILE</span><h2>{selected.name}</h2><p>Record ID · {selected.id}</p></div><button className="icon-button" onClick={()=>setSelected(null)} aria-label="Close profile"><X/></button></div><div className="people-detail-grid">{Object.entries(selected.details).filter(([key,value])=>value&&key!=='admission_number').map(([key,value])=><div key={key}><span>{key.replace(/_/g,' ')}</span><b>{value}</b></div>)}</div></section></div>}</section>}

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
  'Staff',
]

const ACTIVE_SCHOOL_STORAGE_KEY = 'radx_active_school_id'

function AuthScreen() {
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [schoolId, setSchoolId] = useState('')
  const [role, setRole] = useState('Admin')
  const [sessionRole,setSessionRole]=useState('Admin')
  const [sessionPages,setSessionPages]=useState<string[]>([])
  const [sessionTeacherPersonId,setSessionTeacherPersonId]=useState<string|null>(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [schoolStatus, setSchoolStatus] = useState<'idle' | 'checking' | 'verified' | 'unavailable'>('idle')
  const [authenticated, setAuthenticated] = useState(false)
  const [authLoading,setAuthLoading]=useState(true)
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
  const [termsAccepted, setTermsAccepted] = useState(false)
  const [termsOpen, setTermsOpen] = useState(false)
  const [setupComplete, setSetupComplete] = useState<{ plan: string; trialEndsAt: string | null; status: string } | null>(null)
  const [setupSaving, setSetupSaving] = useState(false)
  const [selectedPlan, setSelectedPlan] = useState('BASIC')
  const [schoolDetails, setSchoolDetails] = useState({ address_line_1: '', address_line_2: '', pincode: '', city_town: '', state: '', school_started_year: '', student_strength: '', bus_count: '', staff_count: '', teacher_count: '' })

  useEffect(() => {
    const timer = window.setTimeout(() => setNotice(''), 4200)
    return () => window.clearTimeout(timer)
  }, [notice])

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        window.localStorage.removeItem(ACTIVE_SCHOOL_STORAGE_KEY)
        setAuthenticated(false)
        setSessionRole('Admin')
        setSessionPages([])
        setSessionTeacherPersonId(null)
        setSchoolStatus('idle')
        setPassword('')
      }
    })
    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    let mounted = true
    const activateSchool = async (userId: string, selectedSchoolId: string) => {
      const normalizedSchoolId = selectedSchoolId.trim().toUpperCase()
      const { data: adminSchool, error: adminError } = await supabase
        .from('school_tenants')
        .select('school_id,school_name')
        .eq('school_id', normalizedSchoolId)
        .eq('admin_user_id', userId)
        .maybeSingle()
      if (adminError) throw adminError
      if (adminSchool) {
        window.localStorage.setItem(ACTIVE_SCHOOL_STORAGE_KEY, normalizedSchoolId)
        if (mounted) {
          setSessionRole('Admin')
          setSessionPages([])
          setSessionTeacherPersonId(null)
          setSchoolId(adminSchool.school_id)
          setSchoolName(adminSchool.school_name)
          setSchoolStatus('verified')
          setAuthenticated(true)
        }
        return true
      }

      const { data: membership, error: membershipError } = await supabase
        .from('school_user_roles')
        .select('school_id,role,allowed_pages,status,person_id')
        .eq('school_id', normalizedSchoolId)
        .eq('user_id', userId)
        .maybeSingle()
      if (membershipError) throw membershipError
      if (!membership || membership.status !== 'active') return false

      const { data: memberSchool, error: memberSchoolError } = await supabase
        .from('school_tenants')
        .select('school_id,school_name')
        .eq('school_id', membership.school_id)
        .maybeSingle()
      if (memberSchoolError) throw memberSchoolError
      if (!memberSchool) return false
      window.localStorage.setItem(ACTIVE_SCHOOL_STORAGE_KEY, normalizedSchoolId)
      if (mounted) {
        setSessionRole(membership.role)
        setSessionPages(membership.allowed_pages || [])
        setSessionTeacherPersonId(membership.person_id || null)
        setSchoolId(memberSchool.school_id)
        setSchoolName(memberSchool.school_name)
        setSchoolStatus('verified')
        setAuthenticated(true)
      }
      return true
    }

    const restoreSession = async () => {
      try {
        const { data: { user }, error: userError } = await supabase.auth.getUser()
        if (userError) throw userError
        if (!user) return

        const savedSchoolId = window.localStorage.getItem(ACTIVE_SCHOOL_STORAGE_KEY)
        if (savedSchoolId) {
          const restored = await activateSchool(user.id, savedSchoolId)
          if (!restored) {
            window.localStorage.removeItem(ACTIVE_SCHOOL_STORAGE_KEY)
            await supabase.auth.signOut()
            if (mounted) setNotice('Your saved school access is no longer active. Verify your School ID and sign in again.')
          }
          return
        }

        const { data: adminSchool, error: adminError } = await supabase
          .from('school_tenants')
          .select('school_id')
          .eq('admin_user_id', user.id)
          .maybeSingle()
        if (adminError) throw adminError
        if (adminSchool) {
          await activateSchool(user.id, adminSchool.school_id)
          return
        }

        const { data: memberships, error: membershipsError } = await supabase
          .from('school_user_roles')
          .select('school_id')
          .eq('user_id', user.id)
          .eq('status', 'active')
        if (membershipsError) throw membershipsError
        if (memberships?.length === 1) {
          await activateSchool(user.id, memberships[0].school_id)
        } else {
          await supabase.auth.signOut()
          if (mounted && (memberships?.length || 0) > 1) {
            setNotice('This account belongs to more than one school. Enter the School ID for the school you want to access, then log in.')
          }
        }
      } catch (error) {
        if (mounted) setNotice(error instanceof Error ? 'Could not restore your session: ' + error.message : 'Could not restore your session.')
      } finally {
        if (mounted) setAuthLoading(false)
      }
    }

    void restoreSession()
    return () => { mounted = false }
  }, [])


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
    setIsLoggingIn(true)
    setNotice('')
    const cleanEmail = email.trim().toLowerCase()
    const cleanSchoolId = schoolId.trim().toUpperCase()
    let sessionEstablished = false
    try {
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email: cleanEmail,
        password,
      })
      if (authError || !authData.user) {
        if (authError?.message.toLowerCase().includes('email not confirmed')) setShowResendConfirmation(true)
        throw new Error(authError?.message || 'Login failed. Check your email and password.')
      }
      sessionEstablished = true
      setShowResendConfirmation(false)

      const { data: school, error: schoolError } = await supabase
        .from('school_tenants')
        .select('admin_user_id,admin_email,school_id,school_name')
        .eq('school_id', cleanSchoolId)
        .maybeSingle()
      if (schoolError) throw schoolError
      if (!school) throw new Error('The verified school could not be found.')

      if (role === 'Admin') {
        if (school.admin_user_id !== authData.user.id || school.admin_email?.toLowerCase() !== cleanEmail) {
          throw new Error('This email is not the Admin account registered for the verified School ID.')
        }
        setSessionRole('Admin')
        setSessionPages([])
        setSessionTeacherPersonId(null)
      } else {
        const { data: membership, error: membershipError } = await supabase
          .from('school_user_roles')
          .select('role,allowed_pages,status,person_id')
          .eq('school_id', cleanSchoolId)
          .eq('user_id', authData.user.id)
          .maybeSingle()
        if (membershipError) throw membershipError
        if (!membership || membership.status !== 'active' || membership.role !== role) {
          throw new Error('This account does not have an active ' + role + ' assignment for this School ID.')
        }
        setSessionRole(membership.role)
        setSessionPages(membership.allowed_pages || [])
        setSessionTeacherPersonId(membership.person_id || null)
      }

      window.localStorage.setItem(ACTIVE_SCHOOL_STORAGE_KEY, cleanSchoolId)
      setSchoolName(school.school_name)
      setSchoolId(school.school_id)
      setAuthenticated(true)
    } catch (error) {
      if (sessionEstablished) {
        try { await supabase.auth.signOut() } catch { /* Keep the original login error visible. */ }
      }
      setAuthenticated(false)
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
    if (!termsAccepted) { setTermsOpen(true); setNotice('Please review and accept the RADX platform terms to register.'); return }
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
            radx_terms_accepted_at: new Date().toISOString(),
            radx_terms_version: '2026-11-25',
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

  if(authLoading)return <div className="splash-screen"><div className="splash-mark"><GraduationCap size={42}/></div><div className="splash-title">AI <span>ACADAMIX</span></div><div className="splash-powered">RESTORING SECURE SESSION</div><div className="splash-loader"><i/></div></div>

  if (authenticated) {
    return <Dashboard schoolName={schoolName} schoolId={schoolId} userRole={sessionRole} allowedPages={sessionPages} teacherPersonId={sessionTeacherPersonId} onSignOut={async () => {
      await supabase.auth.signOut()
      window.localStorage.removeItem(ACTIVE_SCHOOL_STORAGE_KEY)
      setAuthenticated(false)
      setSessionRole('Admin');setSessionPages([]);setSessionTeacherPersonId(null)
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
                <AppStepper steps={[{title:'Admin account',description:'User information'},{title:'School details',description:'Address and strength'},{title:'Plan',description:'Trial or subscription'}]} current={1}/>
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
                <h2>Choose your school plan</h2>
                <AppStepper steps={[{title:'Admin account',description:'User information'},{title:'School details',description:'Address and strength'},{title:'Plan',description:'Trial or subscription'}]} current={2}/><p className="auth-subtitle">Compare the available plans. BASIC includes a 14-day free trial. Payment is not required now.</p>
                <div className="plan-selection-grid">
                  <button type="button" className={`plan-option basic-plan ${selectedPlan === 'BASIC' ? 'chosen' : ''}`} onClick={() => setSelectedPlan('BASIC')}><span className="plan-tag">14 DAYS FREE</span><b>BASIC</b><strong>Free trial</strong><span>Full BASIC access for 14 days.</span><i>{selectedPlan === 'BASIC' ? 'Selected' : 'Choose BASIC'}</i></button>
                  <button type="button" className={`plan-option ${selectedPlan === 'PRO' ? 'chosen' : ''}`} onClick={() => setSelectedPlan('PRO')}><span className="plan-tag muted-plan-tag">DETAILS LATER</span><b>PRO</b><strong>Coming soon</strong><span>PRO plan details will be announced later.</span><i>{selectedPlan === 'PRO' ? 'Selected' : 'Choose PRO'}</i></button>
                  <button type="button" className={`plan-option ${selectedPlan === 'PREMIUM' ? 'chosen' : ''}`} onClick={() => setSelectedPlan('PREMIUM')}><span className="plan-tag">PAID PLAN</span><b>PREMIUM</b><strong>Premium plan</strong><span>For schools that need a larger plan.</span><i>{selectedPlan === 'PREMIUM' ? 'Selected' : 'Choose PREMIUM'}</i></button>
                  <button type="button" className={`plan-option ${selectedPlan === 'CUSTOM' ? 'chosen' : ''}`} onClick={() => setSelectedPlan('CUSTOM')}><span className="plan-tag">FLEXIBLE</span><b>CUSTOM</b><strong>Custom plan</strong><span>Plan configuration for your school.</span><i>{selectedPlan === 'CUSTOM' ? 'Selected' : 'Choose CUSTOM'}</i></button>
                </div>
                <p className="plan-payment-note">No payment gateway is connected. If you select a paid plan, it will be saved as pending payment. You can complete payment later.</p>
                <div className="plan-actions"><button type="button" className="plan-back-button" onClick={() => setSetupStep('details')}>Back to details</button><LoadingButton className="auth-submit" onClick={saveSchoolSetup} disabled={setupSaving}>{selectedPlan === 'BASIC' ? 'Start 14-day free trial' : 'Save plan for later'} <ArrowRight size={17}/></LoadingButton></div>
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
              <AppStepper steps={[{title:'Admin account',description:'User information'},{title:'School details',description:'Address and strength'},{title:'Plan',description:'Trial or subscription'}]} current={0}/>
              <form onSubmit={submitRegister}>
                <label className="auth-label" htmlFor="school-name">School name</label>
                <div className="auth-input"><Building2 size={17}/><input id="school-name" value={schoolName} onChange={e => setSchoolName(e.target.value)} placeholder="Enter your school's name" required/></div>
                <label className="auth-label" htmlFor="admin-email">Admin email ID</label>
                <div className="auth-input"><Mail size={17}/><input id="admin-email" type="email" value={adminEmail} onChange={e => setAdminEmail(e.target.value)} placeholder="Enter admin email ID" autoComplete="email" required/></div>
                <label className="auth-label" htmlFor="admin-password">Create password</label>
                <div className="auth-input"><LockKeyhole size={17}/><input id="admin-password" type="password" value={adminPassword} onChange={e => setAdminPassword(e.target.value)} placeholder="Create a password" autoComplete="new-password" required/></div>
                <label className="auth-label" htmlFor="confirm-password">Confirm password</label>
                <div className="auth-input"><LockKeyhole size={17}/><input id="confirm-password" type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} placeholder="Re-enter your password" autoComplete="new-password" required/></div>
                <label className="radx-terms-check"><input type="checkbox" checked={termsAccepted} onChange={e=>setTermsAccepted(e.target.checked)}/> <span>I accept the <button type="button" onClick={()=>setTermsOpen(true)}>RADX platform terms</button>.</span></label>
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
    <TermsDialog open={termsOpen} accepted={termsAccepted} onAccept={()=>{setTermsAccepted(true);setTermsOpen(false);setNotice('Terms accepted for this registration.')}} onDecline={()=>setTermsOpen(false)}/>
    {notice && <div className="auth-notice" role="status"><CircleAlert size={16}/>{notice}<button onClick={() => setNotice('')} aria-label="Dismiss message"><X size={15}/></button></div>}
  </main>
}

function App() {
  const [showWelcome, setShowWelcome] = useState(true)
  useEffect(() => {
    const timer = window.setTimeout(() => setShowWelcome(false), 1000)
    return () => window.clearTimeout(timer)
  }, [])
  if (window.location.pathname === '/parent-notifications') return <ParentNotifications/>
  if (showWelcome) return <div className="splash-screen"><div className="splash-mark"><GraduationCap size={42}/></div><div className="splash-title">AI <span>ACADAMIX</span></div><div className="splash-powered">POWERED BY RADX</div><div className="splash-loader"><i/></div></div>
  if (window.location.pathname === '/qr-attendance') return <PublicQRAttendance token={new URLSearchParams(window.location.search).get('token') || ''}/>
  const sharedTracking = readBusTrackingPayload()
  if (sharedTracking) return <PublicBusTrackingPage payload={sharedTracking}/>
  return <AuthScreen/>
}


function StandardStudentAllocation({standard,standards,records,onAssign}:{standard:string;standards:StandardRow[];records:PeopleRecord[];onAssign:(id:string,section:string)=>void}){
 const students=records.filter(record=>record.type==='Student'&&record.details.joining_standard===standard)
 const sections=standards.find(row=>row.name===standard)?.sections||[]
 return <div className="standard-student-allocation"><div className="allocation-heading"><div><b>{standard} students</b><span>Students are added to this standard during admission. Management assigns sections later.</span></div><span className="count-pill">{students.length} students</span></div>
 {students.length?students.map(student=><div className="allocation-student-row" key={student.id}><div className="people-record-avatar">{student.name.slice(0,1).toUpperCase()}</div><div className="people-record-main"><b>{student.name}</b><span>{student.id}</span></div><select aria-label={'Assign section for '+student.name} value={student.details.section||''} onChange={event=>onAssign(student.id,event.target.value)}><option value="">Unassigned</option>{sections.map(section=><option key={section} value={section}>{section}</option>)}</select></div>):<div className="empty-table">No students admitted to {standard} yet.</div>}</div>
}

type ParentFamily={key:string;father_name:string;father_phone:string;mother_name:string;mother_phone:string;guardian_name:string;guardian_phone:string;guardian_relationship:string;primary_contact:string;address:string;children:PeopleRecord[]}
function ParentsBook({records,notify}:{records:PeopleRecord[];notify:(message:string)=>void}){
 const [search,setSearch]=useState('')
 const [selected,setSelected]=useState<ParentFamily|null>(null)
 const [selectedChild,setSelectedChild]=useState<PeopleRecord|null>(null)
 const students=records.filter(record=>record.type==='Student')
 const families:ParentFamily[]=[]
 students.forEach(child=>{
  const d=child.details
  const normalizeFamilyPhone=(value:string)=>{const digits=value.replace(/\D/g,'');return digits.length===12&&digits.startsWith('91')?digits.slice(2):digits}
  const phones=[d.father_phone,d.mother_phone,d.guardian_phone].filter(Boolean).map(normalizeFamilyPhone)
  const matchedFamilies=families.filter(item=>[item.father_phone,item.mother_phone,item.guardian_phone].filter(Boolean).some(value=>phones.includes(normalizeFamilyPhone(value))))
  let family=matchedFamilies[0]
  if(!family){family={key:child.id,father_name:d.father_name||'',father_phone:d.father_phone||'',mother_name:d.mother_name||'',mother_phone:d.mother_phone||'',guardian_name:d.guardian_name||'',guardian_phone:d.guardian_phone||'',guardian_relationship:d.guardian_relationship||'',primary_contact:d.primary_contact||'Father',address:[d.address_line_1,d.address_line_2,d.town_city,d.sub_town].filter(Boolean).join(', '),children:[]};families.push(family)}
  else{
   matchedFamilies.slice(1).forEach(other=>{family!.father_name=family!.father_name||other.father_name;family!.father_phone=family!.father_phone||other.father_phone;family!.mother_name=family!.mother_name||other.mother_name;family!.mother_phone=family!.mother_phone||other.mother_phone;family!.guardian_name=family!.guardian_name||other.guardian_name;family!.guardian_phone=family!.guardian_phone||other.guardian_phone;family!.guardian_relationship=family!.guardian_relationship||other.guardian_relationship;family!.address=family!.address||other.address;family!.children.push(...other.children);const index=families.indexOf(other);if(index>=0)families.splice(index,1)})
   family.father_name=family.father_name||d.father_name||'';family.father_phone=family.father_phone||d.father_phone||''
   family.mother_name=family.mother_name||d.mother_name||'';family.mother_phone=family.mother_phone||d.mother_phone||''
   family.guardian_name=family.guardian_name||d.guardian_name||'';family.guardian_phone=family.guardian_phone||d.guardian_phone||''
   family.guardian_relationship=family.guardian_relationship||d.guardian_relationship||''
   family.address=family.address||[d.address_line_1,d.address_line_2,d.town_city,d.sub_town].filter(Boolean).join(', ')
  }
  family.children.push(child)
 })
 const displayName=(family:ParentFamily)=>family.father_name&&family.mother_name?family.father_name+' & '+family.mother_name:family.father_name||family.mother_name||(family.guardian_name?family.guardian_name+' (Guardian)':'Parent / Guardian')
 const primaryPhone=(family:ParentFamily)=>family.primary_contact==='Mother'?family.mother_phone:family.primary_contact==='Guardian'?family.guardian_phone:family.father_phone||family.mother_phone||family.guardian_phone
 const matches=(family:ParentFamily)=>{const q=search.trim().toLowerCase();if(!q)return true;return [displayName(family),family.father_name,family.mother_name,family.guardian_name,family.father_phone,family.mother_phone,family.guardian_phone,...family.children.flatMap(child=>[child.name,child.id,child.details.joining_standard||'',child.details.section||''])].join(' ').toLowerCase().includes(q)}
 const visible=families.filter(matches)
 const openWhatsApp=(phone:string)=>{const digits=phone.replace(/\D/g,'');if(!digits){notify('No primary mobile number is available.');return}window.open('https://wa.me/'+digits,'_blank','noopener,noreferrer')}
 return <section className="workspace-panel"><div className="workspace-heading"><div><span className="section-eyebrow">FAMILY DIRECTORY</span><h2>Parents Book</h2><p>Families are grouped automatically by matching father, mother or guardian mobile numbers.</p></div><span className="count-pill">{families.length} families</span></div>
 <div className="parents-search"><Search size={17}/><input value={search} onChange={event=>setSearch(event.target.value)} placeholder="Search parent name, mobile number or child name..."/></div>
 <div className="parent-family-grid">{visible.map(family=>{const phone=primaryPhone(family);return <article className="parent-family-card" key={family.key} onClick={()=>setSelected(family)} role="button" tabIndex={0} onKeyDown={event=>{if(event.key==='Enter'||event.key===' ')setSelected(family)}}><div className="family-card-top"><div className="family-avatar"><Users size={20}/></div><div className="family-card-title"><b>{displayName(family)}</b><span>{family.children.length} {family.children.length===1?'child':'children'}</span></div><span className="family-open">View <ArrowRight size={14}/></span></div>
 <div className="family-phone-list">{family.father_phone&&<span>Father · {family.father_phone}</span>}{family.mother_phone&&<span>Mother · {family.mother_phone}</span>}{family.guardian_phone&&<span>Guardian · {family.guardian_phone}</span>}</div>
 <div className="family-primary-actions"><span>Primary · {family.primary_contact}</span><a href={'tel:'+phone} onClick={event=>event.stopPropagation()}><Activity size={13}/> Call</a><button type="button" onClick={event=>{event.stopPropagation();openWhatsApp(phone)}}><MessageSquareText size={13}/> WhatsApp</button></div>
 <div className="family-children-preview">{family.children.map(child=><span className="child-chip" key={child.id}>{child.name} · {child.details.joining_standard||'Standard pending'} - {child.details.section||'Unassigned'}</span>)}</div></article>})}
 {!visible.length&&<div className="empty-module"><Users size={25}/><b>No matching family records</b><span>Admit a student with a parent or guardian mobile number to create a family card.</span></div>}</div>
 {selected&&<div className="family-modal-backdrop" onClick={()=>{setSelected(null);setSelectedChild(null)}}><section className="family-modal" role="dialog" aria-modal="true" aria-label="Family profile" onClick={event=>event.stopPropagation()}><div className="family-modal-head"><div><span className="section-eyebrow">FAMILY PROFILE</span><h2>{displayName(selected)}</h2><p>{selected.children.length} linked student records</p></div><button className="icon-button" onClick={()=>{setSelected(null);setSelectedChild(null)}} aria-label="Close family profile"><X/></button></div>
 <div className="family-contact-grid">{[['Father',selected.father_name,selected.father_phone],['Mother',selected.mother_name,selected.mother_phone],['Guardian',selected.guardian_name,selected.guardian_phone]].filter(row=>row[1]||row[2]).map(row=><div className="family-contact-item" key={String(row[0])}><b>{row[0]}</b><span>{row[1]||'Name not entered'}</span><a href={'tel:'+row[2]}>{row[2]||'Mobile not entered'}</a></div>)}</div><div className="family-address"><b>Home address</b><span>{selected.address||'Address not entered'}</span></div>
 <div className="family-modal-section"><div className="allocation-heading"><div><b>Attached children</b><span>Open a child to review their school summary.</span></div><span className="count-pill">{selected.children.length}</span></div>
 {selected.children.map(child=><article className="family-child-row" key={child.id}><div className="family-child-avatar">{child.name.slice(0,1).toUpperCase()}</div><div className="people-record-main"><b>{child.name}</b><span>{child.id} · {child.details.joining_standard||'Standard pending'} - {child.details.section||'Unassigned'}</span><small>Bus route: {child.details.bus_route||'Not allotted'}</small></div><button type="button" className="child-view-button" onClick={()=>setSelectedChild(child)}>View Details <ArrowRight size={14}/></button></article>)}</div>
 {selectedChild&&<div className="child-report-panel"><div className="child-report-head"><div><span className="section-eyebrow">STUDENT PROFILE</span><h3>{selectedChild.name}</h3><span>{selectedChild.id} · {selectedChild.details.joining_standard||'Standard pending'} - {selectedChild.details.section||'Unassigned'}</span></div><button className="icon-button" onClick={()=>setSelectedChild(null)} aria-label="Close child details"><X size={17}/></button></div><div className="child-report-grid"><div><span>Attendance</span><b>92%</b><small>Demo summary · 23 present / 25 days</small></div><div><span>Performance</span><b>Grade A</b><small>Demo summary · Latest exam</small></div><div className="fee-pending"><span>Fees status</span><b>₹4,500 pending</b><small>Demo data · sample outstanding</small></div></div><p className="demo-data-note">Attendance, exam performance and fees shown here are sample frontend preview values, not actual student records.</p></div>}
 </section></div>}
 </section>
}
