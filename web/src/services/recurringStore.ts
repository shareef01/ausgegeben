import { create } from 'zustand';
import { useEffect } from 'react';
import { useAuthStore } from './authStore';
import { recurringRepository } from './recurringRepository';
import type { RecurringTemplate } from './recurrence';
interface State { owner: string | null; rows: RecurringTemplate[]; incomplete: boolean; error: boolean; syncing: boolean }
export const useRecurringStore = create<State>(() => ({owner:null,rows:[],incomplete:true,error:false,syncing:false}));
let flight: { owner: string; promise: Promise<void> } | null = null;
export function syncRecurring(): Promise<void> {
  const user=useAuthStore.getState().user;
  if (!user?.emailVerified) return Promise.resolve();
  const owner=user.uid;
  if (flight?.owner === owner) return flight.promise;
  useRecurringStore.setState({syncing:true});
  const promise=recurringRepository.reconcile(owner).then(()=>{
    if(useAuthStore.getState().user?.uid===owner) useRecurringStore.setState({error:false});
  }).catch(()=>{
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
  useEffect(()=>{
    useRecurringStore.setState({owner:user?.uid??null,rows:[],incomplete:true,error:false,syncing:false});
    if(!user) return;
    const stop=recurringRepository.observe(user.uid,(rows,incomplete,error)=>useRecurringStore.setState({owner:user.uid,rows,incomplete,error}));
    const online=()=>{void syncRecurring();};
    const visible=()=>{if(document.visibilityState==='visible') online();};
    online(); window.addEventListener('online',online); document.addEventListener('visibilitychange',visible);
    return ()=>{stop();window.removeEventListener('online',online);document.removeEventListener('visibilitychange',visible);useRecurringStore.setState({owner:null,rows:[],incomplete:true,error:false,syncing:false});};
  },[user?.uid,user?.emailVerified]);
}
