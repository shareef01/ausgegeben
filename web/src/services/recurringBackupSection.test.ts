import {it,expect,describe} from 'vitest';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {assertReceiptIdentities,mismatchedReceiptIds,parseRecurringSection,serializeRecurringSection,type OccurrenceReceipt} from './recurringBackupSection';
const receipt={id:'550e8400-e29b-41d4-a716-446655440000_2024-01-31',templateId:'550e8400-e29b-41d4-a716-446655440000',scheduledDate:'2024-01-31',expenseId:'15634124eab0e61b1e96e3bcc40968a8bfdce35bd2ee44f76fabdc3ab77e78f4',createdAt:1};
it('round-trips receipts retained after template deletion',()=>{const section={templates:[],receipts:[receipt]};expect(parseRecurringSection(JSON.parse(serializeRecurringSection(section)))).toEqual(section);});
it('requires explicit collections instead of inferring deletion from absence',()=>expect(()=>parseRecurringSection({templates:[]})).toThrow());
it('rejects unknown fields',()=>expect(()=>parseRecurringSection({templates:[],receipts:[{...receipt,privateExtra:1}]})).toThrow());
it('rejects duplicate receipt identities',()=>expect(()=>parseRecurringSection({templates:[],receipts:[receipt,receipt]})).toThrow());
it('rejects an ambiguous receipt path',()=>expect(()=>parseRecurringSection({templates:[],receipts:[{...receipt,id:receipt.id+'extra'}]})).toThrow());

const restoreFixture:{cases:{name:string;receipt:OccurrenceReceipt;accepted:boolean}[]}=JSON.parse(readFileSync(resolve(process.cwd(),'../testdata/receipt-restore.json'),'utf8'));
/** A restore may write a receipt only when the backup parser AND the identity rule accept it. */
async function restorable(r:OccurrenceReceipt):Promise<boolean>{
 try{parseRecurringSection({templates:[],receipts:[r]});}catch{return false;}
 return (await mismatchedReceiptIds([r])).length===0;
}
describe('restore receipt identity - shared fixture (testdata/receipt-restore.json)',()=>{
 it('covers a canonical receipt and several mismatches',()=>{expect(restoreFixture.cases.filter(c=>c.accepted).length).toBeGreaterThan(0);expect(restoreFixture.cases.filter(c=>!c.accepted).length).toBeGreaterThanOrEqual(4);});
 it.each(restoreFixture.cases)('$name',async c=>expect(await restorable(c.receipt)).toBe(c.accepted));
 it('names every mismatched receipt and rejects the whole set',async()=>{
  const all=restoreFixture.cases.map(c=>c.receipt),bad=restoreFixture.cases.filter(c=>!c.accepted).map(c=>c.receipt.id);
  expect(await mismatchedReceiptIds(all)).toEqual(bad);
  await expect(assertReceiptIdentities(all)).rejects.toThrow('INVALID_RECURRING_SECTION');
  await expect(assertReceiptIdentities(restoreFixture.cases.filter(c=>c.accepted).map(c=>c.receipt))).resolves.toBeUndefined();
 });
});
