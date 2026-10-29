/**
 * Design-QA harness: renders the real Record rows, period selector, category tiles and
 * Insights charts with fixture data, without Firebase. Dev-only, never part of the build
 * (vite builds index.html only).
 *
 *   npx vite --port 5173  →  http://127.0.0.1:5173/qa/harness.html?section=rows&theme=dark&locale=en&currency=EUR&data=heavy
 *
 * section: summary | rows | period | cats | chart | donut | all     data: typical | heavy | edge
 * window.__qa.setTheme('lavender') switches palette live (no reload), for the theme checks.
 */
import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '@/theme/index.css';
import { applyTheme, themePalettes } from '@/theme/tokens';
import { usePreferencesStore } from '@/services/preferencesStore';
import type { Category, Expense } from '@/models/types';
import { RowFor } from './rowShim';
import { TransactionRow } from '@/views/RecordView';
import { CategoryCard } from '@/views/InsightsView';
import { PremiumPeriodSelector, recordPeriodOptions } from '@/components/PeriodSelector';
import { CashFlowChart, CashFlowLegend } from '@/components/CashFlowChart';
import { CategoryLucideIcon } from '@/components/CategoryLucideIcon';
import { FinanceSummaryCard } from '@/components/FinanceSummaryCard';
import { BudgetProgressBar } from '@/components/BudgetProgressBar';
import { colorIntToHex } from '@/utils/currency';
import { useTranslation, type Locale } from '@/i18n';
import { applyCss } from '@/utils/cssVars';

const q = new URLSearchParams(location.search);
const section = q.get('section') ?? 'all';
const data = q.get('data') ?? 'typical';
const locale = (q.get('locale') ?? 'en') as Locale;
const currency = q.get('currency') ?? 'EUR';

usePreferencesStore.setState({ locale, currency });
document.documentElement.lang = locale;
applyTheme(themePalettes[q.get('theme') ?? 'dark'] ?? themePalettes.dark);
(window as unknown as { __qa: unknown }).__qa = {
  setTheme: (name: string) => applyTheme(themePalettes[name]),
  log: [] as string[],
};
const log = (msg: string) => (window as unknown as { __qa: { log: string[] } }).__qa.log.push(msg);

const argb = (hex: number) => hex | 0;
const cat = (id: string, name: string, iconName: string, color: number, transactionType = 'expense'): Category => ({
  id, name, iconName, colorInt: argb(color), transactionType, sortOrder: 0,
});

const CATS: Category[] = data === 'typical'
  ? [
      cat('g', 'Groceries', 'shopping_cart', 0xffe86b5a),
      cat('d', 'Dining', 'restaurant', 0xffd4849a),
      cat('t', 'Transport', 'car', 0xff6a9fd4),
      cat('b', 'Bills', 'bolt', 0xff9a8fd4),
      cat('s', 'Shopping', 'shopping_bag', 0xffe8a060),
      cat('sal', 'Salary', 'credit_card', 0xff5cb88a, 'income'),
      cat('tr', 'Transfer', 'swap_horiz', 0xff8e8e96, 'transfer'),
    ]
  : [
      cat('g1', 'Lebensmittel – Discounter', 'shopping_cart', 0xffe86b5a),
      cat('g2', 'Lebensmittel – Biomarkt', 'shopping_cart', 0xffe8a060),
      cat('g3', 'Lebensmittel – Wochenmarkt', 'shopping_cart', 0xffd4849a),
      cat('h', 'Haushaltsversicherung und Nebenkosten der Wohnung', 'home', 0xff6a9fd4),
      cat('c', 'Auto', 'car', 0xff9a8fd4),
      cat('ab', 'Abonnements', 'subscriptions', 0xff5ab8aa),
      cat('ge', 'Gesundheit', 'favorite', 0xffd46a6a),
      cat('w', 'Weiterbildung', 'school', 0xff8fb35a),
      cat('gs', 'Geschenke', 'card_giftcard', 0xffc78fd4),
      cat('r', 'Reisen', 'flight', 0xff5a8fd4),
      cat('IK', 'IKEA', 'home', 0xffb8a060),
      cat('sal', 'Immobilienverkauf', 'home', 0xff6ad4a0, 'income'),
      cat('tr', 'Umbuchung Sparkonto', 'swap_horiz', 0xff8e8e96, 'transfer'),
    ];

const exp = (id: string, amount: number, categoryId: string, transactionType: Expense['transactionType'], note = ''): Expense => ({
  id, amount, categoryId, transactionType, note, dateMillis: Date.UTC(2026, 9, 28, 12),
});

const ROWS: Expense[] = data === 'typical'
  ? [
      exp('1', 62.4, 'g', 'expense', 'Weekly groceries'),
      exp('2', 154.5, 'd', 'expense', 'Dinner with friends'),
      exp('3', 3000, 'sal', 'income', 'Monthly salary'),
      exp('4', 250, 'tr', 'transfer', ''),
      exp('5', 9.99, 's', 'expense', ''),
    ]
  : [
      exp('1', 0.01, 'g1', 'expense', 'Testbetrag'),
      exp('2', 999.99, 'g2', 'expense', 'Sehr lange Notiz, um zu prüfen, ob die Zeile auf schmalen Geräten sauber abgeschnitten wird'),
      exp('3', 123456.78, 'h', 'expense', 'Nebenkostennachzahlung'),
      exp('4', 1234567.89, 'sal', 'income', 'Grosser Betrag'),
      exp('5', 1234.56, 'tr', 'transfer', ''),
      exp('6', 0, 'IK', 'expense', 'Nullbetrag'),
    ];

