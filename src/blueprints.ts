export type BlueprintId =
  | "blank"
  | "rca"
  | "5-whys"
  | "fishbone"
  | "incident-report";

export type BlueprintEntrySeed = {
  type:
    | "Note"
    | "Observation"
    | "Action"
    | "Evidence"
    | "Hypothesis"
    | "Result"
    | "Decision";
  technicalType?:
    | ""
    | "Command"
    | "Command output"
    | "Error"
    | "Log"
    | "Screenshot"
    | "File"
    | "URL/reference";
  content: string;
};

export type Blueprint = {
  id: BlueprintId;
  label: string;
  shortLabel: string;
  description: string;
  tags: string[];
  currentFocus: string;
  scratchpad: string;
  hypotheses: string[];
  tasks: string[];
  entries: BlueprintEntrySeed[];
  /** Public template path that should deep-link here. */
  templatePath?: string;
};

export const BLUEPRINTS: Blueprint[] = [
  {
    id: "blank",
    label: "Blank investigation",
    shortLabel: "Blank",
    description: "Start empty and capture as you go.",
    tags: [],
    currentFocus: "",
    scratchpad: "",
    hypotheses: [],
    tasks: [],
    entries: [],
  },
  {
    id: "rca",
    label: "Root cause analysis",
    shortLabel: "RCA",
    description:
      "Problem, timeline, competing causes, ruled-outs, root cause, fix, and prevention.",
    tags: ["rca"],
    currentFocus: "Confirm the root cause with evidence before declaring a fix.",
    scratchpad:
      "Problem statement:\nImpact:\nTimeline notes:\nContributing factors:",
    hypotheses: [
      "Primary suspected cause (replace with a concrete theory)",
      "Alternate cause to falsify",
    ],
    tasks: [
      "Write a precise problem statement",
      "Build a timestamped timeline",
      "Run 5 Whys on the key failure",
      "Separate contributing factors from root cause",
      "Assign corrective and preventative actions",
    ],
    entries: [
      {
        type: "Observation",
        content:
          "Problem statement: describe the symptom, scope, and who is affected.",
      },
      {
        type: "Note",
        content:
          "Timeline seed: record the first detection time and the last known good state.",
      },
    ],
    templatePath: "/rca-template/",
  },
  {
    id: "5-whys",
    label: "5 Whys chain",
    shortLabel: "5 Whys",
    description:
      "Walk from symptom to a changeable cause with five linked why questions.",
    tags: ["5-whys"],
    currentFocus: "Answer the next why with evidence, not speculation.",
    scratchpad: "Why 1:\nWhy 2:\nWhy 3:\nWhy 4:\nWhy 5 / root cause:",
    hypotheses: ["Working root-cause candidate from the why chain"],
    tasks: [
      "State the observable symptom",
      "Complete Why 1–5 with evidence links",
      "Confirm the final answer is actionable",
    ],
    entries: [
      {
        type: "Observation",
        content: "Symptom: what failed, for whom, and how you noticed it.",
      },
      {
        type: "Hypothesis",
        content: "Why 1 — first causal answer (replace after evidence).",
      },
    ],
    templatePath: "/5-whys-template/",
  },
  {
    id: "fishbone",
    label: "Fishbone / Ishikawa",
    shortLabel: "Fishbone",
    description:
      "Branch causes across the 6M categories before testing the most likely bone.",
    tags: ["fishbone", "ishikawa"],
    currentFocus: "Pick one branch to test next; leave the rest as open bones.",
    scratchpad:
      "Manpower:\nMethod:\nMachine:\nMaterial:\nMeasurement:\nMother nature / environment:",
    hypotheses: [
      "Method / process cause",
      "Machine / infrastructure cause",
      "Measurement / monitoring gap",
    ],
    tasks: [
      "Fill each 6M branch with candidate causes",
      "Mark ruled-out bones with reasoning",
      "Test the highest-likelihood bone",
    ],
    entries: [
      {
        type: "Observation",
        content: "Effect / symptom at the fish head (replace with the failure).",
      },
      {
        type: "Note",
        content:
          "6M pass: list candidate causes under Manpower, Method, Machine, Material, Measurement, Environment.",
      },
    ],
    templatePath: "/fishbone-diagram-template/",
  },
  {
    id: "incident-report",
    label: "Incident report",
    shortLabel: "Incident",
    description:
      "Operational incident record: detection, impact, response, recovery, and follow-ups.",
    tags: ["incident"],
    currentFocus: "Stabilize impact first, then preserve the response timeline.",
    scratchpad:
      "Detection:\nImpact:\nCommunication log:\nRecovery steps:\nFollow-ups:",
    hypotheses: ["Trigger / precipitating event"],
    tasks: [
      "Record detection time and reporter",
      "Document customer / business impact",
      "Capture response actions in order",
      "Note recovery validation",
      "List follow-up owners and dates",
    ],
    entries: [
      {
        type: "Observation",
        content:
          "Incident summary: service, severity, start time, and current status.",
      },
      {
        type: "Action",
        content: "Initial response / mitigation taken.",
      },
    ],
    templatePath: "/incident-report-template/",
  },
];

export function blueprintById(id: string | null | undefined): Blueprint {
  return BLUEPRINTS.find((item) => item.id === id) || BLUEPRINTS[0];
}

/** Read a method deep-link from query (`?method=rca`) or hash (`#method=rca`). */
export function parseMethodParam(
  search = typeof location !== "undefined" ? location.search : "",
  hash = typeof location !== "undefined" ? location.hash : "",
): BlueprintId | null {
  const fromQuery = new URLSearchParams(search).get("method");
  if (fromQuery && BLUEPRINTS.some((item) => item.id === fromQuery))
    return fromQuery as BlueprintId;
  const hashValue = hash.replace(/^#/, "");
  if (hashValue.startsWith("method=")) {
    const id = hashValue.slice("method=".length);
    if (BLUEPRINTS.some((item) => item.id === id)) return id as BlueprintId;
  }
  const hashParams = new URLSearchParams(hashValue.includes("=") ? hashValue : "");
  const fromHash = hashParams.get("method");
  if (fromHash && BLUEPRINTS.some((item) => item.id === fromHash))
    return fromHash as BlueprintId;
  return null;
}

export function methodDeepLink(id: BlueprintId): string {
  return id === "blank" ? "/" : `/?method=${id}`;
}
