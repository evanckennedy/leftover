"use client";

import {
  startTransition,
  forwardRef,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { toPng } from "html-to-image";
import {
  ArrowDownRight,
  ArrowUpRight,
  Clipboard,
  Check,
  ChevronDown,
  Download,
  FileJson,
  FileImage,
  FileText,
  FileSpreadsheet,
  Pencil,
  Plus,
  RotateCcw,
  Trash2,
  TrendingUp,
  Upload,
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
const SECTION_LABELS: Record<SectionType, string> = {
  income: "Income",
  expenses: "Recurring expenses",
  contributions: "Savings & investments",
};

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
  const sign = amount < 0 ? "-" : "";
  const value = new Intl.NumberFormat("en-US", {
    maximumFractionDigits: compact ? 0 : 2,
    minimumFractionDigits: compact ? 0 : 2,
  }).format(Math.abs(amount));
  return `${sign}$${value}`;
}

function getLocalDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function frequencyLabel(frequency: Frequency) {
  return (
    FREQUENCIES.find((item) => item.value === frequency)?.label ?? frequency
  );
}

function createItem(): RecurringItem {
  return { id: crypto.randomUUID(), name: "", amount: 0, frequency: "monthly" };
}

function csvEscape(value: string | number) {
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function downloadFile(contents: string, filename: string, mimeType: string) {
  const blob = new Blob([contents], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.download = filename;
  link.href = url;
  link.click();
  URL.revokeObjectURL(url);
}

function formatBudgetText(
  budget: Budget,
  totals: {
    annualIncome: number;
    annualExpenses: number;
    annualContributions: number;
    discretionary: number;
  },
) {
  const date = getLocalDateKey();
  const sections = (["income", "expenses", "contributions"] as SectionType[])
    .map((type) => {
      const entries =
        budget[type].length === 0
          ? "  (No entries)"
          : budget[type]
              .map(
                (item) =>
                  `  ${item.name}: ${formatMoney(item.amount)} / ${frequencyLabel(item.frequency)}`,
              )
              .join("\n");
      return `${SECTION_LABELS[type].toUpperCase()}\n${entries}`;
    })
    .join("\n\n");

  return `Leftover Budget - ${date}

${sections}

SUMMARY
  Annual income: ${formatMoney(totals.annualIncome)}
  Recurring expenses: ${formatMoney(totals.annualExpenses)}
  Savings & investments: ${formatMoney(totals.annualContributions)}
  Discretionary: ${formatMoney(totals.discretionary)}
`;
}

function formatBudgetCsv(budget: Budget) {
  const rows = [
    ["Section", "Name", "Amount", "Frequency"],
    ...(["income", "expenses", "contributions"] as SectionType[]).flatMap(
      (type) =>
        budget[type].map((item) => [
          type,
          item.name,
          item.amount,
          item.frequency,
        ]),
    ),
  ];
  return rows.map((row) => row.map(csvEscape).join(",")).join("\r\n");
}

function parseCsvRows(contents: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < contents.length; index += 1) {
    const char = contents[index];
    if (char === '"') {
      if (quoted && contents[index + 1] === '"') {
        field += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === "," && !quoted) {
      row.push(field);
      field = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && contents[index + 1] === "\n") index += 1;
      row.push(field);
      if (row.some((value) => value.length > 0)) rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }
  row.push(field);
  if (row.some((value) => value.length > 0)) rows.push(row);
  return rows;
}

function isFrequency(value: unknown): value is Frequency {
  return (
    value === "weekly" ||
    value === "biweekly" ||
    value === "monthly" ||
    value === "annual"
  );
}

function normalizeItem(value: unknown): RecurringItem | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Partial<RecurringItem>;
  if (
    typeof item.name !== "string" ||
    !item.name.trim() ||
    typeof item.amount !== "number" ||
    !Number.isFinite(item.amount) ||
    item.amount <= 0 ||
    !isFrequency(item.frequency)
  ) {
    return null;
  }
  return {
    id:
      typeof item.id === "string" && item.id
        ? item.id
        : crypto.randomUUID(),
    name: item.name.trim(),
    amount: item.amount,
    frequency: item.frequency,
  };
}

function validateBudget(value: unknown): Budget | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<Budget>;
  const sections: SectionType[] = ["income", "expenses", "contributions"];
  const budget: Budget = { income: [], expenses: [], contributions: [] };

  for (const section of sections) {
    const entries = candidate[section];
    if (!Array.isArray(entries)) return null;
    const normalized: RecurringItem[] = [];
    for (const entry of entries) {
      const item = normalizeItem(entry);
      if (!item) return null;
      normalized.push(item);
    }
    budget[section] = normalized;
  }
  return budget;
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
      empty: "Add your recurring bills and other regular expenses.",
      add: "Add expense",
      tone: "orange",
    },
    contributions: {
      title: "Savings & investments",
      description: "Contributions that build your future.",
      empty: "Add your recurring savings or investment contributions.",
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
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [pendingImport, setPendingImport] = useState<Budget | null>(null);
  const [pendingImportName, setPendingImportName] = useState("");
  const [notice, setNotice] = useState("");
  const importRef = useRef<HTMLInputElement>(null);
  const exportRef = useRef<HTMLDivElement>(null);
  const exportMenuRef = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        setNotice("Could not enable offline app support.");
      });
    }
  }, []);

  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(""), 3200);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  useEffect(() => {
    if (!showExportMenu) return;

    function closeExportMenu(event: PointerEvent) {
      if (
        exportMenuRef.current &&
        !exportMenuRef.current.contains(event.target as Node)
      ) {
        setShowExportMenu(false);
      }
    }

    document.addEventListener("pointerdown", closeExportMenu);
    return () => document.removeEventListener("pointerdown", closeExportMenu);
  }, [showExportMenu]);

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

  function downloadTextSummary() {
    setShowExportMenu(false);
    downloadFile(
      formatBudgetText(budget, totals),
      `leftover-budget-${getLocalDateKey()}.txt`,
      "text/plain;charset=utf-8",
    );
  }

  function downloadCsvSummary() {
    setShowExportMenu(false);
    downloadFile(
      formatBudgetCsv(budget),
      `leftover-budget-${getLocalDateKey()}.csv`,
      "text/csv;charset=utf-8",
    );
  }

  function downloadJsonBackup() {
    setShowExportMenu(false);
    downloadFile(
      JSON.stringify({ version: 1, budget }, null, 2),
      `leftover-backup-${getLocalDateKey()}.json`,
      "application/json;charset=utf-8",
    );
  }

  async function copyTextSummary() {
    setShowExportMenu(false);
    try {
      await navigator.clipboard.writeText(formatBudgetText(budget, totals));
      setNotice("Budget summary copied to your clipboard.");
    } catch {
      setNotice("Could not access the clipboard.");
    }
  }

  async function importBudgetFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setShowExportMenu(false);

    try {
      const contents = await file.text();
      let importedBudget: Budget | null = null;

      if (file.name.toLowerCase().endsWith(".json")) {
        const parsed = JSON.parse(contents) as {
          budget?: unknown;
        };
        importedBudget = validateBudget(parsed.budget ?? parsed);
      } else if (file.name.toLowerCase().endsWith(".csv")) {
        const rows = parseCsvRows(contents);
        if (rows.length < 2) throw new Error("The CSV file has no entries.");
        const headers = rows[0].map((header) => header.trim().toLowerCase());
        const sectionIndex = headers.indexOf("section");
        const nameIndex = headers.indexOf("name");
        const amountIndex = headers.indexOf("amount");
        const frequencyIndex = headers.indexOf("frequency");
        if (
          sectionIndex < 0 ||
          nameIndex < 0 ||
          amountIndex < 0 ||
          frequencyIndex < 0
        ) {
          throw new Error("The CSV headers are not recognized.");
        }

        const candidate: Budget = {
          income: [],
          expenses: [],
          contributions: [],
        };
        for (const row of rows.slice(1)) {
          const section = row[sectionIndex]?.trim();
          if (!["income", "expenses", "contributions"].includes(section)) {
            throw new Error(`Unknown CSV section: ${section || "(empty)"}.`);
          }
          const frequency = row[frequencyIndex]?.trim();
          if (!isFrequency(frequency)) {
            throw new Error(`Unknown frequency: ${frequency || "(empty)"}.`);
          }
          const amount = Number(row[amountIndex]);
          const item = normalizeItem({
            name: row[nameIndex],
            amount,
            frequency,
          });
          if (!item) throw new Error("A CSV entry has invalid data.");
          candidate[section as SectionType].push(item);
        }
        importedBudget = validateBudget(candidate);
      } else {
        throw new Error("Choose a .json or .csv file.");
      }

      if (!importedBudget) throw new Error("The file contains invalid budget data.");
      setPendingImport(importedBudget);
      setPendingImportName(file.name);
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : "Could not import that file.",
      );
    }
  }

  function confirmImport() {
    if (!pendingImport) return;
    setBudget(pendingImport);
    setPendingImport(null);
    setPendingImportName("");
    setNotice("Budget imported successfully.");
  }

  function printSummary() {
    setShowExportMenu(false);
    window.print();
  }

  async function downloadSummaryImage() {
    const exportNode = exportRef.current;
    if (!exportNode) return;
    setShowExportMenu(false);
    try {
      await document.fonts.ready;
      const dataUrl = await toPng(exportNode, {
        backgroundColor: "#111412",
        cacheBust: true,
        height: exportNode.scrollHeight,
        pixelRatio: 2,
        style: {
          left: "auto",
          position: "static",
          top: "auto",
        },
        width: exportNode.scrollWidth,
      });
      const link = document.createElement("a");
      link.download = `leftover-summary-${getLocalDateKey()}.png`;
      link.href = dataUrl;
      link.click();
    } catch {
      setNotice("Could not create the PNG summary. Please try again.");
    }
  }

  return (
    <main className="min-h-screen overflow-hidden bg-[#111412] text-[#f2f4ef]">
      <div className="app-shell mx-auto max-w-7xl px-5 py-7 sm:px-8 sm:py-10 lg:px-12">
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
          <div className="flex items-center gap-2">
            <button
              className="icon-button"
              onClick={() => importRef.current?.click()}
              title="Import CSV or JSON"
              aria-label="Import CSV or JSON"
            >
              <Upload size={17} />
            </button>
            <div className="relative" ref={exportMenuRef}>
              <button
                className="icon-button"
                onClick={() => setShowExportMenu((current) => !current)}
                title="Export budget summary"
                aria-label="Export budget summary"
                aria-expanded={showExportMenu}
              >
                <Download size={17} />
              </button>
              {showExportMenu && (
                <div className="export-menu" role="menu">
                  <button
                    className="export-menu-item"
                    onClick={printSummary}
                    role="menuitem"
                  >
                    <FileText size={16} />
                    <span>
                      <strong>Print / save PDF</strong>
                      <small>Open your browser print dialog</small>
                    </span>
                  </button>
                  <button
                    className="export-menu-item"
                    onClick={downloadSummaryImage}
                    role="menuitem"
                  >
                    <FileImage size={16} />
                    <span>
                      <strong>Download image</strong>
                      <small>Save a visual PNG summary</small>
                    </span>
                  </button>
                  <button
                    className="export-menu-item"
                    onClick={downloadTextSummary}
                    role="menuitem"
                  >
                    <FileText size={16} />
                    <span>
                      <strong>Download text</strong>
                      <small>Save all entries as a notes-friendly TXT file</small>
                    </span>
                  </button>
                  <button
                    className="export-menu-item"
                    onClick={copyTextSummary}
                    role="menuitem"
                  >
                    <Clipboard size={16} />
                    <span>
                      <strong>Copy text</strong>
                      <small>Copy the budget summary to your clipboard</small>
                    </span>
                  </button>
                  <button
                    className="export-menu-item"
                    onClick={downloadCsvSummary}
                    role="menuitem"
                  >
                    <FileSpreadsheet size={16} />
                    <span>
                      <strong>Download CSV</strong>
                      <small>Open entries in a spreadsheet</small>
                    </span>
                  </button>
                  <button
                    className="export-menu-item"
                    onClick={downloadJsonBackup}
                    role="menuitem"
                  >
                    <FileJson size={16} />
                    <span>
                      <strong>Download JSON backup</strong>
                      <small>Save a complete data backup</small>
                    </span>
                  </button>
                </div>
              )}
            </div>
            <button
              className="icon-button"
              onClick={() => setShowReset(true)}
              title="Reset all budget data"
              aria-label="Reset all budget data"
            >
              <RotateCcw size={17} />
            </button>
          </div>
        </header>

        <input
          ref={importRef}
          className="hidden"
          type="file"
          accept=".csv,.json,text/csv,application/json"
          onChange={importBudgetFile}
        />

        {notice && (
          <div
            className="mb-4 rounded-xl border border-[#3a4a3d] bg-[#182019] px-4 py-3 text-sm text-[#d5dfd2]"
            role="status"
          >
            {notice}
          </div>
        )}

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

      <ExportSummary
        ref={exportRef}
        budget={budget}
        totals={totals}
        periods={periods}
      />

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
      {pendingImport && (
        <ImportDialog
          fileName={pendingImportName}
          onClose={() => {
            setPendingImport(null);
            setPendingImportName("");
          }}
          onConfirm={confirmImport}
        />
      )}
    </main>
  );
}

