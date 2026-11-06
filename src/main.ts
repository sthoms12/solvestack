import "./style.css";
import {
  escapeMd,
  mergeBackup,
  parsePortableData,
  redactSelection,
  relatedSessions,
  searchSessions,
} from "./domain";
import "./enhancements";
import "./attachment-enhancements";
import "./reuse-enhancement";
import { CURRENT_SCHEMA_VERSION, migrateWorkspace } from "./migrations";
import {
  backupStatus,
  formatStorageEstimate,
  showToast,
  UNDO_WINDOW_MS,
} from "./data-safety";
import { collectFields } from "./dialogs";
import {
  BLUEPRINTS,
  blueprintById,
  parseMethodParam,
  type BlueprintId,
} from "./blueprints";
import { buildPatterns, patternKindLabel } from "./patterns";
import {
  decryptVault,
  encryptVault,
  isVaultEnvelope,
} from "./vault";
import {
  buildAgentPackFiles,
  buildPastePack,
  redactSessionForAgent,
} from "./agent-pack";
import { AGENT_TASKS, agentTaskById, buildAgentPrompt } from "./agent-tasks";
import { aiHandoffById, buildHandoffUrl } from "./ai-handoff";
import { buildRunbook } from "./runbook";
import {
  filterKnowledgeArticles,
  knowledgeSystems,
  knowledgeTags,
} from "./knowledge";
import {
  bytesFromDataUrl,
  canUseOpfs,
  dataUrlFromBlobRef,
  deleteEvidenceBlob,
  putEvidenceBlob,
} from "./opfs-store";

type EntryType =
  | "Note"
  | "Observation"
  | "Action"
  | "Evidence"
  | "Hypothesis"
  | "Result"
  | "Decision"
  | "Resolution";
type TechnicalType =
  | ""
  | "Command"
  | "Command output"
  | "Error"
  | "Log"
  | "Screenshot"
  | "File"
  | "URL/reference";
type SessionStatus = "active" | "resolved";
type Entry = {
  id: string;
  type: EntryType;
  technicalType: TechnicalType;
  content: string;
  timestamp: string;
  starred: boolean;
  attachmentIds: string[];
  createdAt?: string;
  updatedAt?: string;
};
type Hypothesis = {
  id: string;
  text: string;
  status: "Investigating" | "Likely" | "Confirmed" | "Ruled Out";
  reasoning: string;
  evidenceIds: string[];
  result?: string;
  createdAt?: string;
  updatedAt?: string;
};
type Task = {
  id: string;
  text: string;
  completed: boolean;
  createdAt: string;
  completedAt?: string;
};
type Resolution = {
  rootCause: string;
  fix: string;
  validation: string;
  prevention: string;
};
type Session = {
  schemaVersion: number;
  id: string;
  title: string;
  problem: string;
  system: string;
  tags: string[];
  status: SessionStatus;
  createdAt: string;
  updatedAt: string;
  resolvedAt?: string;
  currentFocus: string;
  scratchpad: string;
  entries: Entry[];
  hypotheses: Hypothesis[];
  tasks: Task[];
  resolution: Resolution;
  metadata?: Record<string, unknown>;
};
type Attachment = {
  id: string;
  sessionId: string;
  entryId?: string;
  filename: string;
  mimeType: string;
  size: number;
  createdAt: string;
  description: string;
  /** data: URL when kept inline; empty when body lives in OPFS via blobRef. */
  data: string;
  blobRef?: string;
};
type Store = {
  schemaVersion: number;
  sessions: Session[];
  attachments: Attachment[];
  /** ISO timestamp of the last full backup download; undefined = never. */
  lastBackupAt?: string;
};

