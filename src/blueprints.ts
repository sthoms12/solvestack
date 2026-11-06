export type BlueprintId =
  | "blank"
  | "rca"
  | "5-whys"
  | "fishbone"
  | "incident-report"
  | "vpn-outage"
  | "sign-in-failure"
  | "cert-expired"
  | "dns-failure"
  | "disk-full"
  | "email-delivery";

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
  /** "method" = a way of investigating; "incident" = a named failure to start from. */
  kind: "method" | "incident";
  label: string;
  shortLabel: string;
  description: string;
  tags: string[];
  currentFocus: string;
  scratchpad: string;
  /** Example "What's happening?" text shown as the start dialog placeholder. */
  exampleProblem?: string;
  hypotheses: string[];
  tasks: string[];
  entries: BlueprintEntrySeed[];
  /** Public template path that should deep-link here. */
  templatePath?: string;
};

export const BLUEPRINTS: Blueprint[] = [
  {
    id: "blank",
    kind: "method",
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
    kind: "method",
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
    kind: "method",
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
    kind: "method",
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
    kind: "method",
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
  {
    id: "vpn-outage",
    exampleProblem:
      "e.g. Remote staff can't connect to the VPN since about 09:00 — the gateway shows up, but no traffic passes.",
    kind: "incident",
    label: "VPN / remote access outage",
    shortLabel: "VPN outage",
    description:
      "Remote access failure: separate gateway, auth, and client faults by scope.",
    tags: ["vpn", "network"],
    currentFocus: "Restore access first; separate gateway, auth, and client faults.",
    scratchpad:
      "Gateway / concentrator:\nAffected scope (all users / site / client version):\nAuth path (IdP / MFA):\nLast change:",
    hypotheses: [
      "Gateway or ISP fault",
      "Auth / IdP-side failure (MFA, certificate, policy)",
      "Client-side break (update, configuration drift)",
    ],
    tasks: [
      "Confirm scope: one user, one site, or everyone",
      "Check gateway status and recent changes",
      "Test the auth path with a known-good account",
      "Rule out client version / OS update spread",
      "Capture provider or vendor status before escalating",
    ],
    entries: [
      {
        type: "Observation",
        content:
          "Scope check: who is affected, since when, and what changed last.",
      },
      {
        type: "Evidence",
        technicalType: "Error",
        content: "Gateway status / error output (paste the exact text).",
      },
    ],
    templatePath: "/vpn-outage-template/",
  },
  {
    id: "sign-in-failure",
    exampleProblem:
      "e.g. Several users get 'password incorrect' on the new SSO portal this morning, though their passwords haven't changed.",
    kind: "incident",
    label: "SSO / sign-in failure",
    shortLabel: "Sign-in failure",
    description:
      "Identity failure: find which side of the IdP to app boundary is broken.",
    tags: ["sso", "identity"],
    currentFocus:
      "Identify which side of the IdP to app boundary the failure lives on.",
    scratchpad:
      "App / service:\nIdP:\nError code shown:\nAffected (all / group / single user):\nMFA method:",
    hypotheses: [
      "IdP policy or conditional-access change",
      "App-side configuration (certificate, metadata, clock skew)",
      "Account state (locked, expired, MFA reset)",
    ],
    tasks: [
      "Capture the exact error and correlation / trace ID",
      "Test with a known-good account in the same policy scope",
      "Check IdP sign-in logs for the failure reason",
      "Verify the app certificate / metadata expiry",
      "Rule out device compliance or location policy",
    ],
    entries: [
      {
        type: "Evidence",
        technicalType: "Error",
        content: "Exact error text and trace ID from a failing sign-in.",
      },
      {
        type: "Note",
        content:
          "Scope: single user vs group vs everyone — test before theorizing.",
      },
    ],
    templatePath: "/sign-in-failure-template/",
  },
  {
    id: "cert-expired",
    exampleProblem:
      "e.g. The customer portal shows a certificate-expired warning in every browser, and visitors are bouncing.",
    kind: "incident",
    label: "Expired certificate / TLS failure",
    shortLabel: "Cert expired",
    description:
      "TLS failure: name the exact endpoint and chain link before renewing anything.",
    tags: ["tls", "certificate"],
    currentFocus:
      "Name the exact endpoint and chain link that fails before renewing anything.",
    scratchpad:
      "Endpoint / URL:\nCert subject + issuer:\nExpiry shown:\nChain (leaf / intermediate / root):\nRenewal owner:",
    hypotheses: [
      "Leaf certificate simply expired",
      "Chain incomplete after a renewal",
      "Client-side trust or clock problem",
    ],
    tasks: [
      "Record the browser / client TLS error verbatim",
      "Inspect the served chain (dates, issuer, SANs)",
      "Check for a renewed cert bound to the wrong site or service",
      "Verify client clock and trust store if only some clients fail",
      "Note the renewal owner and next expiry in the resolution",
    ],
    entries: [
      {
        type: "Evidence",
        technicalType: "Error",
        content: "TLS error text and the served certificate dates.",
      },
      {
        type: "Observation",
        content: "Who sees it: all clients, one browser, one network.",
      },
    ],
    templatePath: "/expired-certificate-template/",
  },
  {
    id: "dns-failure",
    exampleProblem:
      "e.g. Internal hostnames stopped resolving after last night's DNS change; IP addresses still work.",
    kind: "incident",
    label: "DNS resolution failure",
    shortLabel: "DNS failure",
    description:
      "Name resolution failure: prove which resolver and which record is wrong.",
    tags: ["dns", "network"],
    currentFocus:
      "Prove which resolver and which record is wrong before touching records.",
    scratchpad:
      "Name that fails:\nExpected answer:\nResolver(s) tested:\nRecord type:\nRecent DNS changes:",
    hypotheses: [
      "Record missing or wrong after a change",
      "Resolver-specific fault (cache, split-horizon, forwarding)",
      "Registrar / delegation problem",
    ],
    tasks: [
      "Query the failing name against internal and public resolvers",
      "Compare with the authoritative nameserver answer",
      "Check TTL and when the last change propagates",
      "Rule out split-horizon view differences",
      "Capture the exact resolver output as evidence",
    ],
    entries: [
      {
        type: "Evidence",
        technicalType: "Command output",
        content: "Resolver output for the failing name (internal vs public).",
      },
      {
        type: "Observation",
        content: "Scope: one name, one zone, or all resolution.",
      },
    ],
    templatePath: "/dns-failure-template/",
  },
  {
    id: "disk-full",
    exampleProblem:
      "e.g. The file server's data volume hit 100% overnight and the shares have gone read-only.",
    kind: "incident",
    label: "Disk full / storage exhaustion",
    shortLabel: "Disk full",
    description:
      "Storage exhaustion: stop the growth first, then find what grew.",
    tags: ["storage", "disk"],
    currentFocus:
      "Stop the growth first, then find what grew — deleting blind hides the cause.",
    scratchpad:
      "Host / volume:\nFirst alert time:\nGrowth rate:\nLargest directories:\nRetention / rotation in place:",
    hypotheses: [
      "Log or temp growth (rotation broken)",
      "Runaway process or dump files",
      "Genuine data growth past capacity",
    ],
    tasks: [
      "Record current free space and growth rate",
      "Identify the largest and fastest-growing paths before deleting",
      "Check log rotation and dump settings",
      "Free space safely (truncate / rotate, not blind delete)",
      "Set a prevention: alert threshold or rotation fix",
    ],
    entries: [
      {
        type: "Observation",
        content: "Volume, free space, and when it crossed the threshold.",
      },
      {
        type: "Evidence",
        technicalType: "Command output",
        content: "Top directories by size (command output).",
      },
    ],
    templatePath: "/disk-full-template/",
  },
  {
    id: "email-delivery",
    exampleProblem:
      "e.g. Invoices sent since Tuesday land in spam for Gmail recipients; other domains are fine.",
    kind: "incident",
    label: "Email delivery failure",
    shortLabel: "Email delivery",
    description:
      "Mail flow failure: follow one message end-to-end instead of 'email is down'.",
    tags: ["email", "dns"],
    currentFocus:
      "Follow one message end-to-end; 'email is down' is never the unit of failure.",
    scratchpad:
      "Sender to recipient:\nFailing direction (inbound / outbound):\nBounce code:\nSPF / DKIM / DMARC status:\nQueue / relay:",
    hypotheses: [
      "Authentication failure (SPF / DKIM / DMARC)",
      "Reputation or blocklist listing",
      "Queue / relay fault or recipient-side rejection",
    ],
    tasks: [
      "Get the exact bounce / NDR code for one message",
      "Trace that message through the queue / relay logs",
      "Verify SPF, DKIM, and DMARC for the sending domain",
      "Check blocklists if reputation is suspected",
      "Test a known-good external recipient to isolate direction",
    ],
    entries: [
      {
        type: "Evidence",
        technicalType: "Log",
        content: "Full bounce message / NDR for one failed email.",
      },
      {
        type: "Observation",
        content: "Direction and scope: one domain, one user, or everyone.",
      },
    ],
    templatePath: "/email-delivery-template/",
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