const TRENDS: Record<string, { label: string; income: number; expense: number }[]> = {
  typical: ['May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct'].map((label, i) => ({
    label, income: 3000 + (i % 2) * 450, expense: 1450 + i * 180,
  })),
  heavy: ['Mai 2026', 'Juni 2026', 'Juli 2026', 'Aug. 2026', 'Sept. 2026', 'Okt. 2026'].map((label, i) => ({
    label, income: i === 5 ? 1_240_000 + 5432.1 : 5432.1, expense: 4100 + i * 2600 + (i === 5 ? 128000 : 0),
  })),
  edge: [{ label: 'Oct', income: 0, expense: 0 }],
};

function Rows() {
  return (
    <div className="transaction-list-bare txn-sections">
      <section className="transaction-list-bare__section">
        <div className="transaction-list-bare__rows flex flex-col">
          {ROWS.map((e) => (
            <div key={e.id} className="txn-row-wrap">
              <RowFor
                label={`${CATS.find((c) => c.id === e.categoryId)?.name}, ${e.amount}`}
                onEdit={() => log(`edit ${e.id}`)}
                onDuplicate={() => log(`duplicate ${e.id}`)}
                onDelete={() => log(`delete ${e.id}`)}
              >
                <TransactionRow expense={e} category={CATS.find((c) => c.id === e.categoryId)} currency={currency} />
              </RowFor>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function Period() {
  const { t } = useTranslation();
  const options = recordPeriodOptions(locale === 'de' ? 'de-DE' : 'en-US', t);
  const [selected, setSelected] = useState(options[0]);
  return (
    <div className="record-filters">
      <PremiumPeriodSelector
        options={options}
        selected={selected}
        labelFor={(o) => o.label}
        isSelected={(a, b) => a.key === b.key}
        onSelected={(o) => { setSelected(o); log(`period ${o.key}`); }}
      />
      <button type="button" className="btn">after</button>
    </div>
  );
}

function Tile({ c, selected, onPick }: { c: Category; selected: boolean; onPick: () => void }) {
  return (
    <button
      type="button"
      className={`add-txn__cat${selected ? ' add-txn__cat--selected' : ''}`}
      aria-pressed={selected}
      title={c.name}
      onClick={onPick}
    >
      {selected && q.get('before') === null ? (
        <span className="add-txn__cat-check" aria-hidden>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M20 6 9 17l-5-5" /></svg>
        </span>
      ) : null}
      <span ref={(el) => applyCss(el, { '--cat-color': colorIntToHex(c.colorInt) })} className="add-txn__cat-icon">
        <CategoryLucideIcon iconName={c.iconName} size={22} />
      </span>
      <span className="add-txn__cat-name">{c.name}</span>
    </button>
  );
}

function Cats() {
  const expenseCats = CATS.filter((c) => c.transactionType === 'expense');
  const [sel, setSel] = useState(expenseCats[1]?.id);
  return (
    <div className="add-txn">
      <div className="field">
        <div className="field__label">category</div>
        <div className="add-txn__cats" role="group">
          {expenseCats.map((c) => (
            <Tile key={c.id} c={c} selected={sel === c.id} onPick={() => setSel(c.id)} />
          ))}
        </div>
      </div>
    </div>
  );
}

function Chart() {
  return (
    <div className="insights-cashflow-card card">
      <div className="insights-cashflow-card__header">
        <div className="insights-cashflow-card__label">cash flow</div>
        <CashFlowLegend />
      </div>
      <CashFlowChart trend={TRENDS[data] ?? TRENDS.typical} currency={currency} />
    </div>
  );
}

function Donut() {
  const map = new Map<string, number>(
    CATS.filter((c) => c.transactionType === 'expense').map((c, i) => [c.id, Math.round((900 / (i + 1)) * 100) / 100]),
  );
  return <CategoryCard title="expenses by category" map={map} categories={CATS} currency={currency} accent="var(--color-expense)" />;
}

function Summary() {
  return (
    <div className="flex flex-col gap-3">
      <FinanceSummaryCard expenses={ROWS} currency={currency} periodLabel={locale === 'de' ? 'Oktober 2026' : 'October 2026'} />
      <BudgetProgressBar spent={ROWS.filter((r) => r.transactionType === 'expense').reduce((s, r) => s + r.amount, 0)} budget={2500} currency={currency} />
    </div>
  );
}

function Harness() {
  const show = (name: string) => section === 'all' || section === name;
  return (
    <main className="qa-harness" ref={(el) => applyCss(el, { padding: '16px', display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: '24px', maxWidth: '760px', margin: '0 auto', boxSizing: 'border-box' })}>
      {show('summary') ? <Summary /> : null}
      {show('period') ? <Period /> : null}
      {show('rows') ? <Rows /> : null}
      {show('cats') ? <Cats /> : null}
      {show('chart') ? <Chart /> : null}
      {show('donut') ? <Donut /> : null}
    </main>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Harness />
  </StrictMode>,
);