const DB = "solvestack";
const STORE = "workspace";
const VERSION = 1;
const uid = (prefix: string) => `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
const now = () => new Date().toISOString();
const dateLabel = (iso: string) =>
  new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));
const escapeHtml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (ch) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;",
      })[ch]!,
  );
const blankResolution = (): Resolution => ({
  rootCause: "",
  fix: "",
  validation: "",
  prevention: "",
});
const SEED_SESSION_ID = "SS-20260818-001";
const seed: Session = {
  schemaVersion: CURRENT_SCHEMA_VERSION,
  id: SEED_SESSION_ID,
  title: "Outbound mail delayed for select users",
  problem:
    "Three users report delayed outbound mail. Determine whether the external gateway or Exchange Online is holding messages.",
  system: "Exchange Online",
  tags: ["mail-flow", "gateway"],
  status: "active",
  createdAt: new Date(Date.now() - 2520000).toISOString(),
  updatedAt: now(),
  currentFocus:
    "Testing whether the external mail gateway is responsible for outbound delivery delays.",
  scratchpad:
    "check connector\nrun message trace\nask networking about gateway queue",
  entries: [
    {
      id: uid("entry"),
      type: "Observation",
      technicalType: "",
      content: "Three users report delayed outbound mail.",
      timestamp: new Date(Date.now() - 2340000).toISOString(),
      starred: false,
      attachmentIds: [],
    },
    {
      id: uid("entry"),
      type: "Action",
      technicalType: "",
      content:
        "Checked Microsoft 365 service health and reviewed connector configuration.",
      timestamp: new Date(Date.now() - 1860000).toISOString(),
      starred: false,
      attachmentIds: [],
    },
    {
      id: uid("entry"),
      type: "Evidence",
      technicalType: "",
      content:
        "No relevant Exchange Online advisories. Connector configuration appears normal.",
      timestamp: new Date(Date.now() - 1320000).toISOString(),
      starred: true,
      attachmentIds: [],
    },
  ],
  hypotheses: [
    {
      id: uid("hyp"),
      text: "Third-party gateway queue backlog",
      status: "Investigating",
      reasoning: "",
      evidenceIds: [],
    },
  ],
  tasks: [
    {
      id: uid("task"),
      text: "Bypass external gateway",
      completed: false,
      createdAt: now(),
    },
    {
      id: uid("task"),
      text: "Test unaffected mailbox",
      completed: false,
      createdAt: now(),
    },
  ],
  resolution: blankResolution(),
};

let store: Store = {
  schemaVersion: CURRENT_SCHEMA_VERSION,
  sessions: [seed],
  attachments: [],
};
let activeId = location.hash.startsWith("#method=")
  ? ""
  : location.hash.slice(1);
let view: "dashboard" | "session" | "settings" | "patterns" | "knowledge" =
  activeId ? "session" : "dashboard";
let search = "";
let knowledgeSearch = "";
let knowledgeSystem = "";
let knowledgeTag = "";
let knowledgeArticleId: string | null = null;
let entryType: EntryType = "Note";
let technicalType: TechnicalType = "";
let savedState = "Loading…";
let storageEstimate: { usage: number; quota: number } | null = null;
let pendingPersistCount = 0;
let persistQueue: Promise<void> = Promise.resolve();
let scratchTimer: ReturnType<typeof setTimeout> | undefined;
let attachmentListenerReady = false;
let swListenerReady = false;
let welcomeDismissed =
  localStorage.getItem("solvestack-welcome-dismissed") === "true";
let pendingMethod: BlueprintId | null = parseMethodParam();
let db: IDBDatabase;
const openDb = () =>
  new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB, VERSION);
    request.onupgradeneeded = () => {
      const d = request.result;
      if (!d.objectStoreNames.contains(STORE)) d.createObjectStore(STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
const storageMessage = (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  return /quota|storage.?full|not.?enough.?space/i.test(message)
    ? "Storage full. Export a backup or remove evidence, then try again."
    : message || "Unknown storage error.";
};
const load = async () => {
  try {
    db = await openDb();
    try {
      await navigator.storage?.persist?.();
    } catch {
      // Persistent storage is best-effort; a refusal must not block loading.
    }
    const tx = db.transaction(STORE, "readonly");
    const raw = await new Promise<Store | undefined>((resolve, reject) => {
      const r = tx.objectStore(STORE).get("data");
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    if (raw?.sessions) {
      store = migrateWorkspace(raw);
      savedState = "Saved locally";
    }
    else await persist();
  } catch (error) {
    savedState = `Storage unavailable: ${storageMessage(error)}`;
  }
  render();
  void refreshStorageEstimate();
  if (pendingMethod) {
    const method = pendingMethod;
    // Defer so bind() has attached the new-session flow.
    setTimeout(() => {
      document
        .querySelector<HTMLElement>(`[data-method="${method}"]`)
        ?.click();
    }, 0);
  }
};
const updateSaveStatus = () => {
  document.querySelectorAll<HTMLElement>(".save-status").forEach((el) => {
    el.innerHTML = `<i></i>${savedState}`;
  });
  document.querySelectorAll<HTMLElement>(".quiet").forEach((el) => {
    el.textContent = savedState;
  });
};
const runPersist = async () => {
  store.schemaVersion = CURRENT_SCHEMA_VERSION;
  savedState = "Saving…";
  updateSaveStatus();
  try {
    if (!db)
      throw Error(
        "IndexedDB is not available. Export or restore a backup after storage is re-enabled.",
      );
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(store, "data");
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () =>
        reject(tx.error || Error("Storage transaction aborted."));
    });
    savedState = "Saved locally";
  } catch (error) {
    savedState = `Save failed: ${storageMessage(error)}`;
  }
  updateSaveStatus();
};
// Serialised writes: concurrent callers queue instead of interleaving
// full-workspace IndexedDB transactions. The save status updates in
// place; persist() no longer re-renders, so typing focus survives a save.
// Callers that changed data render() after awaiting persist().
const persist = () => {
  savedState = "Saving…";
  updateSaveStatus();
  pendingPersistCount += 1;
  const task = persistQueue.then(runPersist);
  persistQueue = task.then(
    () => undefined,
    () => undefined,
  );
  return task.finally(() => {
    pendingPersistCount = Math.max(0, pendingPersistCount - 1);
  });
};
// Scratchpad keystrokes coalesce into one write after the user pauses.
const schedulePersist = () => {
  clearTimeout(scratchTimer);
  scratchTimer = setTimeout(() => void persist(), 500);
};
const refreshStorageEstimate = async () => {
  try {
    const estimate = await navigator.storage?.estimate?.();
    if (!estimate) return;
    storageEstimate = {
      usage: estimate.usage ?? 0,
      quota: estimate.quota ?? 0,
    };
    const meter = formatStorageEstimate(
      storageEstimate.usage,
      storageEstimate.quota,
      store.attachments.reduce((n, a) => n + a.size, 0),
    );
    document
      .querySelectorAll<HTMLElement>("[data-storage-fill]")
      .forEach((bar) => {
        bar.style.width = `${meter.percent}%`;
      });
    document
      .querySelectorAll<HTMLElement>("[data-storage-label]")
      .forEach((el) => {
        el.textContent = meter.label;
      });
  } catch {
    // Quota reporting is best-effort; the fallback meter stays in place.
  }
};
const active = () => store.sessions.find((s) => s.id === activeId);
const statusPill = (status: string) =>
  `<span class="status ${escapeHtml(status)}">${escapeHtml(status)}</span>`;
const icon = (name: string) =>
  (
    ({
      plus: "＋",
      search: "⌕",
      settings: "⚙",
      back: "←",
      star: "★",
      download: "↓",
      upload: "↑",
    }) as Record<string, string>
  )[name] || "";
const download = (name: string, content: BlobPart, type = "text/plain") => {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([content], { type }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 500);
};
const readFile = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
const attachmentFor = (id: string) =>
  store.attachments.find((a) => a.id === id);
async function attachmentDataUrl(attachment: Attachment) {
  if (attachment.data?.startsWith("data:")) return attachment.data;
  if (attachment.blobRef) {
    const fromOpfs = await dataUrlFromBlobRef(
      attachment.blobRef,
      attachment.mimeType,
    );
    if (fromOpfs) return fromOpfs;
  }
  return attachment.data || "";
}

function render() {
  const main =
    view === "dashboard"
      ? dashboard()
      : view === "settings"
        ? settings()
        : view === "patterns"
          ? patternDesk()
          : view === "knowledge"
            ? knowledgeView()
            : workspace();
  document.querySelector<HTMLDivElement>("#app")!.innerHTML =
    `<div class="app-shell"><aside class="rail"><div class="brand"><span class="brand-mark">S</span><div><strong>SolveStack</strong><small>FIELD NOTEBOOK</small></div></div><nav aria-label="Primary navigation"><button class="nav-item ${view === "dashboard" ? "selected" : ""}" data-nav="dashboard" aria-label="Dashboard"><span aria-hidden="true">⌂</span><b>Dashboard</b></button><button class="nav-item ${view === "patterns" ? "selected" : ""}" data-nav="patterns" aria-label="Pattern desk"><span aria-hidden="true">◈</span><b>Patterns</b></button><button class="nav-item ${view === "knowledge" ? "selected" : ""}" data-nav="knowledge" aria-label="Knowledge base"><span aria-hidden="true">▤</span><b>Knowledge</b></button><button class="nav-item ${view === "settings" ? "selected" : ""}" data-nav="settings" aria-label="Settings"><span aria-hidden="true">${icon("settings")}</span><b>Settings</b></button><button class="nav-item" id="open-guide" aria-label="How SolveStack works"><span aria-hidden="true">?</span><b>How it works</b></button><button class="nav-item" id="open-data-guide" aria-label="Ways to use exported troubleshooting data"><span aria-hidden="true">↗</span><b>Use your data</b></button></nav><div class="rail-bottom"><div class="privacy-dot"></div><span>Local only</span><button class="icon-button" id="theme-toggle" aria-label="Toggle theme">◐</button></div></aside><main class="main">${main}</main></div>${guideDialog()}${useDataDialog()}`;
  bind();
}
function sessionCard(s: Session) {
  return `<button class="session-card" data-open="${escapeHtml(s.id)}"><div class="card-top"><span class="session-id">${escapeHtml(s.id)}</span><span class="card-pills">${s.id === SEED_SESSION_ID ? '<span class="status example">Example</span>' : ""}${statusPill(s.status)}</span></div><h3>${escapeHtml(s.title)}</h3><p>${escapeHtml(s.problem)}</p><div class="card-meta"><span>${escapeHtml(s.system || "Unspecified")}</span><span>${s.entries.length} entries</span><span>${dateLabel(s.updatedAt)}</span></div><div class="tags">${s.tags.map((t) => `<span>#${escapeHtml(t)}</span>`).join("")}</div></button>`;
}
function dashboard() {
  const activeSessions = store.sessions.filter((s) => s.status === "active");
  const resolved = store.sessions.filter((s) => s.status === "resolved");
  const realSessions = store.sessions.filter(
    (s) => s.id !== SEED_SESSION_ID,
  );
  const backup = backupStatus(store.lastBackupAt, new Date(), realSessions.length);
  const backupBanner = backup.needsBackup
    ? `<section class="backup-banner" role="status"><span><strong>${escapeHtml(backup.label)}.</strong> Your investigations live only in this browser — clearing site data removes them.</span><button class="secondary small-button" id="backup-now">Back up now</button></section>`
    : "";
  // First-run state (panel up, no real sessions yet): lead with the
  // proposition instead of a greeting that presumes a returning user.
  const firstRun = !welcomeDismissed && realSessions.length === 0;
  const lede = firstRun
    ? "A field notebook for troubleshooting: capture the investigation while it happens — what you observe, try, and rule out — then turn the fix into knowledge you can reuse."
    : "Good morning, engineer. Pick up where the evidence left off.";
  const exampleNote =
    realSessions.length === 0 && activeSessions.length
      ? '<p class="example-note">The session below is a worked example — open it to see how a finished investigation reads.</p>'
      : "";
  return `<header class="topbar"><div><div class="eyebrow">WORKSPACE / OVERVIEW</div><h1>SolveStack</h1><p class="lede">${lede}</p></div><button class="primary" id="new-session">${icon("plus")} New session</button></header>${welcomeDismissed ? "" : welcomePanel()}${backupBanner}<section class="method-strip" aria-label="Investigation methods"><span class="section-kicker">START WITH A METHOD</span><div class="method-chip-row">${BLUEPRINTS.filter((b) => b.kind === "method" && b.id !== "blank").map((b) => `<button class="method-chip" data-method="${b.id}" title="${escapeHtml(b.description)}">${escapeHtml(b.shortLabel)}</button>`).join("")}<button class="method-chip quiet" data-method="blank">Blank</button></div></section><section class="method-strip" aria-label="Incident templates"><span class="section-kicker">START FROM AN INCIDENT</span><div class="method-chip-row">${BLUEPRINTS.filter((b) => b.kind === "incident").map((b) => `<button class="method-chip" data-method="${b.id}" title="${escapeHtml(b.description)}">${escapeHtml(b.shortLabel)}</button>`).join("")}</div></section><section class="dashboard-grid"><div class="main-column"><div class="section-heading"><div><span class="section-kicker">IN FLIGHT</span><h2>Active sessions <em>${String(activeSessions.length).padStart(2, "0")}</em></h2></div><span class="quiet">${savedState}</span></div>${exampleNote}<div class="session-list">${activeSessions.length ? activeSessions.map(sessionCard).join("") : '<div class="empty"><span>◎</span><h3>No active investigations</h3><p>Start a session when the next problem appears.</p></div>'}</div><div class="section-heading resolved-heading"><div><span class="section-kicker">THE LIBRARY</span><h2>Recently resolved <em>${String(resolved.length).padStart(2, "0")}</em></h2></div></div><div class="session-list compact">${resolved.length ? resolved.slice(0, 6).map(sessionCard).join("") : '<div class="empty small"><p>Resolved investigations become reusable knowledge here.</p></div>'}</div></div><aside class="dashboard-side"><div class="search-panel"><span class="section-kicker">FIND AN INVESTIGATION</span><div class="search-input"><span>${icon("search")}</span><input id="search" value="${escapeHtml(search)}" placeholder="Search sessions, evidence, root causes…" /></div><div id="search-results">${search ? searchResults() : '<p class="search-hint">Search titles, systems, tags, entries, hypotheses, and resolutions.</p>'}</div></div><div class="principle"><span class="section-kicker">THE SOLVESTACK PRINCIPLE</span><p>Messy work becomes durable knowledge.</p><small>Stored in this browser. Export when you want to move it.</small></div></aside></section>`;
}
function patternDesk() {
  const patterns = buildPatterns(store.sessions);
  const grouped = (
    ["system", "tag", "root-cause", "ruled-out", "technical-type"] as const
  )
    .map((kind) => ({
      kind,
      label: patternKindLabel(kind),
      cards: patterns.filter((card) => card.kind === kind),
    }))
    .filter((group) => group.cards.length);
  return `<header class="topbar"><div><div class="eyebrow">WORKSPACE / PATTERN DESK</div><h1>Local pattern intelligence.</h1><p class="lede">Recurring systems, tags, root causes, and ruled-outs — computed on this device. No upload. No model.</p></div><button class="secondary" id="new-session">${icon("plus")} New session</button></header><section class="pattern-desk">${
    grouped.length
      ? grouped
          .map(
            (group) =>
              `<div class="pattern-group"><span class="section-kicker">${escapeHtml(group.label)}</span><div class="pattern-grid">${group.cards
                .map(
                  (card) =>
                    `<article class="pattern-card"><div class="pattern-top"><strong>${escapeHtml(card.label)}</strong><em>${card.count}</em></div><p>${escapeHtml(card.hint)}</p><small>${card.sampleTitles.map(escapeHtml).join(" · ")}</small><div class="button-row">${card.sessionIds
                      .slice(0, 4)
                      .map(
                        (id) =>
                          `<button class="text-button" data-open="${escapeHtml(id)}">Open ${escapeHtml(id)}</button>`,
                      )
                      .join("")}</div></article>`,
                )
                .join("")}</div></div>`,
          )
          .join("")
      : `<div class="empty"><span>◈</span><h3>Not enough history yet</h3><p>Patterns appear after at least two investigations share a system, tag, root cause, or ruled-out theory.</p></div>`
  }</section>`;
}
function knowledgeView() {
  if (knowledgeArticleId) {
    const s = store.sessions.find((x) => x.id === knowledgeArticleId);
    if (s && s.status === "resolved") return knowledgeArticleView(s);
    knowledgeArticleId = null;
  }
  const resolvedCount = store.sessions.filter(
    (s) => s.status === "resolved",
  ).length;
  const articles = filterKnowledgeArticles(store.sessions, {
    query: knowledgeSearch,
    system: knowledgeSystem,
    tag: knowledgeTag,
  });
  const systems = knowledgeSystems(store.sessions);
  const tags = knowledgeTags(store.sessions);
  const controls =
    resolvedCount > 0
      ? `<div class="knowledge-controls"><div class="search-input"><span>${icon("search")}</span><input id="knowledge-search" value="${escapeHtml(knowledgeSearch)}" placeholder="Search root causes, systems, entries…" /></div><select id="knowledge-system" aria-label="Filter by system"><option value="">All systems</option>${systems.map((system) => `<option value="${escapeHtml(system)}" ${system === knowledgeSystem ? "selected" : ""}>${escapeHtml(system)}</option>`).join("")}</select></div>${tags.length ? `<div class="tag-filter-row"><button class="method-chip ${knowledgeTag ? "quiet" : "selected"}" data-kb-tag="">All tags</button>${tags.map((tag) => `<button class="method-chip ${tag === knowledgeTag ? "selected" : "quiet"}" data-kb-tag="${escapeHtml(tag)}">#${escapeHtml(tag)}</button>`).join("")}</div>` : ""}`
      : "";
  const body =
    resolvedCount === 0
      ? `<div class="empty"><span>▤</span><h3>No resolved sessions yet</h3><p>When you resolve an investigation, it becomes an article here.</p></div>`
      : articles.length
        ? `<div class="article-grid">${articles.map((a) => `<button class="session-card" data-article="${escapeHtml(a.id)}"><div class="card-top"><span class="session-id">${escapeHtml(a.id)}</span><span>${dateLabel(a.resolvedAt)}</span></div><h3>${escapeHtml(a.title)}</h3><p>${escapeHtml(a.rootCause || "Root cause not recorded")}</p><div class="card-meta"><span>${escapeHtml(a.system || "Unspecified")}</span><span>${a.entryCount} entries</span></div><div class="tags">${a.tags.map((t) => `<span>#${escapeHtml(t)}</span>`).join("")}</div></button>`).join("")}</div>`
        : `<div class="empty"><span>▤</span><h3>Nothing matches those filters</h3><p>Clear the search or filters to see the whole library.</p></div>`;
  return `<header class="topbar"><div><div class="eyebrow">WORKSPACE / KNOWLEDGE</div><h1>What you've already solved.</h1><p class="lede">Resolved investigations, kept as searchable knowledge — computed on this device. Nothing uploaded.</p></div></header>${controls}<section>${body}</section>`;
}
function knowledgeArticleView(s: Session) {
  const para = (label: string, value: string) =>
    `<section class="article-section"><span class="section-kicker">${label}</span><p>${escapeHtml(value || "Not recorded")}</p></section>`;
  const starred = s.entries.filter((e) => e.starred);
  const ruledOut = s.hypotheses.filter((h) => h.status === "Ruled Out");
  const timeline = s.entries
    .slice()
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  const related = relatedSessions(s, store.sessions);
  return `<header class="workspace-header"><button class="back-button" id="kb-back">${icon("back")} Knowledge</button><div class="workspace-actions"><button class="secondary" data-open="${escapeHtml(s.id)}">Open session</button><button class="secondary" id="kb-export-md">${icon("download")} Knowledge MD</button><button class="secondary" id="kb-export-runbook">Runbook MD</button><button class="secondary" id="kb-export-agent" title="Redacted pack for approved AI tools">Agent pack</button></div></header><div class="knowledge-article"><div class="eyebrow">${escapeHtml(s.id)} <span class="slash">/</span> ${escapeHtml(s.system || "GENERAL")} <span class="slash">/</span> RESOLVED ${dateLabel(s.resolvedAt || s.updatedAt)}</div><h1>${escapeHtml(s.title)}</h1><div class="tags">${s.tags.map((t) => `<span>#${escapeHtml(t)}</span>`).join("")}</div>${para("PROBLEM", s.problem)}${starred.length ? `<section class="article-section"><span class="section-kicker">KEY FINDINGS</span><ul>${starred.map((e) => `<li>${escapeHtml(e.content)}</li>`).join("")}</ul></section>` : ""}${para("ROOT CAUSE", s.resolution.rootCause)}${para("RESOLUTION", s.resolution.fix)}${para("VALIDATION", s.resolution.validation)}${para("PREVENTION", s.resolution.prevention)}${ruledOut.length ? `<section class="article-section"><span class="section-kicker">RULED OUT</span><ul>${ruledOut.map((h) => `<li><strong>${escapeHtml(h.text)}</strong>${h.reasoning ? ` — ${escapeHtml(h.reasoning)}` : ""}</li>`).join("")}</ul></section>` : ""}${timeline.length ? `<section class="article-section"><span class="section-kicker">TIMELINE</span><ul>${timeline.map((e) => `<li><time>${dateLabel(e.timestamp)}</time> <strong>${escapeHtml(e.type)}</strong> — ${escapeHtml(e.content)}</li>`).join("")}</ul></section>` : ""}${related.length ? `<section class="article-section"><span class="section-kicker">RELATED INVESTIGATIONS</span><div class="related-list">${related.map(({ session, reasons }) => `<button class="search-result" ${session.status === "resolved" ? `data-article="${escapeHtml(session.id)}"` : `data-open="${escapeHtml(session.id)}"`}><strong>${escapeHtml(session.title)}</strong><small>${reasons.join(" · ")}</small></button>`).join("")}</div></section>` : ""}</div>`;
}
function welcomePanel() {
  return `<section class="welcome-panel" aria-labelledby="welcome-title"><div class="welcome-index" aria-hidden="true">01</div><div><span class="section-kicker">START HERE</span><h2 id="welcome-title">Troubleshooting, written down while it happens.</h2><p>Start a session when something breaks. Capture what you observe, what you try, and what you rule out — when it's fixed, the same session becomes a knowledge article or a runbook for next time. Everything stays in this browser.</p><div class="welcome-actions"><button class="primary" id="welcome-start">Start your first investigation</button><button class="secondary" id="welcome-guide">See how SolveStack works</button></div><small>Free. No account. No cloud database. Export a backup before clearing browser data.</small></div><button class="welcome-dismiss" id="dismiss-welcome" aria-label="Dismiss welcome panel">×</button></section>`;
}
function guideDialog() {
  return `<dialog id="guide-dialog" class="guide-dialog"><form method="dialog"><header><div><span class="section-kicker">FIELD GUIDE / 01–06</span><h2>How SolveStack works</h2><p>Use it when a technical problem involves multiple tests, possible causes, evidence, or decisions worth preserving.</p></div><button class="guide-close" value="close" aria-label="Close guide">×</button></header><ol class="guide-steps"><li><b>Capture</b><span>Start a session as troubleshooting begins. Record observations, commands, errors, screenshots, and references as they happen.</span></li><li><b>Structure</b><span>Label entries by reasoning type so another engineer can follow what you knew and when you knew it.</span></li><li><b>Investigate</b><span>Track hypotheses, next steps, evidence, and the current focus without turning the work into a ticket form.</span></li><li><b>Rule out</b><span>Keep failed theories and explain why they were eliminated. Dead ends are valuable troubleshooting knowledge.</span></li><li><b>Resolve</b><span>Record the root cause, fix, validation, and prevention while the details are still fresh.</span></li><li><b>Reuse</b><span>Export Markdown, HTML, JSON, or a ZIP package. Store the result in your existing knowledge system.</span></li></ol><section class="guide-example"><span class="section-kicker">EXAMPLE INVESTIGATION</span><strong>Exchange Online outbound mail delay</strong><p>Capture affected users, service-health checks, message traces, connector tests, the gateway hypothesis, why other causes were ruled out, and how delivery was validated after the fix.</p></section><footer><p><strong>Built for:</strong> IT engineers, administrators, support specialists, consultants, and technical problem-solvers.</p><p><strong>Not designed as:</strong> a ticketing system, incident-management platform, cloud knowledge base, or AI assistant.</p><button class="secondary" id="guide-to-data" value="close">See what exports can become</button><button class="primary" value="close">Got it</button></footer></form></dialog>`;
}

