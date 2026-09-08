"use client";

import { startTransition, useEffect, useMemo, useState } from "react";
import {
  ArrowDownRight,
  ArrowUpRight,
  Check,
  ChevronDown,
  CircleDollarSign,
  Pencil,
  Plus,
  RotateCcw,
  Trash2,
  TrendingUp,
  Wallet,
  X,
} from "lucide-react";

type Frequency = "weekly" | "biweekly" | "monthly" | "annual";
type SectionType = "income" | "expenses" | "contributions";
type EditorMode = "add" | "edit";

type RecurringItem = {
  id: string;
  name: string;
  amount: number;
  frequency: Frequency;
};

type Budget = {
  income: RecurringItem[];
  expenses: RecurringItem[];
  contributions: RecurringItem[];
};

const STORAGE_KEY = "leftover-budget";
const FREQUENCIES: { value: Frequency; label: string }[] = [
  { value: "weekly", label: "Weekly" },
  { value: "biweekly", label: "Every 2 weeks" },
  { value: "monthly", label: "Monthly" },
  { value: "annual", label: "Annually" },
];
const emptyBudget: Budget = { income: [], expenses: [], contributions: [] };

const frequencyMultiplier: Record<Frequency, number> = {
  weekly: 52,
  biweekly: 26,
  monthly: 12,
  annual: 1,
};

function annualize(item: RecurringItem) {
  return item.amount * frequencyMultiplier[item.frequency];
}

function formatMoney(amount: number, compact = false) {
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
    maximumFractionDigits: compact ? 0 : 2,
  }).format(amount);
}

function frequencyLabel(frequency: Frequency) {
  return (
    FREQUENCIES.find((item) => item.value === frequency)?.label ?? frequency
  );
}

function createItem(): RecurringItem {
  return { id: crypto.randomUUID(), name: "", amount: 0, frequency: "monthly" };
}

function getSectionConfig(type: SectionType) {
  return {
    income: {
      title: "Income",
      description: "Money that comes in on a regular schedule.",
      empty: "Add your paycheque or any other recurring income.",
      add: "Add income",
      tone: "green",
    },
    expenses: {
      title: "Recurring expenses",
      description: "The bills and commitments you can count on.",
      empty: "Add rent, subscriptions, bills, and other essentials.",
      add: "Add expense",
      tone: "orange",
    },
    contributions: {
      title: "Savings & investments",
      description: "Contributions that build your future.",
      empty: "Add TFSA contributions, Bitcoin purchases, or other savings.",
      add: "Add contribution",
      tone: "blue",
    },
  }[type];
}

