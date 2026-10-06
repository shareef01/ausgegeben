import {it,expect} from 'vitest';
import {parseRecurringSection,serializeRecurringSection} from './recurringBackupSection';
const receipt={id:'550e8400-e29b-41d4-a716-446655440000_2024-01-31',templateId:'550e8400-e29b-41d4-a716-446655440000',scheduledDate:'2024-01-31',expenseId:'a'.repeat(64),createdAt:1};
it('round-trips receipts retained after template deletion',()=>{const section={templates:[],receipts:[receipt]};expect(parseRecurringSection(JSON.parse(serializeRecurringSection(section)))).toEqual(section);});
it('requires explicit collections instead of inferring deletion from absence',()=>expect(()=>parseRecurringSection({templates:[]})).toThrow());
it('rejects unknown fields',()=>expect(()=>parseRecurringSection({templates:[],receipts:[{...receipt,privateExtra:1}]})).toThrow());
it('rejects duplicate receipt identities',()=>expect(()=>parseRecurringSection({templates:[],receipts:[receipt,receipt]})).toThrow());
it('rejects an ambiguous receipt path',()=>expect(()=>parseRecurringSection({templates:[],receipts:[{...receipt,id:receipt.id+'extra'}]})).toThrow());
