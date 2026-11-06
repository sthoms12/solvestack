export type PasteTechnicalType =
  | ""
  | "Command"
  | "Command output"
  | "Error"
  | "Log"
  | "Screenshot"
  | "File"
  | "URL/reference";

export type PasteClassification = {
  technicalType: PasteTechnicalType;
  content: string;
  note: string;
};

const URL_ONLY = /^https?:\/\/\S+$/i;
const PROMPT =
  /^(?:PS\s+[A-Z]:\\[^>]*>|[A-Z]:\\[^>]*>|\$ |# |\[[^\]]+\]\$ |C:\\.*>)/im;
const ERROR_HINT =
  /\b(?:error|exception|traceback|fatal|access is denied|accessdenied|failed to|errno|HRESULT|0x[0-9A-Fa-f]{8})\b/i;
const LOG_HINT =
  /^(?:\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}|\w{3}\s+\d{1,2}\s+\d{2}:\d{2}:\d{2}|\[\d{4}-\d{2}-\d{2})/m;
const COMMAND_LINE =
  /^(?:(?:sudo|az|aws|gcloud|kubectl|docker|Get-|Set-|New-|Remove-|Test-|Invoke-|curl|wget|ssh|ping|nslookup|dig|tracert|ipconfig|ifconfig|netstat|systemctl|journalctl)\b)/im;

/** Classify clipboard text into a technicalType without calling a model. */
export function classifyPaste(raw: string): PasteClassification | null {
  const text = raw.replace(/\r\n/g, "\n").trim();
  if (!text) return null;

  if (URL_ONLY.test(text))
    return {
      technicalType: "URL/reference",
      content: text,
      note: "Detected URL reference",
    };

  const lines = text.split("\n");
  const looksMultiline = lines.length > 1;

  if (ERROR_HINT.test(text) && (looksMultiline || text.length > 40))
    return {
      technicalType: "Error",
      content: text,
      note: "Detected error / exception text",
    };

  if (LOG_HINT.test(text) && looksMultiline)
    return {
      technicalType: "Log",
      content: text,
      note: "Detected log lines",
    };

  if (PROMPT.test(text) || (COMMAND_LINE.test(text) && !looksMultiline))
    return {
      technicalType: "Command",
      content: text,
      note: "Detected command",
    };

  if (PROMPT.test(text) && looksMultiline)
    return {
      technicalType: "Command output",
      content: text,
      note: "Detected shell transcript",
    };

  if (
    looksMultiline &&
    lines.filter((line) => line.trim()).length >= 4 &&
    text.length > 120
  )
    return {
      technicalType: "Command output",
      content: text,
      note: "Detected multi-line technical output",
    };

  return null;
}
