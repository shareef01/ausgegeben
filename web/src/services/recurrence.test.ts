import fixtures from '../../../fixtures/recurrence.json';
import {expenseDocumentId} from '@/utils/idempotency';
import { describe, expect, it } from 'vitest';
import { dueDates, indexAfter, occurrenceDate, occurrenceKey, occurrenceMillis, validTemplate, type RecurringTemplate } from './recurrence';
const template: RecurringTemplate = { id: '550e8400-e29b-41d4-a716-446655440000', amount: 15, categoryId: 'subscriptions', note: '', transactionType: 'expense', frequency: 'monthly', interval: 1, startDate: '2024-01-31', endDate: null, timeZone: 'Europe/Berlin', enabled: true, nextIndex: 0, nextDate: '2024-01-31', createdAt: 1, updatedAt: 1 };
describe('recurrence calendar contract', () => {
  it.each([['daily',1,'2024-02-01'],['daily',3,'2024-02-03'],['weekly',1,'2024-02-07'],['weekly',2,'2024-02-14'],['monthly',1,'2024-02-29'],['yearly',1,'2025-01-31']] as const)('anchors %s every %i', (frequency,interval,expected) => expect(occurrenceDate({...template,frequency,interval},1)).toBe(expected));
  it.each([1,28,29,30,31])('restores monthly anchor %i after February', day => {
    const t={...template,startDate:`2023-01-${String(day).padStart(2,'0')}`};
    expect(occurrenceDate(t,1)).toBe(`2023-02-${String(Math.min(day,28)).padStart(2,'0')}`);
    expect(occurrenceDate(t,2)).toBe(`2023-03-${String(day).padStart(2,'0')}`);
  });
  it('restores leap-day yearly anchor',()=> { const t={...template,frequency:'yearly' as const,startDate:'2024-02-29'};expect(occurrenceDate(t,1)).toBe('2025-02-28');expect(occurrenceDate(t,4)).toBe('2028-02-29'); });
  it.each([['2024-03-31','2024-03-30T23:00:00Z'],['2024-04-01','2024-03-31T22:00:00Z'],['2024-10-27','2024-10-26T22:00:00Z'],['2024-10-28','2024-10-27T23:00:00Z']])('uses local midnight across DST %s',(day,instant)=>expect(occurrenceMillis(day,'Europe/Berlin')).toBe(Date.parse(instant)));
  it('handles an entirely skipped local date',()=>expect(occurrenceMillis('2011-12-30','Pacific/Apia')).toBe(Date.parse('2011-12-30T10:00:00Z')));
  it('bounds catch-up and includes the end date',()=>{expect(dueDates({...template,endDate:'2024-03-31'},Date.parse('2024-04-10T12:00:00Z'))).toEqual(['2024-01-31','2024-02-29','2024-03-31']);expect(dueDates({...template,frequency:'daily'},Date.parse('2024-04-10T12:00:00Z'))).toHaveLength(20);});
  it('does not materialize paused or future templates',()=>{expect(dueDates({...template,enabled:false},Date.parse('2024-04-10'))).toEqual([]);expect(dueDates(template,Date.parse('2023-12-01'))).toEqual([]);});
  it('moves edits and resumes strictly past today',()=>expect(indexAfter(template,'2024-03-31')).toBe(3));
  it('uses unambiguous canonical identity',()=>expect(occurrenceKey(template.id,'2024-02-29')).toBe('["recurring-v1","550e8400-e29b-41d4-a716-446655440000","2024-02-29"]'));
  it('rejects malformed zones and terminates extreme schedules',()=>{expect(validTemplate({...template,timeZone:undefined as unknown as string})).toBe(false);expect(occurrenceDate({...template,frequency:'yearly',interval:365},40000)).toBeNull();});
});

describe('shared Android/Web occurrence fixtures',()=>{it.each(fixtures)('$frequency every $interval',async f=>{const t={...template,frequency:f.frequency as RecurringTemplate['frequency'],interval:f.interval,startDate:f.startDate};expect(f.dates.map((_,i)=>occurrenceDate(t,i))).toEqual(f.dates);expect(occurrenceKey(f.templateId,f.dates[1])).toBe(f.key);expect(await expenseDocumentId(f.key)).toBe(f.expenseId);});});

it('preserves existing UTC transaction date boundaries',()=>{expect(validTemplate({...template,startDate:'2000-01-01',nextDate:'2000-01-01'})).toBe(false);expect(occurrenceDate({...template,startDate:'2099-12-31',timeZone:'America/Los_Angeles'},0)).toBe('2099-12-31');});
