import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { IndianRupee, ReceiptText, Users, Plus, RefreshCw, Search, Download, Printer, AlertCircle, FileText } from 'lucide-react'

type FeeStructure = { id:string; academic_year:string; standard_name:string; fee_name:string; amount:number; due_date:string|null; is_active:boolean; notes:string|null }
type FeePayment = { id:string; fee_structure_id:string; student_person_id:string; academic_year:string; receipt_number:string; paid_amount:number; payment_method:string; transaction_reference:string|null; paid_on:string; notes:string|null }
type FeeStudent = { person_id:string; full_name:string; details:Record<string,any> }
type Props = { schoolId:string; schoolName:string; page:string; userRole:string; notify:(message:string)=>void }

const money=(value:number)=>new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',maximumFractionDigits:2}).format(value||0)
const today=()=>new Date().toISOString().slice(0,10)
const currentAcademicYear=()=>{const d=new Date();const y=d.getMonth()>=3?d.getFullYear():d.getFullYear()-1;return y+'-'+String(y+1).slice(-2)}
const receiptCode=()=> 'ACX-'+today().replace(/-/g,'')+'-'+Date.now().toString().slice(-6)+'-'+Math.floor(Math.random()*90+10)

export default function FeesFinance({schoolId,schoolName,page,userRole,notify}:Props){
 const [structures,setStructures]=useState<FeeStructure[]>([])
 const [payments,setPayments]=useState<FeePayment[]>([])
 const [students,setStudents]=useState<FeeStudent[]>([])
 const [loading,setLoading]=useState(true)
 const [saving,setSaving]=useState(false)
 const [error,setError]=useState('')
 const [search,setSearch]=useState('')
 const [year,setYear]=useState(currentAcademicYear())
 const [form,setForm]=useState({academic_year:currentAcademicYear(),standard_name:'',fee_name:'Tuition Fee',amount:'',due_date:'',notes:''})
 const [collection,setCollection]=useState({fee_structure_id:'',student_person_id:'',paid_amount:'',payment_method:'Cash',transaction_reference:'',paid_on:today(),notes:''})
 const [receipt,setReceipt]=useState<FeePayment|null>(null)

 const load=async()=>{
  setLoading(true);setError('')
  const [feeResult,paymentResult,studentResult]=await Promise.all([
   supabase.from('school_fee_structures').select('id,academic_year,standard_name,fee_name,amount,due_date,is_active,notes').eq('school_id',schoolId).order('created_at',{ascending:false}),
   supabase.from('school_fee_payments').select('id,fee_structure_id,student_person_id,academic_year,receipt_number,paid_amount,payment_method,transaction_reference,paid_on,notes').eq('school_id',schoolId).order('paid_on',{ascending:false}),
   supabase.from('school_people').select('person_id,full_name,details').eq('school_id',schoolId).eq('record_type','Student').order('full_name')
  ])
  if(feeResult.error||paymentResult.error||studentResult.error){setError(feeResult.error?.message||paymentResult.error?.message||studentResult.error?.message||'Could not load finance data.');setLoading(false);return}
  setStructures((feeResult.data||[]) as FeeStructure[])
  setPayments((paymentResult.data||[]) as FeePayment[])
  setStudents((studentResult.data||[]) as FeeStudent[])
  setLoading(false)
 }
 useEffect(()=>{void load()},[schoolId])

 const structureById=useMemo(()=>new Map(structures.map(x=>[x.id,x])),[structures])
 const studentById=useMemo(()=>new Map(students.map(x=>[x.person_id,x])),[students])
 const paymentTotals=useMemo(()=>{const m=new Map<string,number>();payments.forEach(p=>m.set(p.fee_structure_id+'|'+p.student_person_id,(m.get(p.fee_structure_id+'|'+p.student_person_id)||0)+Number(p.paid_amount)));return m},[payments])
 const activeStructures=structures.filter(x=>x.is_active)
 const collected=payments.reduce((sum,p)=>sum+Number(p.paid_amount),0)
 const expected=activeStructures.reduce((sum,fee)=>sum+students.filter(student=>fee.standard_name==='All Standards'||student.details.joining_standard===fee.standard_name).length*Number(fee.amount),0)
 const outstanding=activeStructures.reduce((sum,fee)=>sum+students.filter(student=>fee.standard_name==='All Standards'||student.details.joining_standard===fee.standard_name).reduce((total,student)=>total+Math.max(0,Number(fee.amount)-(paymentTotals.get(fee.id+'|'+student.person_id)||0)),0),0)
 const selectedFee=structureById.get(collection.fee_structure_id)
 const eligibleStudents=selectedFee?students.filter(s=>selectedFee.standard_name==='All Standards'||s.details.joining_standard===selectedFee.standard_name):students
 const selectedPaid=collection.fee_structure_id&&collection.student_person_id?(paymentTotals.get(collection.fee_structure_id+'|'+collection.student_person_id)||0):0
 const selectedDue=selectedFee?Math.max(0,Number(selectedFee.amount)-selectedPaid):0
 const pendingRows=useMemo(()=>activeStructures.flatMap(fee=>students.filter(student=>fee.standard_name==='All Standards'||student.details.joining_standard===fee.standard_name).map(student=>{const paid=paymentTotals.get(fee.id+'|'+student.person_id)||0;return {fee,student,paid,due:Math.max(0,Number(fee.amount)-paid)}}).filter(row=>row.due>0.009)),[activeStructures,students,paymentTotals])
 const filteredPending=pendingRows.filter(row=>(row.student.full_name+' '+row.student.person_id+' '+row.fee.fee_name+' '+row.fee.standard_name).toLowerCase().includes(search.toLowerCase()))
 const filteredPayments=payments.filter(p=>{const student=studentById.get(p.student_person_id);const fee=structureById.get(p.fee_structure_id);return (p.academic_year===year)&&(String(student?.full_name||'')+' '+p.receipt_number+' '+String(fee?.fee_name||'')).toLowerCase().includes(search.toLowerCase())})
 const saveStructure=async(event:FormEvent)=>{
  event.preventDefault();if(!form.standard_name||!form.amount||Number(form.amount)<=0){notify('Select a standard and enter a valid fee amount.');return}
  setSaving(true)
  const {error}=await supabase.from('school_fee_structures').insert({school_id:schoolId,academic_year:form.academic_year,standard_name:form.standard_name,fee_name:form.fee_name.trim(),amount:Number(form.amount),due_date:form.due_date||null,notes:form.notes.trim()||null,created_by:(await supabase.auth.getUser()).data.user?.id})
  setSaving(false);if(error){notify('Fee structure could not be saved: '+error.message);return}
  setForm({...form,amount:'',due_date:'',notes:''});notify('Fee structure saved.');await load()
 }
 const toggleStructure=async(fee:FeeStructure)=>{
  const {error}=await supabase.from('school_fee_structures').update({is_active:!fee.is_active,updated_at:new Date().toISOString()}).eq('school_id',schoolId).eq('id',fee.id)
  if(error){notify('Could not update fee status: '+error.message);return}notify(fee.is_active?'Fee structure deactivated.':'Fee structure activated.');await load()
 }
 const savePayment=async(event:FormEvent)=>{
  event.preventDefault()
  if(!selectedFee||!collection.student_person_id){notify('Select a fee and student first.');return}
  const amount=Number(collection.paid_amount)
  if(!Number.isFinite(amount)||amount<=0||amount>selectedDue+0.009){notify('Enter an amount greater than zero and not more than the outstanding balance.');return}
  const {data:userData}=await supabase.auth.getUser();if(!userData.user){notify('Your session expired. Sign in again.');return}
  const receipt_number=receiptCode()
  setSaving(true)
  const {data,error}=await supabase.from('school_fee_payments').insert({school_id:schoolId,fee_structure_id:selectedFee.id,student_person_id:collection.student_person_id,academic_year:selectedFee.academic_year,receipt_number,paid_amount:amount,payment_method:collection.payment_method,transaction_reference:collection.transaction_reference.trim()||null,paid_on:collection.paid_on,notes:collection.notes.trim()||null,received_by:userData.user.id}).select('id,fee_structure_id,student_person_id,academic_year,receipt_number,paid_amount,payment_method,transaction_reference,paid_on,notes').single()
  setSaving(false);if(error){notify('Payment could not be saved: '+error.message);return}
  setReceipt(data as FeePayment);setCollection({...collection,paid_amount:'',transaction_reference:'',notes:''});notify('Payment saved. Receipt '+receipt_number+' generated.');await load()
 }
 const exportPending=()=>{
  const rows=[['Student ID','Student','Standard','Fee','Academic year','Fee amount','Paid','Outstanding'],...filteredPending.map(row=>[row.student.person_id,row.student.full_name,row.fee.standard_name,row.fee.fee_name,row.fee.academic_year,row.fee.amount,row.paid,row.due])]
  const csv=rows.map(row=>row.map(v=>'"'+String(v??'').replace(/"/g,'""')+'"').join(',')).join('\r\n')
  const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8;'}));const a=document.createElement('a');a.href=url;a.download='pending-fees-'+year+'.csv';a.click();URL.revokeObjectURL(url)
 }
 const printReceipt=()=>{window.print()}
 const title=page==='Finance'?'Finance overview':page==='Fees Structure'?'Fee structure':page==='Pending Fees'?'Pending fees':'Fee collection'

 return <section className="workspace-panel fee-module">
 <style>{`
 .fee-module .fee-stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin:18px 0}
 .fee-module .fee-stat{border:1px solid #e2ebe5;border-radius:14px;padding:16px;background:#fff}.fee-module .fee-stat span{display:flex;align-items:center;gap:7px;color:#68786f;font-size:12px;font-weight:700}.fee-module .fee-stat strong{display:block;color:#173d2b;font-size:24px;margin-top:10px}.fee-module .fee-stat small{color:#85928a}
 .fee-module .fee-toolbar{display:flex;gap:10px;align-items:end;flex-wrap:wrap;margin:18px 0}.fee-module label{display:grid;gap:6px;font-size:12px;color:#56685d;font-weight:700}.fee-module input,.fee-module select,.fee-module textarea{border:1px solid #dce7e0;border-radius:9px;padding:10px 11px;min-height:40px;background:white;color:#213b2c;min-width:0}.fee-module textarea{min-height:70px}
 .fee-module .fee-form-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:13px}.fee-module .fee-form-grid .wide{grid-column:span 2}
 .fee-module .fee-panel{border:1px solid #e3ebe6;border-radius:14px;padding:18px;background:#fff;margin-top:16px}.fee-module .fee-panel h3{margin:0 0 14px;color:#1d3a2b}
 .fee-module .fee-btn{border:0;border-radius:9px;background:#19764a;color:#fff;padding:11px 15px;font-weight:750;display:inline-flex;align-items:center;justify-content:center;gap:7px;cursor:pointer}.fee-module .fee-btn:disabled{opacity:.55;cursor:not-allowed}.fee-module .fee-btn.secondary{background:#fff;border:1px solid #dce7e0;color:#28533c}.fee-module .fee-actions{display:flex;gap:8px;flex-wrap:wrap}
 .fee-module .fee-table-wrap{overflow:auto;border:1px solid #e5ece7;border-radius:12px}.fee-module table{width:100%;border-collapse:collapse;min-width:650px}.fee-module th,.fee-module td{padding:12px 13px;text-align:left;border-bottom:1px solid #edf1ee;font-size:13px}.fee-module th{background:#f7faf8;color:#66766d;font-size:11px;text-transform:uppercase}.fee-module tbody tr:last-child td{border-bottom:0}
 .fee-module .fee-muted{color:#75847b}.fee-module .fee-positive{color:#17804a;font-weight:800}.fee-module .fee-negative{color:#bb5151;font-weight:800}.fee-module .fee-empty{padding:28px;text-align:center;color:#718078}.fee-module .fee-search{display:flex;align-items:center;gap:8px;border:1px solid #dce7e0;border-radius:10px;padding:0 10px;background:#fff;min-width:220px}.fee-module .fee-search input{border:0;outline:0;flex:1}
 .fee-module .fee-receipt{border:1px dashed #9aafa1;border-radius:12px;padding:20px;margin-top:18px;background:#fff}.fee-module .receipt-head{text-align:center;border-bottom:1px solid #e6ece8;padding-bottom:14px;margin-bottom:14px}.fee-module .receipt-head h3{margin:0;color:#193c2a}.fee-module .receipt-meta{display:grid;grid-template-columns:1fr 1fr;gap:8px}.fee-module .receipt-meta span{color:#75847b;font-size:12px}.fee-module .receipt-meta b{display:block;color:#1f392b;font-size:13px;margin-top:3px}
 @media(max-width:760px){.fee-module .fee-stats{grid-template-columns:repeat(2,minmax(0,1fr))}.fee-module .fee-form-grid{grid-template-columns:1fr}.fee-module .fee-form-grid .wide{grid-column:auto}.fee-module .fee-toolbar>*{flex:1}.fee-module .fee-search{min-width:100%}}
 @media print{body *{visibility:hidden!important}.fee-module .fee-receipt,.fee-module .fee-receipt *{visibility:visible!important}.fee-module .fee-receipt{position:absolute;left:0;top:0;width:100%;border:0}.fee-module .no-print{display:none!important}}
 `}</style>
 <div className="workspace-heading"><div><span className="section-eyebrow">SCHOOL FINANCE</span><h2>{title}</h2><p>{userRole==='Cashier-Staff'?'Record collections, review dues and issue payment receipts.':'Manage fee plans, collect payments, track student balances and issue payment receipts.'}</p></div><button className="fee-btn secondary no-print" onClick={()=>void load()} disabled={loading}><RefreshCw size={15}/> Refresh</button></div>
 {error&&<div className="qr-error">{error}</div>}
 <div className="fee-stats">
  <div className="fee-stat"><span><IndianRupee size={15}/> Total collected</span><strong>{money(collected)}</strong><small>All recorded payments</small></div>
  <div className="fee-stat"><span><FileText size={15}/> Expected fees</span><strong>{money(expected)}</strong><small>Active fee structures × enrolled students</small></div>
  <div className="fee-stat"><span><AlertCircle size={15}/> Outstanding</span><strong>{money(outstanding)}</strong><small>Estimated active fee balances</small></div>
  <div className="fee-stat"><span><Users size={15}/> Students</span><strong>{students.length}</strong><small>Student records visible to this account</small></div>
 </div>
 {page==='Finance'&&<div className="fee-panel"><h3>Finance overview</h3><p className="fee-muted">Open Fees to record a payment, Fees Structure to configure charges, or Pending Fees to review outstanding student balances. All totals are calculated from saved records.</p></div>}
 {page==='Fees Structure'&&<div className="fee-panel no-print"><h3><Plus size={17}/> Create fee structure</h3><form onSubmit={saveStructure}><div className="fee-form-grid">
  <label>Academic year<input value={form.academic_year} onChange={e=>setForm({...form,academic_year:e.target.value})} placeholder="2026-27" required/></label>
  <label>Standard<select value={form.standard_name} onChange={e=>setForm({...form,standard_name:e.target.value})} required><option value="">Select standard</option><option value="All Standards">All Standards</option>{Array.from({length:12},(_,i)=>'Standard '+(i+1)).map(v=><option key={v}>{v}</option>)}</select></label>
  <label>Fee name<input value={form.fee_name} onChange={e=>setForm({...form,fee_name:e.target.value})} placeholder="Tuition Fee" required/></label>
  <label>Amount (₹)<input type="number" min="1" step="0.01" value={form.amount} onChange={e=>setForm({...form,amount:e.target.value})} placeholder="15000" required/></label>
  <label>Due date<input type="date" value={form.due_date} onChange={e=>setForm({...form,due_date:e.target.value})}/></label>
  <label className="wide">Notes<input value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})} placeholder="Optional fee details"/></label>
 </div><div style={{marginTop:14}}><button className="fee-btn" disabled={saving||loading}>{saving?'Saving…':'Save fee structure'}</button></div></form></div>}
 {page==='Fees'&&<div className="fee-panel no-print"><h3><ReceiptText size={17}/> Record fee payment</h3><form onSubmit={savePayment}><div className="fee-form-grid">
  <label>Fee structure<select value={collection.fee_structure_id} onChange={e=>setCollection({...collection,fee_structure_id:e.target.value,student_person_id:'',paid_amount:''})} required><option value="">Select fee</option>{activeStructures.map(f=><option key={f.id} value={f.id}>{f.fee_name} · {f.standard_name} · {f.academic_year} · {money(Number(f.amount))}</option>)}</select></label>
  <label>Student<select value={collection.student_person_id} onChange={e=>setCollection({...collection,student_person_id:e.target.value,paid_amount:''})} required disabled={!selectedFee}><option value="">Select student</option>{eligibleStudents.map(s=><option key={s.person_id} value={s.person_id}>{s.full_name} · {s.person_id}</option>)}</select></label>
  <label>Outstanding amount<input readOnly value={selectedFee&&collection.student_person_id?money(selectedDue):'Select student'}/></label>
  <label>Amount received (₹)<input type="number" min="0.01" max={selectedDue||undefined} step="0.01" value={collection.paid_amount} onChange={e=>setCollection({...collection,paid_amount:e.target.value})} required/></label>
  <label>Payment method<select value={collection.payment_method} onChange={e=>setCollection({...collection,payment_method:e.target.value})}>{['Cash','UPI','Bank Transfer','Card','Cheque'].map(v=><option key={v}>{v}</option>)}</select></label>
  <label>Payment date<input type="date" value={collection.paid_on} onChange={e=>setCollection({...collection,paid_on:e.target.value})} required/></label>
  <label>Transaction reference<input value={collection.transaction_reference} onChange={e=>setCollection({...collection,transaction_reference:e.target.value})} placeholder="UPI / bank reference"/></label>
  <label className="wide">Notes<input value={collection.notes} onChange={e=>setCollection({...collection,notes:e.target.value})} placeholder="Optional remarks"/></label>
 </div><div style={{marginTop:14}}><button className="fee-btn" disabled={saving||loading||!selectedDue}>{saving?'Saving payment…':'Save payment & generate receipt'}</button></div></form></div>}
 {page==='Pending Fees'&&<div className="fee-panel"><div className="fee-toolbar"><label>Academic year<select value={year} onChange={e=>setYear(e.target.value)}>{[...new Set([currentAcademicYear(),...structures.map(x=>x.academic_year)])].map(y=><option key={y}>{y}</option>)}</select></label><div className="fee-search"><Search size={16}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search student or fee"/></div><button className="fee-btn secondary" onClick={exportPending}><Download size={15}/> Export CSV</button></div><div className="fee-table-wrap"><table><thead><tr><th>Student</th><th>Standard</th><th>Fee</th><th>Fee amount</th><th>Paid</th><th>Outstanding</th></tr></thead><tbody>{loading? <tr><td colSpan={6} className="fee-empty">Loading…</td></tr>:filteredPending.filter(x=>x.fee.academic_year===year).length?filteredPending.filter(x=>x.fee.academic_year===year).map(row=><tr key={row.fee.id+'-'+row.student.person_id}><td><b>{row.student.full_name}</b><br/><small>{row.student.person_id}</small></td><td>{row.fee.standard_name}</td><td>{row.fee.fee_name}</td><td>{money(Number(row.fee.amount))}</td><td className="fee-positive">{money(row.paid)}</td><td className="fee-negative">{money(row.due)}</td></tr>):<tr><td colSpan={6} className="fee-empty">No pending fee balances for this academic year.</td></tr>}</tbody></table></div></div>}
 {page==='Fees Structure'&&<div className="fee-panel"><h3>Fee structures</h3><div className="fee-table-wrap"><table><thead><tr><th>Academic year</th><th>Standard</th><th>Fee</th><th>Amount</th><th>Due date</th><th>Status</th><th className="no-print">Action</th></tr></thead><tbody>{loading?<tr><td colSpan={7} className="fee-empty">Loading…</td></tr>:structures.length?structures.map(f=><tr key={f.id}><td>{f.academic_year}</td><td>{f.standard_name}</td><td>{f.fee_name}</td><td>{money(Number(f.amount))}</td><td>{f.due_date||'—'}</td><td className={f.is_active?'fee-positive':'fee-muted'}>{f.is_active?'Active':'Inactive'}</td><td className="no-print"><button className="fee-btn secondary" onClick={()=>void toggleStructure(f)}>{f.is_active?'Deactivate':'Activate'}</button></td></tr>):<tr><td colSpan={7} className="fee-empty">No fee structures created yet.</td></tr>}</tbody></table></div></div>}
 {(page==='Fees'||page==='Finance')&&<div className="fee-panel"><div className="fee-toolbar"><div><h3 style={{margin:0}}>Recent payments</h3><p className="fee-muted">Latest saved fee receipts</p></div><div className="fee-search"><Search size={16}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search student or receipt"/></div></div><div className="fee-table-wrap"><table><thead><tr><th>Date</th><th>Receipt</th><th>Student</th><th>Fee</th><th>Method</th><th>Amount</th><th>Receipt</th></tr></thead><tbody>{loading?<tr><td colSpan={7} className="fee-empty">Loading…</td></tr>:filteredPayments.length?filteredPayments.map(p=><tr key={p.id}><td>{p.paid_on}</td><td>{p.receipt_number}</td><td>{studentById.get(p.student_person_id)?.full_name||p.student_person_id}</td><td>{structureById.get(p.fee_structure_id)?.fee_name||'Fee'}</td><td>{p.payment_method}</td><td className="fee-positive">{money(Number(p.paid_amount))}</td><td><button className="fee-btn secondary" onClick={()=>setReceipt(p)}><ReceiptText size={14}/> View</button></td></tr>):<tr><td colSpan={7} className="fee-empty">No payments recorded for {year}.</td></tr>}</tbody></table></div></div>}
 {receipt&&<div className="fee-receipt"><div className="receipt-head"><span className="section-eyebrow">OFFICIAL PAYMENT RECEIPT</span><h3>{schoolName}</h3><p className="fee-muted">Fee payment acknowledgement</p></div><div className="receipt-meta">
  <div><span>Receipt number</span><b>{receipt.receipt_number}</b></div><div><span>Payment date</span><b>{receipt.paid_on}</b></div>
  <div><span>Student</span><b>{studentById.get(receipt.student_person_id)?.full_name||receipt.student_person_id}</b></div><div><span>Admission number</span><b>{receipt.student_person_id}</b></div>
  <div><span>Fee</span><b>{structureById.get(receipt.fee_structure_id)?.fee_name||'Fee'}</b></div><div><span>Academic year</span><b>{receipt.academic_year}</b></div>
  <div><span>Payment method</span><b>{receipt.payment_method}</b></div><div><span>Reference</span><b>{receipt.transaction_reference||'—'}</b></div>
 </div><div style={{borderTop:'1px solid #e5ece7',marginTop:16,paddingTop:14,display:'flex',justifyContent:'space-between',gap:12}}><b>Amount received</b><strong style={{fontSize:22,color:'#187447'}}>{money(Number(receipt.paid_amount))}</strong></div><p className="fee-muted">This is a computer-generated receipt. Please retain it for your records.</p><div className="fee-actions no-print"><button className="fee-btn" onClick={printReceipt}><Printer size={15}/> Print receipt</button><button className="fee-btn secondary" onClick={()=>setReceipt(null)}>Close</button></div></div>}
 </section>
}
