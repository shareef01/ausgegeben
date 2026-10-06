import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from '@/i18n';
import { useAuthStore } from '@/services/authStore';
import { recurringRepository } from '@/services/recurringRepository';
import { syncRecurring, useRecurringStore } from '@/services/recurringStore';
import { localDateAt, occurrenceDate, validTemplate, type RecurringTemplate, type Frequency } from '@/services/recurrence';
import { expenseRepository } from '@/repositories/expenseRepository';
import type { Category, TransactionType } from '@/models/types';
import { useFocusTrap } from '@/hooks/useFocusTrap';
import { useBodyScrollLock } from '@/hooks/useBodyScrollLock';
import { ConfirmDialog } from './ConfirmDialog';

export function RecurringManager() {
  const {t}=useTranslation(); const [open,setOpen]=useState(false); const user=useAuthStore(s=>s.user);
  useEffect(()=>setOpen(false),[user?.uid]);
  return <><button className="btn btn-secondary" onClick={()=>setOpen(true)}>{t('recurringTitle')}</button>{open && user && <RecurringPanel key={user.uid} owner={user.uid} close={()=>setOpen(false)}/>}</>;
}
function RecurringPanel({owner,close}:{owner:string;close:()=>void}) {
  const {t}=useTranslation(); const user=useAuthStore(s=>s.user); const state=useRecurringStore();
  const rows=state.owner===owner ? state.rows : []; const root=useRef<HTMLDivElement>(null);
  const [categories,setCategories]=useState<Category[]>([]); const [draft,setDraft]=useState<RecurringTemplate|null>(null);
  const [expected,setExpected]=useState<number|null>(null); const [busy,setBusy]=useState(false); const [error,setError]=useState(false); const [removing,setRemoving]=useState<RecurringTemplate|null>(null);
  useFocusTrap(!removing,root,close); useBodyScrollLock(true);
  useEffect(()=>{let alive=true;void expenseRepository.getAllCategories().then(c=>{if(alive&&useAuthStore.getState().user?.uid===owner)setCategories(c);}).catch(()=>{if(alive)setError(true);});return ()=>{alive=false;};},[owner]);
  const mutate=async (work:()=>Promise<unknown>)=>{
    if(busy)return;setBusy(true);setError(false);
    try {await work();if(useAuthStore.getState().user?.uid===owner){setDraft(null);setRemoving(null);}}
    catch {if(useAuthStore.getState().user?.uid===owner)setError(true);}
    finally {if(useAuthStore.getState().user?.uid===owner)setBusy(false);}
  };
  const create=()=>{const now=Date.now(),timeZone=Intl.DateTimeFormat().resolvedOptions().timeZone,startDate=localDateAt(now,timeZone);setExpected(null);setDraft({id:crypto.randomUUID(),amount:1,categoryId:categories.find(c=>c.transactionType==='expense')?.id??'',note:'',transactionType:'expense',frequency:'monthly',interval:1,startDate,endDate:null,timeZone,enabled:true,nextIndex:0,nextDate:startDate,createdAt:now,updatedAt:now});};
  const patch=(value:Partial<RecurringTemplate>)=>setDraft(old=>old?{...old,...value}:null);
  const disabled=busy || !user?.emailVerified || !navigator.onLine;
  return createPortal(<div className="overlay"><div className="recurring-panel" role="dialog" aria-modal="true" aria-labelledby="recurring-title" ref={root} tabIndex={-1}>
    <h2 id="recurring-title">{t('recurringTitle')}</h2><button className="btn btn-secondary" onClick={close} disabled={busy}>{t('recurringClose')}</button>
    <p>{t('recurringContract')}</p>{state.incomplete && <p role="status">{t('recurringOffline')}</p>}{(error||state.error)&&<p role="alert">{t('recurringError')}</p>}
    <button className="btn btn-secondary" disabled={disabled||state.syncing} onClick={()=>void syncRecurring()}>{t('recurringRefresh')}</button>
    {!draft && <button className="btn btn-primary" disabled={disabled} onClick={create}>{t('recurringNew')}</button>}
    {draft && <form className="recurring-form" onSubmit={e=>{e.preventDefault();const next={...draft,nextDate:occurrenceDate(draft,draft.nextIndex)};if(!validTemplate(next)){setError(true);return;}void mutate(()=>recurringRepository.save(owner,next,expected));}}>
      <label>{t('recurringAmount')}<input required type="number" min="0.01" max="999999999.99" step="0.01" value={draft.amount} onChange={e=>patch({amount:e.target.valueAsNumber})}/></label>
      <label>{t('recurringType')}<select aria-label={t('recurringType')} value={draft.transactionType} onChange={e=>patch({transactionType:e.target.value as TransactionType,categoryId:''})}>{(['expense','income','transfer'] as const).map(type=><option key={type} value={type}>{t(type==='expense'?'typeExpense':type==='income'?'typeIncome':'typeTransfer')}</option>)}</select></label>
      <label>{t('recurringCategory')}<select aria-label={t('recurringCategory')} required value={draft.categoryId} onChange={e=>patch({categoryId:e.target.value})}><option value="">—</option>{categories.filter(c=>c.transactionType===draft.transactionType&&!c.migrationState).map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
      <label>{t('recurringNote')}<input maxLength={2000} value={draft.note} onChange={e=>patch({note:e.target.value})}/></label>
      <label>{t('recurringEvery')}<input required type="number" min="1" max="365" step="1" value={draft.interval} onChange={e=>patch({interval:e.target.valueAsNumber})}/></label>
      <label>{t('recurringFrequency')}<select aria-label={t('recurringFrequency')} value={draft.frequency} onChange={e=>patch({frequency:e.target.value as Frequency})}>{(['daily','weekly','monthly','yearly'] as const).map(f=><option key={f} value={f}>{t(f==='daily'?'recurringDaily':f==='weekly'?'recurringWeekly':f==='monthly'?'recurringMonthly':'recurringYearly')}</option>)}</select></label>
      <label>{t('recurringStarts')}<input required type="date" min="2000-01-01" max="2099-12-31" value={draft.startDate} onChange={e=>patch({startDate:e.target.value})}/></label>
      <label>{t('recurringEnds')}<input type="date" min={draft.startDate} max="2099-12-31" value={draft.endDate??''} onChange={e=>patch({endDate:e.target.value||null})}/></label>
      <p>{t('recurringZone')}: {draft.timeZone}</p><button className="btn btn-primary" disabled={disabled}>{t('actionSave')}</button><button type="button" className="btn btn-secondary" disabled={busy} onClick={()=>setDraft(null)}>{t('actionCancel')}</button>
    </form>}
    <div aria-live="polite">{!rows.length&&<p>{t('recurringEmpty')}</p>}{rows.map(row=><article className="recurring-row" key={row.id}>
      <strong>{row.note||categories.find(c=>c.id===row.categoryId)?.name||t('recurringTitle')}</strong><p>{row.amount.toFixed(2)} · {categories.find(c=>c.id===row.categoryId)?.name} · {t('recurringEvery')} {row.interval} {t(row.frequency==='daily'?'recurringDaily':row.frequency==='weekly'?'recurringWeekly':row.frequency==='monthly'?'recurringMonthly':'recurringYearly')}</p>
      <p>{t(row.enabled?(row.nextDate?'recurringActive':'recurringEnded'):'recurringPaused')} · {t('recurringNext')}: {row.nextDate??'—'}</p>
      <button className="btn btn-secondary" disabled={disabled} onClick={()=>{setExpected(row.updatedAt);setDraft({...row});}}>{t('recurringEdit')}</button>
      <button className="btn btn-secondary" disabled={disabled} onClick={()=>void mutate(()=>recurringRepository.save(owner,{...row,enabled:!row.enabled},row.updatedAt))}>{t(row.enabled?'recurringPause':'recurringResume')}</button>
      <button className="btn btn-secondary" disabled={disabled} onClick={()=>setRemoving(row)}>{t('actionDelete')}</button>
    </article>)}</div>
    <ConfirmDialog open={!!removing} title={t('recurringDelete')} message={t('recurringDeleteMessage')} confirmDisabled={busy} onCancel={()=>{if(!busy)setRemoving(null);}} onConfirm={()=>{if(removing)void mutate(()=>recurringRepository.remove(owner,removing.id,removing.updatedAt));}}/>
  </div></div>,document.body);
}