const ExportSummary = forwardRef<
  HTMLDivElement,
  {
    budget: Budget;
    totals: {
      annualIncome: number;
      annualExpenses: number;
      annualContributions: number;
      discretionary: number;
    };
    periods: readonly (readonly [string, number])[];
  }
>(({ budget, totals, periods }, ref) => (
  <div ref={ref} className="export-sheet" aria-hidden="true">
    <div className="export-header">
      <div>
        <p className="export-kicker">Leftover</p>
        <p className="export-muted">Your spending room</p>
      </div>
      <p className="export-muted">
        Budget summary
      </p>
    </div>
    <div className="export-hero">
      <p className="export-muted">Estimated discretionary money</p>
      <p
        className={`export-hero-amount ${totals.discretionary < 0 ? "negative" : ""}`}
      >
        {formatMoney(totals.discretionary / 52, true)} <span>per week</span>
      </p>
      <div className="export-periods">
        {periods.map(([label, amount]) => (
          <div key={label}>
            <p>{label}</p>
            <strong>{formatMoney(amount, true)}</strong>
          </div>
        ))}
      </div>
    </div>
    <div className="export-breakdown">
      <h2>Annual overview</h2>
      <div className="export-breakdown-grid">
        <ExportMetric label="Total income" amount={totals.annualIncome} />
        <ExportMetric
          label="Recurring expenses"
          amount={totals.annualExpenses}
        />
        <ExportMetric
          label="Savings & investments"
          amount={totals.annualContributions}
        />
        <ExportMetric
          label="Discretionary"
          amount={totals.discretionary}
          negative={totals.discretionary < 0}
        />
      </div>
    </div>
    <div className="export-items">
      <ExportItemGroup title="Income" items={budget.income} />
      <ExportItemGroup title="Recurring expenses" items={budget.expenses} />
      <ExportItemGroup
        title="Savings & investments"
        items={budget.contributions}
      />
    </div>
    <p className="export-footer">
      Generated locally by Leftover. Your budget data stays in this browser.
    </p>
  </div>
));

