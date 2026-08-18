import { readWorkspace, writeWorkspace } from "./local-store";
import { redactSelection, relatedSessions } from "./domain";

const getData = () => readWorkspace<any>();
const putData = (data: any) => writeWorkspace(data);
const id = () =>
  `SS-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-${Date.now().toString().slice(-4)}`;
const terms = (value: string) =>
  new Set(
    value
      .toLowerCase()
      .split(/[^a-z0-9.-]+/)
      .filter((word) => word.length > 3),
  );
document.addEventListener(
  "click",
  (event) => {
    const target = (event.target as HTMLElement).closest<HTMLElement>(
      "[data-open]",
    );
    if (target?.dataset.open)
      history.replaceState(null, "", `#${target.dataset.open}`);
  },
  true,
);
const wire = () => {
  const capture = document.querySelector<HTMLTextAreaElement>("#capture");
  const input = document.querySelector<HTMLInputElement>("#attach");
  const tech = document.querySelector<HTMLSelectElement>("#technical-type");
  if (capture && !capture.dataset.enhanced) {
    capture.dataset.enhanced = "true";
    capture.addEventListener("paste", (event) => {
      const item = [...(event.clipboardData?.items || [])].find((entry) =>
        entry.type.startsWith("image/"),
      );
      const file = item?.getAsFile();
      if (file && input) {
        event.preventDefault();
        const transfer = new DataTransfer();
        for (const existing of input.files || []) transfer.items.add(existing);
        transfer.items.add(
          new File([file], `pasted-screenshot-${Date.now()}.png`, {
            type: file.type,
          }),
        );
        input.files = transfer.files;
        if (tech) tech.value = "Screenshot";
        capture.value = capture.value || "Pasted screenshot";
        capture.placeholder =
          "Screenshot attached — add an optional note and capture";
        return;
      }
      const text = event.clipboardData?.getData("text") || "";
      if (/^https?:\/\/\S+$/i.test(text) && tech) {
        event.preventDefault();
        tech.value = "URL/reference";
        capture.value = text;
      }
    });
    input?.addEventListener("change", () => {
      if (input.files?.length && !capture?.value.trim())
        capture.value = "Attached evidence";
    });
  }
  const scratch = document.querySelector<HTMLTextAreaElement>("#scratchpad");
  const redactButton =
    document.querySelector<HTMLButtonElement>("#redact-selection");
  if (scratch && redactButton && !redactButton.dataset.ready) {
    redactButton.dataset.ready = "true";
    redactButton.onclick = () => {
      const start = scratch.selectionStart;
      const end = scratch.selectionEnd;
      if (start === end) {
        alert("Select text in the scratchpad first.");
        return;
      }
      scratch.value = redactSelection(scratch.value, start, end);
      scratch.dispatchEvent(new Event("input", { bubbles: true }));
    };
  }
  const actions = document.querySelector<HTMLElement>(".workspace-actions");
  if (actions && !document.querySelector("#enhanced-reuse")) {
    const button = document.createElement("button");
    button.className = "secondary";
    button.id = "enhanced-reuse";
    button.textContent = "Use as starting point";
    actions.prepend(button);
  }
  const context = document.querySelector<HTMLElement>(".context-panel");
  if (context && !document.querySelector("#related-investigations")) {
    getData().then((data) => {
      const current = data.sessions.find(
        (session: any) => session.id === location.hash.slice(1),
      );
      if (!current) return;
      const matches = relatedSessions(current, data.sessions);
      if (!matches.length) return;
      const section = document.createElement("section");
      section.id = "related-investigations";
      section.className = "context-block";
      section.innerHTML = `<div class="block-heading"><span class="section-kicker">RELATED INVESTIGATIONS</span></div>${matches.map(({ session, reasons }: any) => `<button class="related-link" data-related="${session.id}"><span>${session.title}</span><small>${reasons.join(" · ")}</small></button>`).join("")}`;
      context.append(section);
      section.querySelectorAll<HTMLElement>("[data-related]").forEach(
        (link) =>
          (link.onclick = () => {
            location.hash = link.dataset.related || "";
            location.reload();
          }),
      );
    });
  }
};
new MutationObserver(wire).observe(document.body, {
  childList: true,
  subtree: true,
});
setTimeout(wire, 0);
