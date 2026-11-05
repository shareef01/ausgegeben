import { occurrenceKey, receiptId, validOccurrenceReceipt, validTemplate, type RecurringTemplate } from './recurrence';
import { expenseDocumentId } from '@/utils/idempotency';
export interface OccurrenceReceipt { id:string; templateId:string; scheduledDate:string; expenseId:string; createdAt:number }
export interface RecurringBackupSection { templates:RecurringTemplate[]; receipts:OccurrenceReceipt[] }
const templateKeys='id amount categoryId note transactionType frequency interval startDate endDate timeZone enabled nextIndex nextDate createdAt updatedAt'.split(' ');
const receiptKeys='id templateId scheduledDate expenseId createdAt'.split(' ');
function exact(value:unknown,keys:string[]):value is Record<string,unknown> {return !!value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length===keys.length&&keys.every(k=>Object.hasOwn(value,k));}
/** Isolated representation only: does not change published backup schema versions. */
export function parseRecurringSection(value:unknown):RecurringBackupSection {
 if(!exact(value,['templates','receipts']) || !Array.isArray(value.templates)||!Array.isArray(value.receipts))throw new Error('INVALID_RECURRING_SECTION');
 const templates=value.templates as RecurringTemplate[],receipts=value.receipts as OccurrenceReceipt[];
 if(templates.some(t=>!exact(t,templateKeys)||!validTemplate(t)) || new Set(templates.map(t=>t.id)).size!==templates.length)throw new Error('INVALID_RECURRING_SECTION');
 const seen=new Set<string>();
 for(const r of receipts){
  if(!exact(r,receiptKeys)||typeof r.templateId!=='string'||typeof r.scheduledDate!=='string'||!Number.isSafeInteger(r.createdAt)||r.createdAt<=0||typeof r.expenseId!=='string'||!/^[0-9a-f]{64}$/.test(r.expenseId))throw new Error('INVALID_RECURRING_SECTION');
  occurrenceKey(r.templateId,r.scheduledDate);
  if(r.id!==receiptId(r.templateId,r.scheduledDate)||seen.has(r.id))throw new Error('INVALID_RECURRING_SECTION');seen.add(r.id);
 }
 // Orphan receipts are intentional: deleting a template retains deduplication history.
 return structuredClone({templates,receipts});
}
export function serializeRecurringSection(value:RecurringBackupSection):string {return JSON.stringify(parseRecurringSection(value));}

/**
 * Ids of receipts that do not prove their canonical occurrence identity (Android parity:
 * RecurringBackupSection.parse). Receipts are immutable once written, so a restore must
 * refuse them up front: a mismatched receipt would pause its template with no in-app repair.
 * Kept separate from the synchronous parser because the expense id is a SHA-256 digest.
 */
export async function mismatchedReceiptIds(receipts:readonly OccurrenceReceipt[]):Promise<string[]> {
 const bad:string[]=[];
 for(const r of receipts){
  let ok=false;
  try{
   ok=r.id===receiptId(r.templateId,r.scheduledDate)&&validOccurrenceReceipt(r,{templateId:r.templateId,scheduledDate:r.scheduledDate,expenseId:await expenseDocumentId(occurrenceKey(r.templateId,r.scheduledDate))});
  }catch{ok=false;}
  if(!ok)bad.push(String(r?.id));
 }
 return bad;
}
/** Throws INVALID_RECURRING_SECTION naming every receipt whose identity does not match. */
export async function assertReceiptIdentities(receipts:readonly OccurrenceReceipt[]):Promise<void> {
 const bad=await mismatchedReceiptIds(receipts);
 if(bad.length)throw new Error(`INVALID_RECURRING_SECTION: recurring receipt ${bad.join(', ')} does not match its template and date`);
}
