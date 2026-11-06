export type DialogField = {
  name: string;
  label: string;
  value?: string;
  multiline?: boolean;
  required?: boolean;
  /** Password-style input for passphrases. */
  secret?: boolean;
  /** When set, renders a <select> instead of an input. */
  options?: { value: string; label: string }[];
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

function fieldMarkup(field: DialogField) {
  if (field.options?.length) {
    return `<label><span>${escape(field.label)}</span><select name="${field.name}" ${field.required ? "required" : ""}>${field.options
      .map(
        (option) =>
          `<option value="${escape(option.value)}" ${option.value === (field.value || "") ? "selected" : ""}>${escape(option.label)}</option>`,
      )
      .join("")}</select></label>`;
  }
  if (field.multiline)
    return `<label><span>${escape(field.label)}</span><textarea name="${field.name}" ${field.required ? "required" : ""}>${escape(field.value || "")}</textarea></label>`;
  return `<label><span>${escape(field.label)}</span><input name="${field.name}" type="${field.secret ? "password" : "text"}" value="${escape(field.value || "")}" ${field.required ? "required" : ""} autocomplete="${field.secret ? "new-password" : "off"}"></label>`;
}

export function collectFields(
  title: string,
  fields: DialogField[],
): Promise<Record<string, string> | null> {
  return new Promise((resolve) => {
    const dialog = document.createElement("dialog");
    dialog.className = "form-dialog";
    // The Cancel button carries formnovalidate: as a submit button in a
    // method="dialog" form it would otherwise run native validation, and a
    // single empty required field would make Cancel unclickable — on a
    // phone, with no Esc key, the dialog becomes a trap.
    dialog.innerHTML = `<form method="dialog"><span class="section-kicker">SOLVESTACK</span><h2>${escape(title)}</h2>${fields.map(fieldMarkup).join("")}<div class="button-row"><button value="cancel" class="secondary" formnovalidate>Cancel</button><button value="confirm" class="primary">Save</button></div></form>`;
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
    // Backdrop click dismisses, like Cancel (a showModal dialog gives
    // touch users no other chrome-level exit).
    dialog.addEventListener("click", (event) => {
      if (event.target === dialog) {
        dialog.returnValue = "cancel";
        dialog.close();
      }
    });
    dialog.showModal();
    // Autofocus is a desktop speed-up; on touch devices it summons the
    // keyboard before the user has decided to type anything.
    if (window.matchMedia("(pointer: fine)").matches)
      dialog.querySelector<HTMLElement>("input,textarea,select")?.focus();
  });
}
