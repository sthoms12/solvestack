export type DialogField = {
  name: string;
  label: string;
  value?: string;
  multiline?: boolean;
  required?: boolean;
};
const escape = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (char) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;",
      })[char]!,
  );

export function collectFields(
  title: string,
  fields: DialogField[],
): Promise<Record<string, string> | null> {
  return new Promise((resolve) => {
    const dialog = document.createElement("dialog");
    dialog.className = "form-dialog";
    dialog.innerHTML = `<form method="dialog"><span class="section-kicker">SOLVESTACK</span><h2>${escape(title)}</h2>${fields.map((field) => `<label><span>${escape(field.label)}</span>${field.multiline ? `<textarea name="${field.name}" ${field.required ? "required" : ""}>${escape(field.value || "")}</textarea>` : `<input name="${field.name}" value="${escape(field.value || "")}" ${field.required ? "required" : ""}>`}</label>`).join("")}<div class="button-row"><button value="cancel" class="secondary">Cancel</button><button value="confirm" class="primary">Save</button></div></form>`;
    document.body.append(dialog);
    dialog.addEventListener("close", () => {
      const result =
        dialog.returnValue === "confirm"
          ? (Object.fromEntries(
              new FormData(dialog.querySelector("form")!).entries(),
            ) as Record<string, string>)
          : null;
      dialog.remove();
      resolve(result);
    });
    dialog.showModal();
    dialog.querySelector<HTMLElement>("input,textarea")?.focus();
  });
}
