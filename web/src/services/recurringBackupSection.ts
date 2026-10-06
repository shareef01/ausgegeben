import { occurrenceKey, receiptId, validTemplate, type RecurringTemplate } from './recurrence';
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
