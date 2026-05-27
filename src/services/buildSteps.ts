/**
 * Verbatim port of frontend RA v2 LoadingIndicator helpers/constants.
 * buildSteps re-derives the step list from a raw stage.data event log every
 * render — same code path as frontend so behaviour matches by construction.
 */
import type { AccumulatedStep, StepRef, StepRefs } from "../types";

export const SEARCHING_TOOL_LABELS: Record<string, string> = {
  search_library: "Discovering relevant sources in your library",
  search_web: "Searching the internet",
  search_academic: "Searching academic papers",
};

export const DONE_TOOL_LABELS: Record<string, string> = {
  search_library: "Discovered {{number-here}} sources from your library",
  search_web: "Discovered {{number-here}} sources from the internet",
  search_academic: "Discovered {{number-here}} academic papers",
};

export const NO_RESULTS_LABELS: Record<string, string> = {
  search_library: "No results found from your library",
  search_web: "No results found from the internet",
  search_academic: "No results found from academic databases",
};

export function extractDomain(url: string | undefined): string {
  if (!url) return "";
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function iconForTool(tool: string): StepRef["icon"] {
  if (tool === "search_library") return "file";
  if (tool === "search_academic") return "graduation";
  return "globe";
}

function domainLabelForTool(tool: string, url: string | undefined): string {
  if (tool === "search_library") return "Library";
  if (tool === "search_academic") return extractDomain(url) || "Academic";
  return extractDomain(url);
}

/**
 * Build StepRefs from a CITATION:<tool> payload (frontend verbatim).
 * metadatas shape: { [url|key]: [{ title?, toolType?, ... }, ...] }
 */
export function buildRefsFromCitation(payload: unknown): StepRefs | null {
  if (!payload || typeof payload !== "object") return null;
  const p = payload as Record<string, unknown>;
  const metadatas = p.metadatas;
  if (!metadatas || typeof metadatas !== "object") return null;
  const tool =
    (typeof p.tool === "string" ? p.tool : "") ||
    (typeof p.source_type === "string" ? p.source_type : "") ||
    "unknown";
  const data: StepRef[] = Object.entries(
    metadatas as Record<string, unknown>,
  ).map(([key, items]) => {
    let first: Record<string, unknown> = {};
    if (Array.isArray(items) && items.length > 0) {
      first = items[0] as Record<string, unknown>;
    } else if (items && typeof items === "object") {
      first = items as Record<string, unknown>;
    }
    const title =
      (first.title as string | undefined) ||
      (first.name as string | undefined) ||
      key;
    const url =
      (first.url as string | undefined) ||
      (tool === "search_library" ? undefined : key);
    return {
      title,
      url,
      domain: domainLabelForTool(tool, url ?? key),
      icon: iconForTool(tool),
    };
  });
  if (data.length === 0) return null;
  return { type: tool, data };
}

/**
 * Re-derive the step list from raw stage.data events + a generatingStarted flag.
 * Verbatim shape match with frontend buildSteps so identical inputs yield identical UI.
 */
export function buildSteps(
  data: Array<Record<string, unknown>>,
  generatingStarted: boolean,
): AccumulatedStep[] {
  const steps: AccumulatedStep[] = [];

  const reasonItem = data.find((d) => d.type === "reason");
  if (reasonItem) {
    const hasSearch = data.some((d) => d.type === "search_start");
    steps.push({
      key: "reason",
      label: (reasonItem.summary as string | undefined) ?? null,
      refs: null,
      reason: (reasonItem.reason as string | undefined) ?? null,
      summary: null,
      done: hasSearch || generatingStarted,
    });
  }

  // Build search step for a given tool (shared between decision-driven and fallback paths).
  const buildSearchStep = (tool: string, decisionSummary: string | null) => {
    const citationItem = data.find(
      (d) => d.type === "citation" && d.tool === tool,
    );
    const citationPayload = citationItem?.payload as
      | Record<string, unknown>
      | undefined;
    const metadatasCount = citationPayload?.metadatas
      ? Object.keys(citationPayload.metadatas as Record<string, unknown>).length
      : 0;
    const isDone = !!citationItem || generatingStarted;

    let label: string;
    if (metadatasCount > 0) {
      const template =
        DONE_TOOL_LABELS[tool] ?? "Found {{number-here}} results";
      label = template.replace("{{number-here}}", String(metadatasCount));
    } else if (isDone) {
      label = NO_RESULTS_LABELS[tool] ?? "No results found";
    } else {
      label = SEARCHING_TOOL_LABELS[tool] ?? "Searching...";
    }

    const refs = citationPayload
      ? buildRefsFromCitation({ ...citationPayload, tool })
      : null;

    steps.push({
      key: `search_${tool}`,
      label,
      refs,
      reason: null,
      summary: decisionSummary,
      done: isDone,
    });
  };

  // Collect tool_decisions in backend order (Map preserves insertion).
  const decisionsByTool = new Map<
    string,
    { summary: string | null; reason: string | null }
  >();
  for (const d of data) {
    if (d.type !== "tool_decision") continue;
    const tool = d.tool as string;
    if (!tool || decisionsByTool.has(tool)) continue;
    decisionsByTool.set(tool, {
      summary: (d.summary as string | undefined) ?? null,
      reason: (d.reason as string | undefined) ?? null,
    });
  }

  const emittedSearchTools = new Set<string>();

  // Emit each decision row, then its paired search step if search_start present.
  for (const [tool, dec] of decisionsByTool) {
    steps.push({
      key: `tool_decision_${tool}`,
      label: dec.summary,
      refs: null,
      reason: dec.reason,
      summary: null,
      done: true,
    });
    const hasSearchStart = data.some(
      (d) => d.type === "search_start" && d.tool === tool,
    );
    if (hasSearchStart) {
      emittedSearchTools.add(tool);
      buildSearchStep(tool, dec.summary);
    }
  }

  // Fallback: search_start without preceding tool_decision (rare).
  const seenSearchStarts = new Set<string>();
  for (const item of data) {
    if (item.type !== "search_start") continue;
    const tool = item.tool as string;
    if (!tool || seenSearchStarts.has(tool)) continue;
    seenSearchStarts.add(tool);
    if (emittedSearchTools.has(tool)) continue;
    buildSearchStep(tool, null);
  }

  if (generatingStarted) {
    return [
      ...steps.map((s) => ({ ...s, done: true })),
      {
        key: "verified_sources",
        label: "Verified sources",
        refs: null,
        reason: null,
        summary: null,
        done: true,
      },
    ];
  }
  return steps;
}