export default function Home() {
  const [budget, setBudget] = useState<Budget>(emptyBudget);
  const [isReady, setIsReady] = useState(false);
  const [activeEditor, setActiveEditor] = useState<SectionType | null>(null);
  const [editingItem, setEditingItem] = useState<RecurringItem | null>(null);
  const [editorMode, setEditorMode] = useState<EditorMode | null>(null);
  const [showReset, setShowReset] = useState(false);

  useEffect(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        startTransition(() => setBudget(JSON.parse(saved) as Budget));
      } catch {
        window.localStorage.removeItem(STORAGE_KEY);
      }
    }
    startTransition(() => setIsReady(true));
  }, []);

  useEffect(() => {
    if (isReady)
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(budget));
  }, [budget, isReady]);

  const totals = useMemo(() => {
    const annualIncome = budget.income.reduce(
      (total, item) => total + annualize(item),
      0,
    );
    const annualExpenses = budget.expenses.reduce(
      (total, item) => total + annualize(item),
      0,
    );
    const annualContributions = budget.contributions.reduce(
      (total, item) => total + annualize(item),
      0,
    );
    const discretionary = annualIncome - annualExpenses - annualContributions;
    return { annualIncome, annualExpenses, annualContributions, discretionary };
  }, [budget]);

  const periods = [
    ["Per day", totals.discretionary / 365],
    ["Per week", totals.discretionary / 52],
    ["Every 2 weeks", totals.discretionary / 26],
    ["Per month", totals.discretionary / 12],
    ["Per year", totals.discretionary],
  ] as const;

  function openAdd(type: SectionType) {
    setActiveEditor(type);
    setEditingItem(createItem());
    setEditorMode("add");
  }

  function openEdit(type: SectionType, item: RecurringItem) {
    setActiveEditor(type);
    setEditingItem(item);
    setEditorMode("edit");
  }

  function saveItem() {
    if (
      !activeEditor ||
      !editingItem ||
      !editingItem.name.trim() ||
      editingItem.amount <= 0
    )
      return;
    setBudget((current) => ({
      ...current,
      [activeEditor]: current[activeEditor].some(
        (item) => item.id === editingItem.id,
      )
        ? current[activeEditor].map((item) =>
            item.id === editingItem.id
              ? { ...editingItem, name: editingItem.name.trim() }
              : item,
          )
        : [
            ...current[activeEditor],
            { ...editingItem, name: editingItem.name.trim() },
          ],
    }));
    setActiveEditor(null);
    setEditingItem(null);
    setEditorMode(null);
  }

  function deleteItem(type: SectionType, id: string) {
    setBudget((current) => ({
      ...current,
      [type]: current[type].filter((item) => item.id !== id),
    }));
  }

  function resetBudget() {
    setBudget(emptyBudget);
    setShowReset(false);
  }

  return (
    <main className="min-h-screen overflow-hidden bg-[#111412] text-[#f2f4ef]">
      <div className="mx-auto max-w-7xl px-5 py-7 sm:px-8 sm:py-10 lg:px-12">
        <header className="mb-10 flex items-center justify-between sm:mb-14">
          <div className="flex items-center gap-3">
            <div className="grid size-10 place-items-center rounded-xl bg-[#c6f26d] text-[#162016] shadow-[0_0_30px_rgba(198,242,109,0.12)]">
              <Wallet size={21} strokeWidth={2.3} />
            </div>
            <div>
              <p className="text-[17px] font-semibold tracking-[-0.03em]">
                Leftover
              </p>
              <p className="text-[11px] uppercase tracking-[0.18em] text-[#8d9890]">
                Your spending room
              </p>
            </div>
          </div>
          <button
            className="icon-button"
            onClick={() => setShowReset(true)}
            title="Reset all budget data"
            aria-label="Reset all budget data"
          >
            <RotateCcw size={17} />
          </button>
        </header>

        <section className="relative mb-10 overflow-hidden rounded-3xl border border-[#304036] bg-[#182019] px-6 py-8 sm:px-10 sm:py-10">
          <div className="absolute -right-20 -top-24 size-72 rounded-full border-28 border-[#283a2a]/50" />
          <div className="relative">
            <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="mb-2 text-sm font-medium text-[#aab8a8]">
                  Your estimated spending room
                </p>
                <h1
                  className={`money-display ${totals.discretionary < 0 ? "text-[#ff9b82]" : "text-[#d4f58b]"}`}
                >
                  {formatMoney(totals.discretionary / 52, true)}
                  <span className="ml-2 text-base font-medium tracking-normal text-[#9eaa9f]">
                    per week
                  </span>
                </h1>
                <p className="mt-3 max-w-md text-sm leading-6 text-[#89958a]">
                  {totals.discretionary < 0
                    ? "Your recurring commitments are above your income."
                    : "Available for the things that make life a little more yours."}
                </p>
              </div>
              <div className="flex items-center gap-2 rounded-full border border-[#40513e] bg-[#202d21] px-3 py-1.5 text-xs text-[#b6c7ad]">
                <CircleDollarSign size={14} className="text-[#c6f26d]" /> CAD
                estimates
              </div>
            </div>
            <div className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-[#304036] bg-[#304036] sm:grid-cols-5">
              {periods.map(([label, amount], index) => (
                <div
                  key={label}
                  className={`bg-[#1b271d] px-4 py-4 ${index === 1 ? "sm:bg-[#253624]" : ""}`}
                >
                  <p className="mb-1 text-xs text-[#849185]">{label}</p>
                  <p
                    className={`text-[15px] font-semibold ${amount < 0 ? "text-[#ff9b82]" : "text-[#eef4e7]"}`}
                  >
                    {formatMoney(amount, true)}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mb-12">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <p className="eyebrow">Annual overview</p>
              <h2 className="section-heading">The bigger picture</h2>
            </div>
            <TrendingUp size={22} className="hidden text-[#c6f26d] sm:block" />
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <SummaryCard
              label="Total income"
              amount={totals.annualIncome}
              icon={<ArrowUpRight size={17} />}
              tone="green"
            />
            <SummaryCard
              label="Recurring expenses"
              amount={totals.annualExpenses}
              icon={<ArrowDownRight size={17} />}
              tone="orange"
            />
            <SummaryCard
              label="Savings & investments"
              amount={totals.annualContributions}
              icon={<TrendingUp size={17} />}
              tone="blue"
            />
            <SummaryCard
              label="Discretionary"
              amount={totals.discretionary}
              icon={<Wallet size={17} />}
              tone={totals.discretionary < 0 ? "orange" : "green"}
            />
          </div>
        </section>

        <div className="grid gap-5 lg:grid-cols-3">
          <BudgetSection
            type="income"
            items={budget.income}
            onAdd={openAdd}
            onEdit={openEdit}
            onDelete={deleteItem}
          />
          <BudgetSection
            type="expenses"
            items={budget.expenses}
            onAdd={openAdd}
            onEdit={openEdit}
            onDelete={deleteItem}
          />
          <BudgetSection
            type="contributions"
            items={budget.contributions}
            onAdd={openAdd}
            onEdit={openEdit}
            onDelete={deleteItem}
          />
        </div>

        <footer className="mt-14 border-t border-[#273229] pt-5 text-center text-xs text-[#657166]">
          Everything stays in this browser. Nothing leaves your device.
        </footer>
      </div>

      {activeEditor && editingItem && (
        <EditorDialog
          type={activeEditor}
          item={editingItem}
          onChange={setEditingItem}
          onClose={() => {
            setActiveEditor(null);
            setEditingItem(null);
            setEditorMode(null);
          }}
          onSave={saveItem}
          mode={editorMode ?? "add"}
        />
      )}
      {showReset && (
        <ResetDialog
          onClose={() => setShowReset(false)}
          onConfirm={resetBudget}
        />
      )}
    </main>
  );
}

function SummaryCard({
  label,
  amount,
  icon,
  tone,
}: {
  label: string;
  amount: number;
  icon: React.ReactNode;
  tone: "green" | "orange" | "blue";
}) {
  const colors = {
    green: "text-[#c6f26d] bg-[#263725]",
    orange: "text-[#ffae91] bg-[#3b2c25]",
    blue: "text-[#9bd9d0] bg-[#203735]",
  };
  return (
    <div className="surface p-4">
      <div
        className={`mb-5 grid size-8 place-items-center rounded-lg ${colors[tone]}`}
      >
        {icon}
      </div>
      <p className="mb-1 text-xs text-[#89958a]">{label}</p>
      <p
        className={`text-lg font-semibold tracking-[-0.03em] ${amount < 0 ? "text-[#ff9b82]" : "text-[#edf3e8]"}`}
      >
        {formatMoney(amount)}
      </p>
    </div>
  );
}

function BudgetSection({
  type,
  items,
  onAdd,
  onEdit,
  onDelete,
}: {
  type: SectionType;
  items: RecurringItem[];
  onAdd: (type: SectionType) => void;
  onEdit: (type: SectionType, item: RecurringItem) => void;
  onDelete: (type: SectionType, id: string) => void;
}) {
  const config = getSectionConfig(type);
  return (
    <section className="surface flex min-h-72.5 flex-col p-5 sm:p-6">
      <div className="mb-5 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-[17px] font-semibold tracking-[-0.02em]">
            {config.title}
          </h2>
          <p className="mt-1 text-xs leading-5 text-[#89958a]">
            {config.description}
          </p>
        </div>
        <div className={`section-mark ${config.tone}`}>
          <span />
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-2">
        {items.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center rounded-xl border border-dashed border-[#354238] px-5 py-7 text-center">
            <p className="max-w-52.5 text-xs leading-5 text-[#7e8b80]">
              {config.empty}
            </p>
          </div>
        ) : (
          items.map((item) => (
            <ItemRow
              key={item.id}
              item={item}
              onEdit={() => onEdit(type, item)}
              onDelete={() => onDelete(type, item.id)}
            />
          ))
        )}
      </div>
      <button className="add-button mt-5" onClick={() => onAdd(type)}>
        <Plus size={16} /> {config.add}
      </button>
    </section>
  );
}

function ItemRow({
  item,
  onEdit,
  onDelete,
}: {
  item: RecurringItem;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="group flex items-center gap-3 rounded-xl border border-[#29372c] bg-[#182019] px-3 py-3">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-[#e8eee4]">
          {item.name}
        </p>
        <p className="mt-1 text-[11px] text-[#7e8b80]">
          {frequencyLabel(item.frequency)}
        </p>
      </div>
      <p className="shrink-0 text-sm font-semibold text-[#d5dfd2]">
        {formatMoney(item.amount)}
      </p>
      <div className="flex shrink-0 gap-0.5 opacity-70 transition-opacity group-hover:opacity-100">
        <button
          className="row-action"
          onClick={onEdit}
          title={`Edit ${item.name}`}
          aria-label={`Edit ${item.name}`}
        >
          <Pencil size={14} />
        </button>
        <button
          className="row-action danger"
          onClick={onDelete}
          title={`Delete ${item.name}`}
          aria-label={`Delete ${item.name}`}
        >
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  );
}

function EditorDialog({
  type,
  item,
  mode,
  onChange,
  onClose,
  onSave,
}: {
  type: SectionType;
  item: RecurringItem;
  mode: EditorMode;
  onChange: (item: RecurringItem) => void;
  onClose: () => void;
  onSave: () => void;
}) {
  const config = getSectionConfig(type);
  const isValid = item.name.trim().length > 0 && item.amount > 0;
  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="modal-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="editor-title"
      >
        <div className="mb-6 flex items-start justify-between">
          <div>
            <p className="eyebrow">
              {mode === "edit" ? "Edit item" : "New item"}
            </p>
            <h2 id="editor-title" className="mt-1 text-xl font-semibold">
              {config.title}
            </h2>
          </div>
          <button
            className="icon-button"
            onClick={onClose}
            aria-label="Close dialog"
          >
            <X size={18} />
          </button>
        </div>
        <div className="space-y-4">
          <label className="field-label">
            Name
            <input
              autoFocus
              className="field-input"
              value={item.name}
              onChange={(event) =>
                onChange({ ...item, name: event.target.value })
              }
              placeholder={
                type === "income" ? "e.g. Main paycheque" : "e.g. Rent"
              }
            />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="field-label">
              Amount
              <input
                className="field-input"
                type="number"
                min="0.01"
                step="0.01"
                value={item.amount || ""}
                onChange={(event) =>
                  onChange({ ...item, amount: Number(event.target.value) })
                }
                placeholder="0.00"
              />
            </label>
            <label className="field-label">
              Frequency
              <div className="relative">
                <select
                  className="field-input appearance-none pr-10"
                  value={item.frequency}
                  onChange={(event) =>
                    onChange({
                      ...item,
                      frequency: event.target.value as Frequency,
                    })
                  }
                >
                  {FREQUENCIES.map((frequency) => (
                    <option key={frequency.value} value={frequency.value}>
                      {frequency.label}
                    </option>
                  ))}
                </select>
                <ChevronDown
                  className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[#8b998d]"
                  size={16}
                />
              </div>
            </label>
          </div>
        </div>
        <div className="mt-8 flex justify-end gap-3">
          <button className="secondary-button" onClick={onClose}>
            Cancel
          </button>
          <button
            className="primary-button"
            disabled={!isValid}
            onClick={onSave}
          >
            <Check size={16} /> Save item
          </button>
        </div>
      </div>
    </div>
  );
}

function ResetDialog({
  onClose,
  onConfirm,
}: {
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="modal-panel max-w-md"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="reset-title"
      >
        <div className="mb-5 grid size-10 place-items-center rounded-xl bg-[#3b2c25] text-[#ffae91]">
          <Trash2 size={19} />
        </div>
        <h2 id="reset-title" className="text-xl font-semibold">
          Reset your budget?
        </h2>
        <p className="mt-2 text-sm leading-6 text-[#96a197]">
          This will permanently delete all of your income, expenses, and savings
          entries from this browser.
        </p>
        <div className="mt-8 flex justify-end gap-3">
          <button className="secondary-button" onClick={onClose}>
            Keep my data
          </button>
          <button className="danger-button" onClick={onConfirm}>
            Reset everything
          </button>
        </div>
      </div>
    </div>
  );
}
