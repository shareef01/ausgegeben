import { initializeTestEnvironment, assertSucceeds, assertFails, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, setDoc, getDoc, updateDoc, deleteDoc, writeBatch } from 'firebase/firestore';
import { readFileSync } from 'node:fs';
import { beforeAll, beforeEach, afterAll, describe, it } from 'vitest';
let env:RulesTestEnvironment;
const id='550e8400-e29b-41d4-a716-446655440000', path=`users/a/recurringTransactions/${id}`;
const t={amount:15,categoryId:'rent',note:'',transactionType:'expense',frequency:'monthly',interval:1,startDate:'2024-01-31',endDate:null,timeZone:'Europe/Berlin',enabled:true,nextIndex:0,nextDate:'2024-01-31',createdAt:1,updatedAt:1};
const owner=()=>env.authenticatedContext('a',{email_verified:true}).firestore();
async function create(data:Record<string,unknown>=t){const db=owner(),b=writeBatch(db);b.set(doc(db,path),data);b.update(doc(db,'users/a/categories/rent'),{recurringTemplateCount:1,recurringMutationId:id});return b.commit();}
beforeAll(async()=>{env=await initializeTestEnvironment({projectId:'demo-recurring-rules',firestore:{host:'127.0.0.1',port:8080,rules:readFileSync('../firestore.rules','utf8')}});});
afterAll(async()=>{await env?.cleanup();});
beforeEach(async()=>{await env.clearFirestore();await env.withSecurityRulesDisabled(async c=>setDoc(doc(c.firestore(),'users/a/categories/rent'),{name:'Rent',iconName:'home',colorInt:1,sortOrder:0,transactionType:'expense'}));});
describe('recurring owner boundary and category integrity',()=>{
 it('owner can create, read, update and delete with atomic reference accounting',async()=>{await assertSucceeds(create());const db=owner();await assertSucceeds(getDoc(doc(db,path)));await assertSucceeds(updateDoc(doc(db,path),{note:'new',updatedAt:2}));const b=writeBatch(db);b.delete(doc(db,path));b.update(doc(db,'users/a/categories/rent'),{recurringTemplateCount:0,recurringMutationId:id});await assertSucceeds(b.commit());});
 it('denies cross-user reads and writes',async()=>{await create();const other=env.authenticatedContext('b',{email_verified:true}).firestore();await assertFails(getDoc(doc(other,path)));await assertFails(updateDoc(doc(other,path),{updatedAt:2}));await assertFails(deleteDoc(doc(other,path)));});
 it('denies unverified writes',async()=>{await assertFails(setDoc(doc(env.authenticatedContext('a',{email_verified:false}).firestore(),path),t));});
 it.each([{amount:0},{amount:0.001},{categoryId:'missing'},{transactionType:'income'},{frequency:'cron'},{interval:0},{interval:-1},{interval:366},{startDate:'2024-02-30'},{endDate:'2023-01-01'},{nextDate:'2024-02-30'},{timeZone:''},{note:'x'.repeat(2001)},{unknown:true}])('denies invalid payload %j',async change=>{await assertFails(create({...t,...change}));});
 it('requires a paired category counter mutation',async()=>{await assertFails(setDoc(doc(owner(),path),t));await assertFails(updateDoc(doc(owner(),'users/a/categories/rent'),{recurringTemplateCount:1,recurringMutationId:id}));});
 it('blocks deletion and migration while active or paused references exist',async()=>{await create();const db=owner(),cat=doc(db,'users/a/categories/rent');await assertFails(updateDoc(cat,{deletionState:'deleting'}));await assertFails(updateDoc(cat,{migrationState:'migrating',pendingTransactionType:'income'}));await updateDoc(doc(db,path),{enabled:false,updatedAt:2});await assertFails(updateDoc(cat,{deletionState:'deleting'}));});
 it('cannot remove receipt after deleting an ordinary occurrence',async()=>{const db=owner();await env.withSecurityRulesDisabled(async c=>setDoc(doc(c.firestore(),`users/a/recurringOccurrences/${id}_2024-01-31`),{templateId:id,scheduledDate:'2024-01-31',expenseId:'a'.repeat(64),createdAt:1}));await assertFails(deleteDoc(doc(db,`users/a/recurringOccurrences/${id}_2024-01-31`)));await assertFails(updateDoc(doc(db,`users/a/recurringOccurrences/${id}_2024-01-31`),{createdAt:2}));});
});