function useDataDialog() {
  return `<dialog id="data-guide-dialog" class="guide-dialog data-guide-dialog"><form method="dialog"><header><div><span class="section-kicker">FIELD GUIDE / PORTABLE KNOWLEDGE</span><h2>What can your exports become?</h2><p>Move completed investigations into the systems your organization already trusts.</p></div><button class="guide-close" value="close" aria-label="Close use your data guide">×</button></header><div class="data-format-grid"><article><b>Markdown</b><span>Searchable knowledge, documentation, version control, and approved AI review.</span></article><article><b>HTML</b><span>A readable, standalone handoff for another engineer or stakeholder.</span></article><article><b>JSON / vault</b><span>Lossless backup, re-import, or passphrase-encrypted multi-device continuity.</span></article><article><b>ZIP / agent pack</b><span>Full evidence archive, or a redacted pack for approved AI tools.</span></article></div><section class="data-possibilities"><span class="section-kicker">POSSIBILITIES</span><ul><li>Build a searchable troubleshooting library.</li><li>Create knowledge articles, runbooks, and training material.</li><li>Use the Pattern Desk for recurring symptoms and root causes.</li><li>Ask an organization-approved AI tool to review an agent pack or Markdown export.</li></ul></section><section class="guide-guardrail"><strong>Move knowledge deliberately.</strong><p>SolveStack does not upload or analyze exports. Redact credentials, personal data, tenant details, and confidential evidence before sharing. External storage and AI tools have their own privacy and retention policies.</p></section><footer><a class="secondary guide-page-link" href="/use-your-data/">Open the complete possibilities guide</a><a class="secondary guide-page-link" href="/agent-adapter/">Agent adapter</a><button class="primary" value="close">Done</button></footer></form></dialog>`;
}
function searchResults() {
  const found = searchSessions(store.sessions, search).slice(0, 8);
  return found.length
    ? found
        .map(
          ({ session, reasons }) =>
            `<button class="search-result" data-open="${escapeHtml(session.id)}"><strong>${escapeHtml(session.title)}</strong><small>${reasons.join(" · ")}</small></button>`,
        )
        .join("")
    : `<p class="search-hint">No investigations matched “${escapeHtml(search)}”.</p>`;
}
function entryView(e: Entry) {
  const attachments = e.attachmentIds
    .map((id) => attachmentFor(id))
    .filter((item): item is Attachment => Boolean(item));
  const copy = ["Command", "Command output", "Log", "Error"].includes(
    e.technicalType,
  )
    ? `<button data-copy-entry="${escapeHtml(e.id)}" aria-label="Copy ${escapeHtml(e.technicalType)}">Copy</button>`
    : "";
  return `<article class="entry ${e.starred ? "starred" : ""}"><div class="entry-rail"><span class="entry-dot ${escapeHtml(e.type.toLowerCase())}"></span><span class="entry-line"></span></div><div class="entry-body"><div class="entry-meta"><span class="entry-type">${escapeHtml(e.type)}${e.technicalType ? ` · ${escapeHtml(e.technicalType)}` : ""}</span><time>${dateLabel(e.timestamp)}</time><div class="entry-actions">${copy}<button data-edit-entry="${escapeHtml(e.id)}" aria-label="Edit entry">Edit</button><button data-star="${escapeHtml(e.id)}" aria-label="Star entry">${e.starred ? icon("star") : "☆"}</button><button data-delete="${escapeHtml(e.id)}" aria-label="Delete entry">×</button></div></div><pre class="entry-content ${e.technicalType ? "technical" : ""}">${escapeHtml(e.content)}</pre>${attachments.map((a) => `<div class="attachment-line"><span>📎 ${escapeHtml(a.filename)}${a.description ? ` — ${escapeHtml(a.description)}` : ""}</span><button class="attachment-remove" data-remove-attachment="${escapeHtml(a.id)}" aria-label="Remove ${escapeHtml(a.filename)}">Remove evidence</button></div>`).join("")}</div></article>`;
}
function workspace() {
  const s = active();
  if (!s) return dashboard();
  const methodId =
    typeof s.metadata?.blueprint === "string" ? s.metadata.blueprint : "";
  const method = methodId ? blueprintById(methodId) : null;
  return `<header class="workspace-header"><button class="back-button" id="back">${icon("back")} Dashboard</button><div class="workspace-actions"><span class="save-status" role="status" aria-live="polite"><i></i>${savedState}</span><button class="secondary" id="export-md">${icon("download")} Knowledge MD</button><button class="secondary" id="export-rca">RCA MD</button><button class="secondary" id="export-runbook">Runbook MD</button><button class="secondary" id="export-json">JSON</button><button class="secondary" id="export-html">HTML</button><button class="secondary" id="export-package">ZIP</button><button class="secondary" id="export-agent" title="Redacted pack for approved AI tools">Agent pack</button><button class="primary" id="resolve">${s.status === "resolved" ? "Update resolution" : "Resolve session"}</button></div></header><div class="session-title"><div><div class="eyebrow">${escapeHtml(s.id)} <span class="slash">/</span> ${escapeHtml(s.system || "GENERAL")}${method && method.id !== "blank" ? ` <span class="slash">/</span> ${escapeHtml(method.shortLabel)}` : ""}</div><h1>${escapeHtml(s.title)}</h1><p>${escapeHtml(s.problem)}</p><div class="tags">${s.tags.map((t) => `<span>#${escapeHtml(t)}</span>`).join("")}</div></div>${statusPill(s.status)}</div><div class="workspace-grid"><section class="stream-panel"><div class="stream-heading"><div><span class="section-kicker">INVESTIGATION STREAM</span><h2>Your reasoning, in order.</h2></div><span class="entry-count">${s.entries.length} captured</span></div><div class="stream">${
    s.entries
      .slice()
      .sort((a, b) => a.timestamp.localeCompare(b.timestamp))
      .map(entryView)
      .join("") || '<div class="stream-empty">Start with what you know.</div>'
  }</div><div class="quick-capture"><div class="capture-top"><span class="section-kicker">QUICK CAPTURE</span><div class="type-picker">${(["Note", "Observation", "Action", "Evidence", "Hypothesis", "Result", "Decision"] as EntryType[]).map((t) => `<button class="type-chip ${entryType === t ? "active" : ""}" data-type="${t}">${t}</button>`).join("")}</div></div><label class="sr-only" for="capture">Troubleshooting note</label><textarea id="capture" aria-label="Troubleshooting note" placeholder="What did you find or try? (Ctrl/Cmd + Enter to capture)"></textarea><div class="capture-controls"><select id="technical-type" aria-label="Technical content type"><option value="">Reasoning only</option>${["Command", "Command output", "Error", "Log", "Screenshot", "File", "URL/reference"].map((t) => `<option ${technicalType === t ? "selected" : ""}>${t}</option>`).join("")}</select><label class="file-button">Attach evidence<input type="file" id="attach" accept="image/*,.txt,.log,.csv,.json,.md,.pdf" multiple hidden /></label><button class="primary small-button" id="capture-btn">Capture ${icon("plus")}</button></div></div></section><aside class="context-panel">${focusView(s)}${hypothesesView(s)}${tasksView(s)}${scratchpadView(s)}${resolutionView(s)}</aside></div>`;
}
function focusView(s: Session) {
  return `<section class="context-block focus-block"><div class="block-heading"><span class="section-kicker">CURRENT FOCUS</span><button id="edit-focus">Edit</button></div><p>${escapeHtml(s.currentFocus || "Set a focus to keep the investigation pointed.")}</p></section>`;
}
function hypothesesView(s: Session) {
  return `<section class="context-block"><div class="block-heading"><span class="section-kicker">HYPOTHESES <b>${s.hypotheses.length}</b></span><button id="add-hyp" aria-label="Add hypothesis">${icon("plus")}</button></div>${s.hypotheses.map((h) => `<div class="hypothesis"><div class="hyp-top"><span class="hyp-status ${escapeHtml(h.status.toLowerCase().replace(" ", "-"))}"></span><strong>${escapeHtml(h.text)}</strong><select aria-label="Status for ${escapeHtml(h.text)}" data-hyp="${escapeHtml(h.id)}">${["Investigating", "Likely", "Confirmed", "Ruled Out"].map((st) => `<option ${st === h.status ? "selected" : ""}>${st}</option>`).join("")}</select></div>${h.reasoning ? `<p>${escapeHtml(h.reasoning)}</p>` : ""}</div>`).join("")}</section>`;
}
function tasksView(s: Session) {
  return `<section class="context-block"><div class="block-heading"><span class="section-kicker">NEXT STEPS <b>${s.tasks.filter((t) => !t.completed).length}</b></span><button id="add-task" aria-label="Add next step">${icon("plus")}</button></div>${s.tasks.map((t) => `<label class="task ${t.completed ? "done" : ""}"><input type="checkbox" aria-label="${escapeHtml(t.text)}" data-task="${escapeHtml(t.id)}" ${t.completed ? "checked" : ""}/><span>${escapeHtml(t.text)}</span></label>`).join("")}</section>`;
}
function scratchpadView(s: Session) {
  return `<section class="context-block scratch"><div class="block-heading"><span class="section-kicker">SCRATCHPAD</span><span class="autosave">autosaves</span></div><label class="sr-only" for="scratchpad">Scratchpad notes</label><textarea id="scratchpad" aria-label="Scratchpad notes" placeholder="Think out loud…">${escapeHtml(s.scratchpad)}</textarea><div class="button-row"><button class="text-button" id="scratch-to-entry">Convert selection to entry</button><button class="text-button" id="redact-selection">Redact selected text</button></div></section>`;
}
function relatedView(s: Session) {
  const matches = relatedSessions(s, store.sessions);
  return matches.length
    ? `<section class="context-block"><div class="block-heading"><span class="section-kicker">RELATED INVESTIGATIONS</span></div>${matches.map(({ session, reasons }) => `<button class="related-link" data-related="${escapeHtml(session.id)}"><span>${escapeHtml(session.title)}</span><small>${reasons.join(" · ")}</small></button>`).join("")}</section>`
    : "";
}
function reuseDialog() {
  return `<dialog id="reuse-dialog" class="reuse-dialog"><form method="dialog"><span class="section-kicker">USE AS STARTING POINT</span><h2>Choose historical context</h2><p>The original investigation will remain unchanged.</p>${["hypotheses", "actions", "decisions", "tasks"].map((part, index) => `<label class="reuse-option"><input type="checkbox" name="reuse-part" value="${part}" ${index < 3 ? "checked" : ""}> <span>${part[0].toUpperCase() + part.slice(1)}</span></label>`).join("")}<div class="button-row"><button value="cancel" class="secondary">Cancel</button><button type="button" id="confirm-reuse" class="primary">Create follow-up</button></div></form></dialog>`;
}
function resolutionView(s: Session) {
  return s.status === "resolved"
    ? `<section class="context-block resolution-card"><span class="section-kicker">RESOLUTION</span><p><strong>${escapeHtml(s.resolution.rootCause || "Root cause not recorded")}</strong></p><small>${escapeHtml(s.resolution.fix || "Fix not recorded")}</small></section>`
    : "";
}
function settings() {
  const bytes = store.attachments.reduce((n, a) => n + a.size, 0);
  const meter = formatStorageEstimate(
    storageEstimate?.usage,
    storageEstimate?.quota,
    bytes,
  );
  const backup = backupStatus(store.lastBackupAt);
  return `<header class="topbar"><div><div class="eyebrow">WORKSPACE / SETTINGS</div><h1>Data & preferences.</h1><p class="lede">Your troubleshooting data belongs to you.</p></div></header><div class="settings-grid"><section class="settings-card"><span class="section-kicker">LOCAL STORAGE</span><h2>IndexedDB on this device</h2><p>SolveStack stores sessions and evidence in this browser. Clearing site data can remove it.${canUseOpfs() ? " Large evidence files prefer the Origin Private File System when available." : ""}</p><div class="storage-bar"><span data-storage-fill="${meter.percent}"></span></div><small data-storage-label>${escapeHtml(meter.label)}</small><br><small>${store.sessions.length} sessions · ${store.sessions.reduce((n, s) => n + s.entries.length, 0)} entries · ${(bytes / 1024).toFixed(1)} KB evidence</small></section><section class="settings-card"><span class="section-kicker">PORTABILITY</span><h2>Back up or import</h2><p>Import a session export or restore a full backup. Existing records are preserved unless you explicitly approve a conflict.</p><div class="button-row"><button class="secondary" id="backup">${icon("download")} Backup all data</button><button class="secondary" id="restore">${icon("upload")} Import JSON</button><input type="file" id="restore-file" accept="application/json,.json" aria-label="Import SolveStack JSON" hidden /></div><p><small>${escapeHtml(backup.label)}${backup.needsBackup ? " — back up before clearing browser data." : "."}</small></p></section><section class="settings-card"><span class="section-kicker">ENCRYPTED VAULT</span><h2>User-held passphrase sync</h2><p>Export an AES-GCM vault file you can move to another browser or machine. SolveStack never sees the passphrase and does not host the vault.</p><div class="button-row"><button class="secondary" id="vault-export">${icon("download")} Export vault</button><button class="secondary" id="vault-import">${icon("upload")} Import vault</button><input type="file" id="vault-file" accept="application/json,.json" aria-label="Import SolveStack vault" hidden /></div></section><section class="settings-card"><span class="section-kicker">APPEARANCE</span><h2>Calm by default</h2><p>Dark technical workspace is the default. Your preference is saved locally.</p><button class="secondary" id="theme-settings">Toggle light / dark</button></section><section class="settings-card settings-about"><span class="section-kicker">ABOUT SOLVESTACK</span><h2>A working notebook for technical investigations</h2><p>Use SolveStack when a problem lasts longer than a quick fix or involves several tests, possible causes, and pieces of evidence. It is built for the person actively solving the problem.</p><ul><li>Capture reasoning and evidence during the investigation.</li><li>Preserve what was ruled out and why.</li><li>Turn the finished work into portable organizational knowledge.</li><li>Export a redacted agent pack for organization-approved AI review.</li></ul><p><strong>Local privacy:</strong> no account is required and core troubleshooting data is not uploaded to a SolveStack server. Clearing browser data may remove it, so export backups or an encrypted vault periodically. The site uses Cloudflare Web Analytics, which is cookieless, records aggregate page views, and does not read locally stored data.</p><p>Completed Markdown can live in SharePoint, OneDrive, GitHub, file shares, documentation systems, or AI-searchable repositories. See the <a href="/agent-adapter/">agent adapter</a> for local tooling.</p><button class="secondary" id="settings-guide">Open the field guide</button></section></div>`;
}

function knowledgeMarkdown(s: Session) {
  const front = `---\nsolvestack_version: 1\nsession_id: ${s.id}\ntitle: ${JSON.stringify(s.title)}\nstatus: ${s.status}\nsystem: ${JSON.stringify(s.system)}\ncreated: ${s.createdAt}\nresolved: ${s.resolvedAt || ""}\ntags: [${s.tags.map(JSON.stringify).join(", ")}]\n---`;
  const entries = s.entries
    .slice()
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp))
    .map(
      (e) =>
        `- **${e.type}${e.technicalType ? ` / ${e.technicalType}` : ""}** — ${escapeMd(e.content)} _(${dateLabel(e.timestamp)})_`,
    )
    .join("\n");
  const hyps = s.hypotheses
    .map(
      (h) =>
        `- **${escapeMd(h.text)}** — ${h.status}${h.reasoning ? `: ${escapeMd(h.reasoning)}` : ""}`,
    )
    .join("\n");
  const ruled = s.hypotheses
    .filter((h) => h.status === "Ruled Out")
    .map(
      (h) =>
        `- **${escapeMd(h.text)}** — ${escapeMd(h.reasoning || "Reason not recorded")}`,
    )
    .join("\n");
  return `${front}\n\n# ${escapeMd(s.title)}\n\n## Problem\n${s.problem || "Not recorded"}\n\n## Environment\n${s.system || "Not recorded"}\n\n## Symptoms\n${s.problem || "Not recorded"}\n\n## Key Findings\n${
    s.entries
      .filter((e) => e.starred)
      .map((e) => `- ${escapeMd(e.content)}`)
      .join("\n") || "Not recorded"
  }\n\n## Timeline\n${entries || "Not recorded"}\n\n## Hypotheses\n${hyps || "Not recorded"}\n\n## Ruled Out\n${ruled || "Not recorded"}\n\n## Root Cause\n${s.resolution.rootCause || "Not recorded"}\n\n## Resolution\n${s.resolution.fix || "Not recorded"}\n\n## Validation\n${s.resolution.validation || "Not recorded"}\n\n## Prevention\n${s.resolution.prevention || "Not recorded"}\n\n## Evidence\n${
    s.entries
      .flatMap((e) => e.attachmentIds.map((id) => attachmentFor(id)?.filename))
      .filter(Boolean)
      .map((x) => `- ${x}`)
      .join("\n") || "Not recorded"
  }\n`;
}
function rcaMarkdown(s: Session) {
  const timeline = s.entries
    .slice()
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp))
    .map(
      (entry) =>
        `- ${entry.timestamp} — **${entry.type}**: ${escapeMd(entry.content)}`,
    )
    .join("\n");
  const ruledOut = s.hypotheses
    .filter((hypothesis) => hypothesis.status === "Ruled Out")
    .map(
      (hypothesis) =>
        `- **${escapeMd(hypothesis.text)}** — ${escapeMd(hypothesis.reasoning || "Reason not recorded")}`,
    )
    .join("\n");
  return `---\nsolvestack_version: 1\ndocument_type: rca\nsession_id: ${s.id}\ntitle: ${JSON.stringify(s.title)}\nstatus: ${s.status}\n---\n\n# RCA: ${escapeMd(s.title)}\n\n## Incident\n${s.title}\n\n## Impact / Problem\n${s.problem || "Not recorded"}\n\n## Environment\n${s.system || "Not recorded"}\n\n## Timeline\n${timeline || "Not recorded"}\n\n## Key Findings\n${
    s.entries
      .filter((entry) => entry.starred)
      .map((entry) => `- ${escapeMd(entry.content)}`)
      .join("\n") || "Not recorded"
  }\n\n## Hypotheses Investigated\n${s.hypotheses.map((hypothesis) => `- **${escapeMd(hypothesis.text)}** — ${hypothesis.status}`).join("\n") || "Not recorded"}\n\n## Ruled Out\n${ruledOut || "Not recorded"}\n\n## Root Cause\n${s.resolution.rootCause || "Not recorded"}\n\n## Resolution\n${s.resolution.fix || "Not recorded"}\n\n## Validation\n${s.resolution.validation || "Not recorded"}\n\n## Preventative Actions\n${s.resolution.prevention || "Not recorded"}\n`;
}
async function standaloneHtml(s: Session) {
  const sections = knowledgeMarkdown(s)
    .replace(/^---[\s\S]*?---/, "")
    .trim()
    .split(/\n## /);
  const body = sections
    .map((part, i) => {
      const lines = part.split("\n");
      const title = i === 0 ? lines.shift()! : lines.shift()!;
      return `${i === 0 ? "<h1>" : "<h2>"}${escapeHtml(title.replace(/^# /, ""))}${i === 0 ? "</h1>" : "</h2>"}<div>${lines
        .map((line) => escapeHtml(line))
        .join("\n")
        .replace(/^- (.*)$/gm, "<p>• $1</p>")
        .replace(/\n/g, "<br>")}</div>`;
    })
    .join("");
  const evidenceParts: string[] = [];
  for (const attachment of store.attachments.filter(
    (item) => item.sessionId === s.id,
  )) {
    if (attachment.mimeType.startsWith("image/")) {
      const src = await attachmentDataUrl(attachment);
      evidenceParts.push(
        `<figure><img src="${escapeHtml(src)}" alt="${escapeHtml(attachment.description || attachment.filename)}"><figcaption>${escapeHtml(attachment.filename)}${attachment.description ? ` — ${escapeHtml(attachment.description)}` : ""}</figcaption></figure>`,
      );
    } else {
      evidenceParts.push(
        `<p>📎 ${escapeHtml(attachment.filename)}${attachment.description ? ` — ${escapeHtml(attachment.description)}` : ""}</p>`,
      );
    }
  }
  const evidence = evidenceParts.join("");
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(s.title)}</title><style>body{max-width:850px;margin:50px auto;font:16px system-ui;color:#20251f;line-height:1.6;padding:0 24px}h1{font-size:38px;line-height:1.1;border-bottom:2px solid #c9f269;padding-bottom:20px}h2{margin-top:32px;color:#526d2c}p{margin:6px 0;white-space:pre-wrap}img{display:block;max-width:100%;height:auto;border:1px solid #ccd2c7;border-radius:6px}figure{margin:20px 0}figcaption{font-size:13px;color:#596357;margin-top:6px}</style></head><body>${body}${evidence ? `<h2>Evidence files</h2>${evidence}` : ""}</body></html>`;
}
async function packageHtml(s: Session) {
  const attachmentLinks = store.attachments
    .filter((a) => a.sessionId === s.id)
    .map((a) => `<p>📎 ${escapeHtml(a.filename)}</p>`)
    .join("");
  return (await standaloneHtml(s)).replace(
    "</body>",
    `${attachmentLinks}</body>`,
  );
}
function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function zipBytes(files: { name: string; data: Uint8Array }[]) {
  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  const u16 = (n: number) => new Uint8Array([n & 255, (n >>> 8) & 255]);
  const u32 = (n: number) =>
    new Uint8Array([
      n & 255,
      (n >>> 8) & 255,
      (n >>> 16) & 255,
      (n >>> 24) & 255,
    ]);
  const join = (parts: Uint8Array[]) => {
    const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
    let at = 0;
    for (const p of parts) {
      out.set(p, at);
      at += p.length;
    }
    return out;
  };
  for (const file of files) {
    const name = encoder.encode(file.name);
    const crc = crc32(file.data);
    const local = join([
      u32(0x04034b50),
      u16(20),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(crc),
      u32(file.data.length),
      u32(file.data.length),
      u16(name.length),
      u16(0),
      name,
      file.data,
    ]);
    chunks.push(local);
    central.push(
      join([
        u32(0x02014b50),
        u16(20),
        u16(20),
        u16(0),
        u16(0),
        u16(0),
        u16(0),
        u32(crc),
        u32(file.data.length),
        u32(file.data.length),
        u16(name.length),
        u16(0),
        u16(0),
        u16(0),
        u16(0),
        u32(0),
        u32(offset),
        name,
      ]),
    );
    offset += local.length;
  }
  const body = join(chunks);
  const directory = join(central);
  return join([
    body,
    directory,
    u32(0x06054b50),
    u16(0),
    u16(0),
    u16(files.length),
    u16(files.length),
    u32(directory.length),
    u32(body.length),
    u16(0),
  ]);
}

/**
 * ZIP entry name for an evidence file (security audit run 1:
 * zip-evidence-filename-path-traversal mitigation). Attachment filenames
 * can arrive via imported JSON, so they are reduced to a basename:
 * path separators end the name, control characters are replaced, and
 * leading dots are stripped so an entry can never traverse out of the
 * extraction directory.
 */
function evidenceEntryName(filename: string) {
  const base = (filename.split(/[\\/]/).pop() ?? "")
    .split("")
    .map((ch) => {
      const code = ch.charCodeAt(0);
      return code < 32 || code === 127 ? "_" : ch;
    })
    .join("")
    .replace(/^\.+/, "");
  return `evidence/${base || "evidence-file"}`;
}
async function makeZip(s: Session) {
  const encoder = new TextEncoder();
  const files = [
    { name: "README.md", data: encoder.encode(knowledgeMarkdown(s)) },
    { name: "RCA.md", data: encoder.encode(rcaMarkdown(s)) },
    {
      name: "session.html",
      data: encoder.encode(await packageHtml(s)),
    },
    {
      name: "session.json",
      data: encoder.encode(
        JSON.stringify(
          {
            schemaVersion: CURRENT_SCHEMA_VERSION,
            session: s,
            attachments: store.attachments
              .filter((a) => a.sessionId === s.id)
              .map(({ data, ...meta }) => meta),
          },
          null,
          2,
        ),
      ),
    },
  ];
  for (const a of store.attachments.filter((a) => a.sessionId === s.id)) {
    const dataUrl = await attachmentDataUrl(a);
    const bytes = dataUrl
      ? bytesFromDataUrl(dataUrl)
      : new Uint8Array();
    files.push({
      name: evidenceEntryName(a.filename),
      data: bytes,
    });
  }
  download(`${s.id}-knowledge-package.zip`, zipBytes(files), "application/zip");
}
async function makeAgentPack(s: Session) {
  // One dialog up front: what should the AI do with the pack, and in which
  // format? Dismissing it falls back to the plain pack, exactly as before
  // tasks existed.
  const values = await collectFields("Export an agent pack", [
    {
      name: "task",
      label:
        "What should the AI do? (Works with ChatGPT, Claude, Copilot, and Gemini.)",
      value: "review",
      options: AGENT_TASKS.map((task) => ({
        value: task.id,
        label: `${task.label} — ${task.description}`,
      })),
    },
    {
      name: "format",
      label: "Format",
      value: "zip",
      options: [
        { value: "zip", label: "ZIP pack — files to upload" },
        { value: "paste", label: "Single Markdown file — paste into a chat" },
        {
          value: "chatgpt",
          label: "Open in ChatGPT — prompt prefilled, pack copied",
        },
        {
          value: "claude",
          label: "Open in Claude — prompt prefilled, pack copied",
        },
      ],
    },
  ]);
  const encoder = new TextEncoder();
  const attachments = store.attachments
    .filter((a) => a.sessionId === s.id)
    .map(({ id, filename, mimeType, size, description }) => ({
      id,
      filename,
      mimeType,
      size,
      description,
    }));
  const handoff = values ? aiHandoffById(values.format) : undefined;
  if (values && handoff) {
    // Clipboard first — it is the reliable channel, inside the dialog's
    // user-activation window. The prefilled URL is a bonus on top: if the
    // vendor's ?q= convention fails, the user lands in an empty chat with
    // the pack already copied. See src/ai-handoff.ts.
    const task = agentTaskById(values.task);
    const pastePack = buildPastePack({
      session: s,
      knowledgeMarkdown: knowledgeMarkdown(s),
      attachments,
      schemaVersion: CURRENT_SCHEMA_VERSION,
      taskId: task.id,
    });
    const prompt = buildAgentPrompt(
      redactSessionForAgent(s),
      task,
      "handoff",
    );
    let copied = true;
    try {
      await navigator.clipboard.writeText(pastePack);
    } catch {
      copied = false;
    }
    if (!copied)
      download(`${s.id}-ai-pack.md`, encoder.encode(pastePack), "text/markdown");
    const prefilled = buildHandoffUrl(handoff, prompt);
    const opened = window.open(prefilled ?? handoff.chatUrl, "_blank", "noopener");
    if (!opened)
      showToast(
        copied
          ? `${handoff.label} didn't open (popup blocked). The pack is copied — open ${handoff.label} and paste.`
          : `${handoff.label} didn't open (popup blocked). The pack downloaded as a file instead.`,
      );
    else if (!copied)
      showToast(
        `Clipboard unavailable, so the pack downloaded as a file. Upload or paste it into ${handoff.label}.`,
      );
    else if (!prefilled)
      showToast(
        `Pack copied — paste it into ${handoff.label} and send. (The prompt was too long to prefill.)`,
      );
    else
      showToast(
        `Pack copied — if the prompt isn't filled in, paste into ${handoff.label} and send.`,
      );
    return;
  }
  if (values?.format === "paste") {
    download(
      `${s.id}-ai-pack.md`,
      encoder.encode(
        buildPastePack({
          session: s,
          knowledgeMarkdown: knowledgeMarkdown(s),
          attachments,
          schemaVersion: CURRENT_SCHEMA_VERSION,
          taskId: agentTaskById(values.task).id,
        }),
      ),
      "text/markdown",
    );
    return;
  }
  const pack = buildAgentPackFiles({
    session: s,
    knowledgeMarkdown: knowledgeMarkdown(s),
    attachments,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    taskId: values ? agentTaskById(values.task).id : undefined,
  });
  download(
    `${s.id}-agent-pack.zip`,
    zipBytes(
      pack.map((file) => ({
        name: file.name,
        data: encoder.encode(file.text),
      })),
    ),
    "application/zip",
  );
}
function redact(value: string) {
  const selected = window.getSelection()?.toString();
  if (!selected) return value;
  return value.replaceAll(selected, "[REDACTED]");
}
function bind() {
  document.querySelectorAll<HTMLElement>("[data-storage-fill]").forEach((bar) => {
    bar.style.width = `${bar.dataset.storageFill}%`;
  });
  if (view === "settings") void refreshStorageEstimate();
  const doBackup = async () => {
    store.lastBackupAt = now();
    download(
      "solvestack-backup.json",
      JSON.stringify({ ...store, exportedAt: now() }, null, 2),
      "application/json",
    );
    await persist();
    render();
    showToast(
      `Backup downloaded — ${backupStatus(store.lastBackupAt).label.toLowerCase()}.`,
    );
  };
  document
    .querySelector("#backup-now")
    ?.addEventListener("click", () => void doBackup());
  if (!attachmentListenerReady) {
    attachmentListenerReady = true;
    window.addEventListener(
      "solvestack:remove-attachment",
      (event: Event) => {
        void (async () => {
          const attachmentId = (
            event as CustomEvent<{ attachmentId: string }>
          ).detail?.attachmentId;
          const attachment = store.attachments.find(
            (a) => a.id === attachmentId,
          );
          if (!attachment) return;
          const priorLinks = new Map<string, string[]>();
          for (const session of store.sessions)
            for (const entry of session.entries)
              if (entry.attachmentIds.includes(attachmentId))
                priorLinks.set(entry.id, [...entry.attachmentIds]);
          store.attachments = store.attachments.filter(
            (a) => a.id !== attachmentId,
          );
          for (const session of store.sessions)
            for (const entry of session.entries)
              entry.attachmentIds = entry.attachmentIds.filter(
                (id) => id !== attachmentId,
              );
          await persist();
          render();
          const restore = async () => {
            store.attachments.push(attachment);
            for (const session of store.sessions)
              for (const entry of session.entries) {
                const ids = priorLinks.get(entry.id);
                if (ids) entry.attachmentIds = ids;
              }
            await persist();
            render();
          };
          showToast("Evidence removed.", {
            actionLabel: "Undo",
            onAction: () => void restore(),
            durationMs: UNDO_WINDOW_MS,
          });
          // Delay OPFS deletion past the undo window so Undo can still work
          // for in-memory restore; orphaned OPFS blobs are acceptable.
          if (attachment.blobRef)
            setTimeout(
              () => void deleteEvidenceBlob(attachment.blobRef!),
              UNDO_WINDOW_MS + 1000,
            );
        })();
      },
    );
  }
  const openGuide = () =>
    document.querySelector<HTMLDialogElement>("#guide-dialog")?.showModal();
  const openDataGuide = () =>
    document
      .querySelector<HTMLDialogElement>("#data-guide-dialog")
      ?.showModal();
  document.querySelector("#open-guide")?.addEventListener("click", openGuide);
  document
    .querySelector("#open-data-guide")
    ?.addEventListener("click", openDataGuide);
  document.querySelector("#guide-to-data")?.addEventListener("click", () =>
    setTimeout(openDataGuide, 0),
  );
  document.querySelector("#welcome-guide")?.addEventListener("click", openGuide);
  document.querySelector("#settings-guide")?.addEventListener("click", openGuide);
  document.querySelector("#welcome-start")?.addEventListener("click", () =>
    document.querySelector<HTMLButtonElement>("#new-session")?.click(),
  );
  document.querySelector("#dismiss-welcome")?.addEventListener("click", () => {
    welcomeDismissed = true;
    localStorage.setItem("solvestack-welcome-dismissed", "true");
    render();
  });
  document.querySelectorAll<HTMLElement>("[data-nav]").forEach(
    (el) =>
      (el.onclick = () => {
        if (el.dataset.nav === "knowledge") knowledgeArticleId = null;
        view = el.dataset.nav as typeof view;
        render();
      }),
  );
  document.querySelectorAll<HTMLElement>("[data-open]").forEach(
    (el) =>
      (el.onclick = () => {
        activeId = el.dataset.open!;
        view = "session";
        history.replaceState(null, "", `#${activeId}`);
        render();
      }),
  );
  document.querySelectorAll<HTMLElement>("[data-article]").forEach(
    (el) =>
      (el.onclick = () => {
        knowledgeArticleId = el.dataset.article!;
        view = "knowledge";
        render();
      }),
  );
  const startSession = async (presetMethod?: BlueprintId | null) => {
    const preferred = presetMethod || pendingMethod || "blank";
    pendingMethod = null;
    if (location.search.includes("method=") || location.hash.startsWith("#method="))
      history.replaceState(null, "", "/");
    const values = await collectFields(
      "Start a troubleshooting session",
      [
        {
          name: "method",
          label: "Investigation method",
          value: preferred,
          options: BLUEPRINTS.map((blueprint) => ({
            value: blueprint.id,
            label:
              blueprint.kind === "incident"
                ? `Incident: ${blueprint.label}`
                : blueprint.label,
          })),
          optionHints: Object.fromEntries(
            BLUEPRINTS.map((blueprint) => [
              blueprint.id,
              blueprint.kind === "incident"
                ? "Pre-fills a starting focus, the first checks as next steps, and the likely causes to rule in or out. You can edit or delete any of it."
                : blueprint.id === "blank"
                  ? "An empty session. Add entries, hypotheses, and next steps as you go."
                  : "Pre-fills the method's working structure — a focus line, a scratchpad scaffold, and starter tasks. Edit anything as the investigation develops.",
            ]),
          ),
        },
        {
          name: "problem",
          label: "What’s happening?",
          multiline: true,
          required: true,
          placeholder:
            blueprintById(preferred).exampleProblem ||
            "e.g. Users in one office can't reach the file server since this morning's firewall change.",
        },
        { name: "system", label: "System / product (optional)" },
        { name: "tags", label: "Tags, separated by commas (optional)" },
      ],
      { confirmLabel: "Start session" },
    );
    if (!values?.problem.trim()) return;
    const blueprint = blueprintById(values.method);
    const stamp = now();
    const userTags = values.tags
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean);
    const s: Session = {
      schemaVersion: CURRENT_SCHEMA_VERSION,
      id: `SS-${stamp.slice(0, 10).replaceAll("-", "")}-${String(store.sessions.length + 1).padStart(3, "0")}`,
      title: values.problem.trim().slice(0, 72),
      problem: values.problem.trim(),
      system: values.system.trim(),
      tags: [...new Set([...blueprint.tags, ...userTags])],
      status: "active",
      createdAt: stamp,
      updatedAt: stamp,
      currentFocus: blueprint.currentFocus,
      scratchpad: blueprint.scratchpad,
      entries: blueprint.entries.map((entry) => ({
        id: uid("entry"),
        type: entry.type,
        technicalType: entry.technicalType || "",
        content: entry.content,
        timestamp: stamp,
        createdAt: stamp,
        updatedAt: stamp,
        starred: false,
        attachmentIds: [],
      })),
      hypotheses: blueprint.hypotheses.map((text) => ({
        id: uid("hyp"),
        text,
        status: "Investigating" as const,
        reasoning: "",
        evidenceIds: [],
        createdAt: stamp,
        updatedAt: stamp,
      })),
      tasks: blueprint.tasks.map((text) => ({
        id: uid("task"),
        text,
        completed: false,
        createdAt: stamp,
      })),
      resolution: blankResolution(),
      metadata: { blueprint: blueprint.id },
    };
    store.sessions.unshift(s);
    activeId = s.id;
    view = "session";
    history.replaceState(null, "", `#${s.id}`);
    await persist();
    render();
    if (blueprint.id !== "blank")
      showToast(`Started with ${blueprint.shortLabel} method structure.`);
  };
  document
    .querySelector("#new-session")
    ?.addEventListener("click", () => void startSession());
  document.querySelectorAll<HTMLElement>("[data-method]").forEach(
    (el) =>
      (el.onclick = () =>
        void startSession(el.dataset.method as BlueprintId)),
  );
  document
    .querySelector<HTMLInputElement>("#search")
    ?.addEventListener("input", (e) => {
      search = (e.target as HTMLInputElement).value;
      render();
      document.querySelector<HTMLInputElement>("#search")?.focus();
    });
  document
    .querySelector<HTMLInputElement>("#knowledge-search")
    ?.addEventListener("input", (e) => {
      knowledgeSearch = (e.target as HTMLInputElement).value;
      render();
      document.querySelector<HTMLInputElement>("#knowledge-search")?.focus();
    });
  document
    .querySelector<HTMLSelectElement>("#knowledge-system")
    ?.addEventListener("change", (e) => {
      knowledgeSystem = (e.target as HTMLSelectElement).value;
      render();
    });
  document.querySelectorAll<HTMLElement>("[data-kb-tag]").forEach(
    (el) =>
      (el.onclick = () => {
        knowledgeTag = el.dataset.kbTag || "";
        render();
      }),
  );
  document.querySelector("#kb-back")?.addEventListener("click", () => {
    knowledgeArticleId = null;
    render();
  });
  const articleSession = () =>
    store.sessions.find((x) => x.id === knowledgeArticleId);
  document.querySelector("#kb-export-md")?.addEventListener("click", () => {
    const s = articleSession();
    if (s) download(`${s.id}-knowledge.md`, knowledgeMarkdown(s), "text/markdown");
  });
  document
    .querySelector("#kb-export-runbook")
    ?.addEventListener("click", () => {
      const s = articleSession();
      if (!s) return;
      const evidenceNames = s.entries
        .flatMap((e) =>
          e.attachmentIds.map((id) => attachmentFor(id)?.filename),
        )
        .filter((name): name is string => Boolean(name));
      download(
        `${s.id}-runbook.md`,
        buildRunbook(s, evidenceNames),
        "text/markdown",
      );
    });
  document.querySelector("#kb-export-agent")?.addEventListener("click", () => {
    const s = articleSession();
    if (s) void makeAgentPack(s);
  });
  document.querySelector("#back")?.addEventListener("click", () => {
    view = "dashboard";
    render();
  });
  document.querySelectorAll<HTMLButtonElement>("[data-type]").forEach(
    (b) =>
      (b.onclick = () => {
        entryType = b.dataset.type as EntryType;
        render();
        document.querySelector<HTMLTextAreaElement>("#capture")?.focus();
      }),
  );
  document
    .querySelector<HTMLSelectElement>("#technical-type")
    ?.addEventListener(
      "change",
      (e) =>
        (technicalType = (e.target as HTMLSelectElement)
          .value as TechnicalType),
    );
  const capture = async () => {
    const box = document.querySelector<HTMLTextAreaElement>("#capture");
    const s = active();
    if (!s || !box?.value.trim()) return;
    const e: Entry = {
      id: uid("entry"),
      type: entryType,
      technicalType,
      content: box.value.trim(),
      timestamp: now(),
      createdAt: now(),
      updatedAt: now(),
      starred: false,
      attachmentIds: [],
    };
    const files = document.querySelector<HTMLInputElement>("#attach")?.files;
    for (const file of files || []) {
      if (file.size > 10_000_000) {
        showToast(
          `${file.name} is too large. Attachments are limited to 10 MB.`,
          { durationMs: 8000 },
        );
        continue;
      }
      try {
        const id = uid("file");
        let data = "";
        let blobRef: string | undefined;
        if (canUseOpfs() && file.size > 64_000) {
          blobRef = await putEvidenceBlob(id, file);
        } else {
          data = await readFile(file);
        }
        const a: Attachment = {
          id,
          sessionId: s.id,
          entryId: e.id,
          filename: file.name,
          mimeType: file.type || "application/octet-stream",
          size: file.size,
          createdAt: now(),
          description:
            document
              .querySelector<HTMLInputElement>(
                `[data-attachment-description="${CSS.escape(file.name)}"]`,
              )
              ?.value.trim() || "",
          data,
          blobRef,
        };
        store.attachments.push(a);
        e.attachmentIds.push(a.id);
      } catch (error) {
        showToast(`Evidence could not be read: ${storageMessage(error)}`, {
          durationMs: 8000,
        });
      }
    }
    s.entries.push(e);
    s.updatedAt = now();
    box.value = "";
    await persist();
    render();
  };
  document.querySelector("#capture-btn")?.addEventListener("click", capture);
  document.querySelector("#capture")?.addEventListener("keydown", (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") capture();
  });
  document.querySelectorAll<HTMLButtonElement>("[data-copy-entry]").forEach(
    (button) =>
      (button.onclick = async () => {
        const entry = active()?.entries.find(
          (item) => item.id === button.dataset.copyEntry,
        );
        if (!entry) return;
        await navigator.clipboard.writeText(entry.content);
        button.textContent = "Copied";
      }),
  );
  document.querySelectorAll<HTMLButtonElement>("[data-edit-entry]").forEach(
    (b) =>
      (b.onclick = async () => {
        const e = active()!.entries.find((x) => x.id === b.dataset.editEntry);
        if (!e) return;
        const values = await collectFields("Edit timeline entry", [
          {
            name: "content",
            label: "Entry content",
            value: e.content,
            multiline: true,
            required: true,
          },
        ]);
        if (values) {
          e.content = values.content;
          e.timestamp = now();
          e.updatedAt = now();
          active()!.updatedAt = now();
          await persist();
          render();
        }
      }),
  );
  document.querySelectorAll<HTMLButtonElement>("[data-star]").forEach(
    (b) =>
      (b.onclick = async () => {
        const e = active()!.entries.find((x) => x.id === b.dataset.star);
        if (e) e.starred = !e.starred;
        await persist();
        render();
      }),
  );
  document.querySelectorAll<HTMLButtonElement>("[data-delete]").forEach(
    (b) =>
      (b.onclick = async () => {
        const s = active()!;
        const entryId = b.dataset.delete!;
        const index = s.entries.findIndex((e) => e.id === entryId);
        if (index < 0) return;
        const entry = s.entries[index];
        const removedAttachments = store.attachments.filter(
          (a) => a.entryId === entryId,
        );
        s.entries.splice(index, 1);
        store.attachments = store.attachments.filter(
          (a) => a.entryId !== entryId,
        );
        s.updatedAt = now();
        await persist();
        render();
        const restore = async () => {
          s.entries.splice(Math.min(index, s.entries.length), 0, entry);
          store.attachments.push(...removedAttachments);
          s.updatedAt = now();
          await persist();
          render();
        };
        showToast("Entry deleted.", {
          actionLabel: "Undo",
          onAction: () => void restore(),
          durationMs: UNDO_WINDOW_MS,
        });
        for (const attachment of removedAttachments)
          if (attachment.blobRef)
            setTimeout(
              () => void deleteEvidenceBlob(attachment.blobRef!),
              UNDO_WINDOW_MS + 1000,
            );
      }),
  );
  document
    .querySelector<HTMLTextAreaElement>("#scratchpad")
    ?.addEventListener("input", (e) => {
      const s = active();
      if (s) {
        s.scratchpad = (e.target as HTMLTextAreaElement).value;
        s.updatedAt = now();
        schedulePersist();
      }
    });
  document
    .querySelector("#scratch-to-entry")
    ?.addEventListener("click", async () => {
      const s = active();
      const area = document.querySelector<HTMLTextAreaElement>("#scratchpad");
      const text =
        area?.value.slice(area.selectionStart, area.selectionEnd) || "";
      if (s && text) {
        s.entries.push({
          id: uid("entry"),
          type: "Note",
          technicalType: "",
          content: redact(text),
          timestamp: now(),
          createdAt: now(),
          updatedAt: now(),
          starred: false,
          attachmentIds: [],
        });
        await persist();
        render();
      }
    });
  document.querySelector("#edit-focus")?.addEventListener("click", async () => {
    const s = active()!;
    const values = await collectFields("Current focus", [
      {
        name: "focus",
        label: "What are you testing now?",
        value: s.currentFocus,
        multiline: true,
      },
    ]);
    if (values) {
      s.currentFocus = values.focus;
      s.updatedAt = now();
      await persist();
      render();
    }
  });
  document.querySelector("#add-hyp")?.addEventListener("click", async () => {
    const values = await collectFields("Add hypothesis", [
      {
        name: "text",
        label: "Possible explanation",
        required: true,
        multiline: true,
      },
    ]);
    if (values?.text.trim()) {
      active()!.hypotheses.push({
        id: uid("hyp"),
        text: values.text.trim(),
        status: "Investigating",
        reasoning: "",
        evidenceIds: [],
        createdAt: now(),
        updatedAt: now(),
      });
      await persist();
      render();
    }
  });
  document.querySelectorAll<HTMLSelectElement>("[data-hyp]").forEach(
    (el) =>
      (el.onchange = async () => {
        const h = active()!.hypotheses.find((x) => x.id === el.dataset.hyp);
        if (h) {
          h.status = el.value as Hypothesis["status"];
          if (h.status === "Ruled Out") {
            const values = await collectFields("Rule out hypothesis", [
              {
                name: "reasoning",
                label: "Why was this ruled out?",
                value: h.reasoning,
                multiline: true,
                required: true,
              },
            ]);
            if (!values) {
              el.value = h.status = "Investigating";
              return;
            }
            h.reasoning = values.reasoning;
          }
          h.updatedAt = now();
          await persist();
          render();
        }
      }),
  );
  document.querySelector("#add-task")?.addEventListener("click", async () => {
    const values = await collectFields("Add next step", [
      { name: "text", label: "Troubleshooting check", required: true },
    ]);
    if (values?.text.trim()) {
      active()!.tasks.push({
        id: uid("task"),
        text: values.text.trim(),
        completed: false,
        createdAt: now(),
      });
      await persist();
      render();
    }
  });
  document.querySelectorAll<HTMLInputElement>("[data-task]").forEach(
    (el) =>
      (el.onchange = async () => {
        const t = active()!.tasks.find((x) => x.id === el.dataset.task);
        if (t) {
          t.completed = el.checked;
          t.completedAt = t.completed ? now() : undefined;
          await persist();
          render();
        }
      }),
  );
  document.querySelector("#export-md")?.addEventListener("click", () => {
    const s = active()!;
    download(`${s.id}-knowledge.md`, knowledgeMarkdown(s), "text/markdown");
    setTimeout(openDataGuide, 150);
  });
  document.querySelector("#export-rca")?.addEventListener("click", () => {
    const s = active()!;
    download(`${s.id}-rca.md`, rcaMarkdown(s), "text/markdown");
    setTimeout(openDataGuide, 150);
  });
  document.querySelector("#export-runbook")?.addEventListener("click", () => {
    const s = active()!;
    const evidenceNames = s.entries
      .flatMap((e) =>
        e.attachmentIds.map((id) => attachmentFor(id)?.filename),
      )
      .filter((name): name is string => Boolean(name));
    download(
      `${s.id}-runbook.md`,
      buildRunbook(s, evidenceNames),
      "text/markdown",
    );
    setTimeout(openDataGuide, 150);
  });
  document.querySelector("#export-json")?.addEventListener("click", () => {
    const s = active()!;
    download(
      `${s.id}.json`,
      JSON.stringify(
        {
          schemaVersion: CURRENT_SCHEMA_VERSION,
          session: s,
          attachments: store.attachments.filter((a) => a.sessionId === s.id),
        },
        null,
        2,
      ),
      "application/json",
    );
    setTimeout(openDataGuide, 150);
  });
  document.querySelector("#export-html")?.addEventListener("click", () => {
    void (async () => {
      const s = active()!;
      download(`${s.id}.html`, await standaloneHtml(s), "text/html");
      setTimeout(openDataGuide, 150);
    })();
  });
  document
    .querySelector("#export-package")
    ?.addEventListener("click", () => {
      void makeZip(active()!);
      setTimeout(openDataGuide, 150);
    });
  document.querySelector("#export-agent")?.addEventListener("click", () => {
    // No data-guide popup here: makeAgentPack opens its own dialog, and a
    // second modal stacked on top of it would fight the export flow.
    void makeAgentPack(active()!);
  });
  document.querySelector("#resolve")?.addEventListener("click", async () => {
    const s = active()!;
    const values = await collectFields("Resolve session", [
      {
        name: "rootCause",
        label: "Root cause",
        value: s.resolution.rootCause,
        multiline: true,
      },
      {
        name: "fix",
        label: "What fixed it?",
        value: s.resolution.fix,
        multiline: true,
      },
      {
        name: "validation",
        label: "How was the fix validated?",
        value: s.resolution.validation,
        multiline: true,
      },
      {
        name: "prevention",
        label: "Prevention / follow-up",
        value: s.resolution.prevention,
        multiline: true,
      },
    ]);
    if (!values) return;
    s.resolution = {
      rootCause: values.rootCause,
      fix: values.fix,
      validation: values.validation,
      prevention: values.prevention,
    };
    const firstResolve = s.status !== "resolved";
    s.status = "resolved";
    s.resolvedAt = s.resolvedAt || now();
    s.updatedAt = now();
    if (!s.entries.some((e) => e.type === "Resolution"))
      s.entries.push({
        id: uid("entry"),
        type: "Resolution",
        technicalType: "",
        content: s.resolution.fix || "Resolution recorded.",
        timestamp: now(),
        createdAt: now(),
        updatedAt: now(),
        starred: true,
        attachmentIds: [],
      });
    await persist();
    if (firstResolve) {
      try { (window as unknown as { glass?: { capture: (event: string) => void } }).glass?.capture("case_resolved"); } catch { /* analytics is best-effort */ }
    }
    render();
    if (backupStatus(store.lastBackupAt).needsBackup) {
      showToast("Session resolved — back up your workspace?", {
        actionLabel: "Back up now",
        onAction: () => void doBackup(),
        durationMs: 10000,
      });
    }
  });
  document
    .querySelector("#backup")
    ?.addEventListener("click", () => void doBackup());
  document
    .querySelector("#restore")
    ?.addEventListener("click", () =>
      document.querySelector<HTMLInputElement>("#restore-file")?.click(),
    );
  const mergeIncoming = async (
    sessions: Session[],
    attachments: Attachment[],
    kindLabel: string,
  ) => {
    const conflicts = sessions.filter((session) =>
      store.sessions.some((existing) => existing.id === session.id),
    );
    if (
      conflicts.length &&
      !confirm(
        `${conflicts.length} session ID conflict${conflicts.length === 1 ? "" : "s"} found. Keep existing records and skip conflicts?`,
      )
    )
      return;
    store.sessions = mergeBackup(store.sessions, sessions);
    store.attachments = mergeBackup(store.attachments, attachments);
    store.lastBackupAt = now();
    await persist();
    render();
    showToast(`${kindLabel}. Existing records were preserved.`);
  };
  document
    .querySelector<HTMLInputElement>("#restore-file")
    ?.addEventListener("change", async (e) => {
      const f = (e.target as HTMLInputElement).files?.[0];
      if (!f) return;
      try {
        const incoming = parsePortableData(JSON.parse(await f.text()));
        await mergeIncoming(
          incoming.sessions as Session[],
          incoming.attachments as Attachment[],
          incoming.kind === "session" ? "Session imported" : "Backup restored",
        );
      } catch (err) {
        showToast(`Restore failed: ${(err as Error).message}`, {
          durationMs: 8000,
        });
      }
    });
  document.querySelector("#vault-export")?.addEventListener("click", () => {
    void (async () => {
      const values = await collectFields("Export encrypted vault", [
        {
          name: "passphrase",
          label: "Passphrase (min 8 characters) — stored only in your head",
          required: true,
          secret: true,
        },
        {
          name: "confirm",
          label: "Confirm passphrase",
          required: true,
          secret: true,
        },
      ]);
      if (!values) return;
      if (values.passphrase !== values.confirm) {
        showToast("Passphrases did not match.");
        return;
      }
      try {
        const envelope = await encryptVault(
          { ...store, exportedAt: now() },
          values.passphrase,
        );
        store.lastBackupAt = now();
        download(
          "solvestack-vault.json",
          JSON.stringify(envelope, null, 2),
          "application/json",
        );
        await persist();
        render();
        showToast("Encrypted vault downloaded. Keep the passphrase offline.");
      } catch (err) {
        showToast(`Vault export failed: ${(err as Error).message}`, {
          durationMs: 8000,
        });
      }
    })();
  });
  document
    .querySelector("#vault-import")
    ?.addEventListener("click", () =>
      document.querySelector<HTMLInputElement>("#vault-file")?.click(),
    );
  document
    .querySelector<HTMLInputElement>("#vault-file")
    ?.addEventListener("change", async (e) => {
      const f = (e.target as HTMLInputElement).files?.[0];
      if (!f) return;
      try {
        const parsed = JSON.parse(await f.text());
        if (!isVaultEnvelope(parsed))
          throw new Error("File is not a SolveStack vault.");
        const values = await collectFields("Unlock encrypted vault", [
          {
            name: "passphrase",
            label: "Passphrase",
            required: true,
            secret: true,
          },
        ]);
        if (!values) return;
        const unlocked = await decryptVault(parsed, values.passphrase);
        const incoming = parsePortableData(unlocked);
        await mergeIncoming(
          incoming.sessions as Session[],
          incoming.attachments as Attachment[],
          "Vault imported",
        );
      } catch (err) {
        showToast(`Vault import failed: ${(err as Error).message}`, {
          durationMs: 8000,
        });
      }
    });
  document.querySelectorAll("#theme-toggle,#theme-settings").forEach((el) =>
    el.addEventListener("click", () => {
      document.documentElement.classList.toggle("light");
      localStorage.setItem(
        "solvestack-theme",
        document.documentElement.classList.contains("light") ? "light" : "dark",
      );
    }),
  );
  if (localStorage.getItem("solvestack-theme") === "light")
    document.documentElement.classList.add("light");
  if ("serviceWorker" in navigator && !swListenerReady) {
    swListenerReady = true;
    const hadController = Boolean(navigator.serviceWorker.controller);
    navigator.serviceWorker
      .register("/service-worker.js")
      .then((registration) => {
        registration.update().catch(() => {});
        // A new worker takes over silently today (skipWaiting + claim);
        // tell the user to reload instead. A first install has no prior
        // controller, so no toast on a first visit.
        navigator.serviceWorker.addEventListener("controllerchange", () => {
          if (!hadController) return;
          showToast("SolveStack updated — reload for the latest version.", {
            actionLabel: "Reload",
            onAction: () => location.reload(),
            durationMs: 15000,
          });
        });
      })
      .catch(() => {});
  }
}

window.addEventListener("beforeunload", (event) => {
  if (pendingPersistCount > 0) event.preventDefault();
});

load();