ExportSummary.displayName = "ExportSummary";

function ExportMetric({
  label,
  amount,
  negative = false,
}: {
  label: string;
  amount: number;
  negative?: boolean;
}) {
  return (
    <div>
      <p>{label}</p>
      <strong className={negative ? "negative" : ""}>
        {formatMoney(amount)}
      </strong>
    </div>
  );
}

function ExportItemGroup({
  title,
  items,
}: {
  title: string;
  items: RecurringItem[];
}) {
  return (
    <section>
      <h3>{title}</h3>
      {items.length === 0 ? (
        <p className="export-empty">No entries</p>
      ) : (
        items.map((item) => (
          <div className="export-item" key={item.id}>
            <span>
              {item.name}
              <small>{frequencyLabel(item.frequency)}</small>
            </span>
            <strong>{formatMoney(item.amount)}</strong>
          </div>
        ))
      )}
    </section>
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

function ImportDialog({
  fileName,
  onClose,
  onConfirm,
}: {
  fileName: string;
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
        aria-labelledby="import-title"
      >
        <div className="mb-5 grid size-10 place-items-center rounded-xl bg-[#263725] text-[#c6f26d]">
          <Upload size={19} />
        </div>
        <h2 id="import-title" className="text-xl font-semibold">
          Import budget data?
        </h2>
        <p className="mt-2 text-sm leading-6 text-[#96a197]">
          <strong className="font-semibold text-[#d5dfd2]">{fileName}</strong>{" "}
          will replace the income, expenses, and savings entries currently saved
          in this browser.
        </p>
        <div className="mt-8 flex justify-end gap-3">
          <button className="secondary-button" onClick={onClose}>
            Cancel
          </button>
          <button className="primary-button" onClick={onConfirm}>
            Import budget
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
