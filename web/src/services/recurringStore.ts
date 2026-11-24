import { create } from 'zustand';
import { useEffect, useRef } from 'react';
import { useAuthStore } from './authStore';
import { recurringRepository, type RecurringIssue } from './recurringRepository';
import { localDateAt, type RecurringTemplate } from './recurrence';
import { runCatchUp } from './catchUpLoop';
import { useLocalDay } from '@/hooks/useLocalDay';
interface State { owner: string | null; rows: RecurringTemplate[]; /** The first snapshot for `owner` has arrived (tells "loading" from "empty"). */ loaded: boolean; incomplete: boolean; error: boolean; syncing: boolean; issues: RecurringIssue[]; quarantined: boolean }
export const useRecurringStore = create<State>(() => ({owner:null,rows:[],loaded:false,incomplete:true,error:false,syncing:false,issues:[],quarantined:false}));
let flight: { owner: string; promise: Promise<void> } | null = null;
/** One follow-up pass, shared by every caller that asked while `flight` was running. */
let queued: { owner: string; promise: Promise<void> } | null = null;
/**
 * Runs a catch-up pass that starts no earlier than this call.
 *
 * A pass reads the templates once, at its start. Joining a pass that was already running
 * would miss a template saved after it started, so its charge due today stayed unrecorded
 * until something else triggered catch-up. A call made while a pass runs therefore waits
 * for it and then runs one more; calls made meanwhile share that follow-up.
 */
export function syncRecurring(): Promise<void> {
  const user=useAuthStore.getState().user;
  if (!user?.emailVerified) return Promise.resolve();
  const owner=user.uid;
  if (flight?.owner === owner) {
    if (queued?.owner === owner) return queued.promise;
    const followUp=flight.promise.then(()=>{ if(queued?.promise===followUp) queued=null; return syncRecurring(); });
    queued={owner,promise:followUp};
    return followUp;
  }
  useRecurringStore.setState({syncing:true});
  // AUS-202: keep passing until the backlog is done, while this account stays signed in.
  const pass=async()=>{ await recurringRepository.reconcile(owner); return recurringRepository.catchUpIncomplete(owner); };
  const promise=runCatchUp(pass,()=>useAuthStore.getState().user?.uid===owner).then(()=>{
    // A response for a previous account must never write into the current one.
    if(useAuthStore.getState().user?.uid!==owner) return;
    const issues=recurringRepository.getRecurringIssues(owner);
    // Quarantined occurrences mean catch-up is not complete, even though the pass succeeded.
    useRecurringStore.setState({error:false,issues,quarantined:issues.length>0});
  }).catch(()=>{
    // A failed pass (auth, permission, network) says nothing about data integrity:
    // keep the last confirmed quarantine visible instead of implying it was resolved.
    if(useAuthStore.getState().user?.uid===owner) useRecurringStore.setState({error:true,incomplete:true});
  }).finally(()=>{
    if(flight?.promise===promise) flight=null;
    if(useAuthStore.getState().user?.uid===owner) useRecurringStore.setState({syncing:false});
  });
  flight={owner,promise}; return promise;
}
/** The fields a person chooses; everything else on a template is bookkeeping. */
const TERMS = ['amount','categoryId','note','transactionType','frequency','interval','startDate','endDate','timeZone','enabled'] as const;
/** `fresh` differs from `seen` only by catch-up bookkeeping (next date and revision). */
export function onlyCaughtUp(fresh: RecurringTemplate, seen: RecurringTemplate): boolean {
  return TERMS.every(k => fresh[k] === seen[k]);
}
/**
 * Records what a template already owes before it is paused or edited, and returns the
 * server's copy afterwards (`null` once it is gone).
 *
 * Saving a paused or edited template restarts it after today, so a charge due today that
 * catch-up had not recorded yet was skipped for good: pause a new template quickly, resume
 * it, and today's charge never appeared. Anything due under the old terms is now recorded
 * under those terms first.
 */
export async function catchUpBeforeChange(owner: string, row: RecurringTemplate): Promise<RecurringTemplate | null> {
  if (!row.enabled || row.nextDate === null || row.nextDate > localDateAt(Date.now(), row.timeZone)) return row;
  await syncRecurring();
  return (await recurringRepository.getAll(owner)).find(r => r.id === row.id) ?? null;
}
/** Mounted once by the authenticated shell; snapshots never trigger write loops. */
export function useRecurringSync() {
  const user=useAuthStore(s=>s.user);
  // Keyed on the id and verification flag, not the user object, so a token refresh that
  // swaps the object does not tear down and rebuild the listener.
  const uid=user?.uid;
  const emailVerified=user?.emailVerified;
  // A tab left open past midnight has new due dates, and no online/visibility event to
  // trigger catch-up for them (AUS-202). The first value is the mount, which the effect
  // below already covers.
  const today=useLocalDay();
  const lastDay=useRef(today);
  useEffect(()=>{ if(today===lastDay.current) return; lastDay.current=today; if(uid) void syncRecurring(); },[today,uid]);
  useEffect(()=>{
    useRecurringStore.setState({owner:uid??null,rows:[],loaded:false,incomplete:true,error:false,syncing:false,issues:[],quarantined:false});
    if(!uid) return;
    const stop=recurringRepository.observe(uid,(rows,incomplete,error)=>useRecurringStore.setState({owner:uid,rows,loaded:true,incomplete,error}));
    const online=()=>{void syncRecurring();};
    const visible=()=>{if(document.visibilityState==='visible') online();};
    online(); window.addEventListener('online',online); document.addEventListener('visibilitychange',visible);
    return ()=>{stop();window.removeEventListener('online',online);document.removeEventListener('visibilitychange',visible);useRecurringStore.setState({owner:null,rows:[],loaded:false,incomplete:true,error:false,syncing:false});};
  },[uid,emailVerified]);
}
