import { readWorkspace, writeWorkspace } from "./local-store";

const makeId = (prefix: string) =>
  `${prefix}-${crypto.randomUUID().slice(0, 8)}`;

function wire() {
  const button = document.querySelector<HTMLButtonElement>("#enhanced-reuse");
  if (!button || button.dataset.selective) return;
  button.dataset.selective = "true";
  button.onclick = async () => {
    const data = await readWorkspace<any>();
    const current = data?.sessions.find(
      (session: any) => session.id === location.hash.slice(1),
    );
    if (!current) return;
    document.querySelector("#reuse-dialog")?.remove();
    const dialog = document.createElement("dialog");
    dialog.id = "reuse-dialog";
    dialog.className = "reuse-dialog";
    dialog.innerHTML = `<form method="dialog"><span class="section-kicker">USE AS STARTING POINT</span><h2>Choose historical context</h2><p>The original investigation remains unchanged.</p>${["hypotheses", "actions", "decisions", "tasks"].map((part, index) => `<label class="reuse-option"><input type="checkbox" value="${part}" ${index < 3 ? "checked" : ""}><span>${part[0].toUpperCase() + part.slice(1)}</span></label>`).join("")}<div class="button-row"><button value="cancel" class="secondary">Cancel</button><button type="button" class="primary" id="confirm-reuse">Create follow-up</button></div></form>`;
    document.body.append(dialog);
    dialog.querySelector<HTMLButtonElement>("#confirm-reuse")!.onclick =
      async () => {
        const selected = new Set(
          [...dialog.querySelectorAll<HTMLInputElement>("input:checked")].map(
            (input) => input.value,
          ),
        );
        if (!selected.size) return;
        const copy = structuredClone(current);
        copy.id = `SS-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-${Date.now().toString().slice(-4)}`;
        copy.title = `${copy.title} — follow-up`;
        copy.status = "active";
        copy.createdAt = new Date().toISOString();
        copy.updatedAt = copy.createdAt;
        delete copy.resolvedAt;
        copy.entries = copy.entries
          .filter(
            (entry: any) =>
              (selected.has("hypotheses") && entry.type === "Hypothesis") ||
              (selected.has("actions") && entry.type === "Action") ||
              (selected.has("decisions") && entry.type === "Decision"),
          )
          .map((entry: any) => ({
            ...entry,
            id: makeId("entry"),
            timestamp: copy.createdAt,
            starred: false,
            attachmentIds: [],
          }));
        copy.hypotheses = selected.has("hypotheses")
          ? copy.hypotheses.map((hypothesis: any) => ({
              ...hypothesis,
              id: makeId("hyp"),
              reasoning: `Starting hypothesis from ${current.id}. ${hypothesis.reasoning || ""}`,
            }))
          : [];
        copy.tasks = selected.has("tasks")
          ? copy.tasks.map((task: any) => ({
              ...task,
              id: makeId("task"),
              completed: false,
              completedAt: undefined,
            }))
          : [];
        copy.scratchpad = `Starting context copied from ${current.id}\n`;
        copy.resolution = {
          rootCause: "",
          fix: "",
          validation: "",
          prevention: "",
        };
        data.sessions.unshift(copy);
        await writeWorkspace(data);
        location.hash = copy.id;
        location.reload();
      };
    dialog.addEventListener("close", () => dialog.remove());
    dialog.showModal();
  };
}

new MutationObserver(wire).observe(document.body, {
  childList: true,
  subtree: true,
});
setTimeout(wire, 0);
