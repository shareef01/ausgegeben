import {beforeEach,it,expect,vi} from 'vitest';
const callbacks=vi.hoisted(()=>({next:null as null|((snap:any)=>void),error:null as null|(()=>void),stop:vi.fn(),listened:null as unknown}));
const plain=vi.hoisted(()=>({kind:'plain-collection'}));
vi.mock('@/services/firebase',()=>({getFirebaseFirestore:()=>({})}));
vi.mock('firebase/firestore',async original=>({...await original<typeof import('firebase/firestore')>(),collection:()=>plain,query:(base:unknown,...constraints:unknown[])=>({base,constraints}),limit:(n:number)=>({limit:n}),onSnapshot:(ref:unknown,_options:unknown,next:(snap:any)=>void,error:()=>void)=>{callbacks.listened=ref;callbacks.next=next;callbacks.error=error;return callbacks.stop;}}));
import {LISTENER_LIMIT,recurringRepository} from './recurringRepository';
import {useAuthStore} from './authStore';
const signIn=(uid:string)=>useAuthStore.setState({user:{uid,email:null,displayName:null,emailVerified:true}});
beforeEach(()=>{callbacks.stop.mockClear();signIn('a');});
it('ignores callbacks from the previous account immediately',()=>{const notify=vi.fn(),stop=recurringRepository.observe('a',notify);callbacks.next!({docs:[],metadata:{fromCache:false}});expect(notify).toHaveBeenCalledTimes(1);signIn('b');callbacks.next!({docs:[],metadata:{fromCache:false}});callbacks.error!();expect(notify).toHaveBeenCalledTimes(1);stop();expect(callbacks.stop).toHaveBeenCalledTimes(1);});
// getAll reads the plain collection query from the server. A listener on that same query
// would have the SDK answer that read from the listener's possibly stale view instead.
it('listens on a query of its own, never the plain one getAll reads',()=>{const stop=recurringRepository.observe('a',vi.fn());expect(callbacks.listened).not.toBe(plain);expect(callbacks.listened).toEqual({base:plain,constraints:[{limit:LISTENER_LIMIT}]});stop();});
it('cleanup rejects late snapshots even if the same account remounts',()=>{const notify=vi.fn(),stop=recurringRepository.observe('a',notify);stop();callbacks.next!({docs:[],metadata:{fromCache:false}});callbacks.error!();expect(notify).not.toHaveBeenCalled();});
