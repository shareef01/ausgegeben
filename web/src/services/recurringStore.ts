import { create } from 'zustand';
import { useEffect, useRef } from 'react';
import { useAuthStore } from './authStore';
import { recurringRepository, type RecurringIssue } from './recurringRepository';
import type { RecurringTemplate } from './recurrence';
import { runCatchUp } from './catchUpLoop';
import { useLocalDay } from '@/hooks/useLocalDay';
interface State { owner: string | null; rows: RecurringTemplate[]; /** The first snapshot for `owner` has arrived (tells "loading" from "empty"). */ loaded: boolean; incomplete: boolean; error: boolean; syncing: boolean; issues: RecurringIssue[]; quarantined: boolean }
export const useRecurringStore = create<State>(() => ({owner:null,rows:[],loaded:false,incomplete:true,error:false,syncing:false,issues:[],quarantined:false}));
let flight: { owner: string; promise: Promise<void> } | null = null;
export function syncRecurring(): Promise<void> {
  const user=useAuthStore.getState().user;
  if (!user?.emailVerified) return Promise.resolve();
  const owner=user.uid;
  if (flight?.owner === owner) return flight.promise;
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
