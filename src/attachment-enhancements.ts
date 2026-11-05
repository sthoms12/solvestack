import { showToast } from "./data-safety";

function enhance() {
  const input = document.querySelector<HTMLInputElement>("#attach");
  if (input && !input.dataset.preview) {
    input.dataset.preview = "true";
    input.addEventListener("change", async () => {
      document.querySelector("#attachment-preview")?.remove();
      if (!input.files?.length) return;
      const preview = document.createElement("div");
      preview.id = "attachment-preview";
      preview.className = "attachment-preview";
      for (const file of input.files) {
        const item = document.createElement("div");
        item.className = "attachment-preview-item";
        const label = document.createElement("strong");
        label.textContent = file.name;
        item.append(label);
        if (file.type.startsWith("image/")) {
          const image = document.createElement("img");
          image.src = URL.createObjectURL(file);
          image.alt = `Preview of ${file.name}`;
          image.onload = () => URL.revokeObjectURL(image.src);
          item.append(image);
        } else if (
          /text|json|csv|log|markdown/.test(file.type) ||
          /\.(txt|log|csv|json|md)$/i.test(file.name)
        ) {
          const text = document.createElement("pre");
          text.textContent = (await file.text()).slice(0, 1200);
          item.append(text);
        }
        const description = document.createElement("input");
        description.dataset.attachmentDescription = file.name;
        description.placeholder = "Evidence description (optional)";
        description.setAttribute("aria-label", `Description for ${file.name}`);
        item.append(description);
        preview.append(item);
      }
      input.parentElement?.after(preview);
    });
  }

  document
    .querySelectorAll<HTMLButtonElement>("[data-remove-attachment]")
    .forEach((button) => {
      if (button.dataset.ready) return;
      button.dataset.ready = "true";
      button.onclick = () => {
        const attachmentId = button.dataset.removeAttachment;
        if (!attachmentId) return;
        // Removal runs through main.ts (single IndexedDB owner) so the
        // in-memory workspace cannot resurrect the attachment on the next
        // save, and the user gets a 30-second undo instead of a reload.
        window.dispatchEvent(
          new CustomEvent("solvestack:remove-attachment", {
            detail: { attachmentId },
          }),
        );
      };
    });
}

new MutationObserver(enhance).observe(document.body, {
  childList: true,
  subtree: true,
});
setTimeout(enhance, 0);
