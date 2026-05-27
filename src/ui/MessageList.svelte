<script lang="ts">
  import { onMount, afterUpdate, onDestroy } from "svelte";
  import {
    MarkdownRenderer,
    Component,
    Menu,
    Notice,
    type App,
  } from "obsidian";
  import type {
    ChatMessage,
    ModelEntity,
    SearchMode,
    SourceNode,
    StageData,
  } from "../types";
  import { AI_MODELS } from "../types";
  import { createEventDispatcher } from "svelte";
  import SourcesTable from "./SourcesTable.svelte";
  import ThinkingPanel from "./ThinkingPanel.svelte";
  import SuggestedFollowUps from "./SuggestedFollowUps.svelte";
  import { copyToClipboard } from "../utils/clipboard";

  /** Escape HTML special characters to prevent XSS */
  function escapeHtml(str: string): string {
    return str.replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c] ?? c,
    );
  }

  /** Validate URL has safe protocol (http/https only) */
  function isSafeUrl(url: string): boolean {
    return /^https?:\/\//i.test(url);
  }

  export let messages: ChatMessage[] = [];
  export let isLoading = false;
  export let currentResponse = "";
  export let app: App;
  export let searchMode: SearchMode = "files";
  export let userName: string = "";
  export let models: ModelEntity[] = AI_MODELS;
  /** Live stage data + generating flag forwarded to ThinkingPanel for the in-flight assistant message. */
  export let liveStage: StageData | null = null;
  export let liveGeneratingStarted: boolean = false;
  export let liveAssistantId: string | null = null;

  /** Get user initials from name for avatar (e.g., "Shirayuki Nekomata" → "SN") */
  function getUserInitials(name: string): string {
    if (!name) return "U";
    // Split by whitespace to get words
    const words = name.trim().split(/\s+/).filter(Boolean);
    if (words.length >= 2) {
      // Take first letter of first and last word
      return (words[0][0] + words[words.length - 1][0]).toUpperCase();
    }
    if (words.length === 1 && words[0].length >= 2) {
      // Single word - take first two letters
      return words[0].slice(0, 2).toUpperCase();
    }
    return "U";
  }

  /**
   * Convert citation tokens to Obsidian footnote syntax with definitions.
   * Reusable for both copy and insert operations.
   */
  function convertCitationsToFootnotes(
    content: string,
    sources: SourceNode[] | undefined,
  ): string {
    if (!content) return content;

    // Track which citation numbers are used so we can generate footnote definitions
    const usedCitations = new Set<number>();

    const replacer = (match: string, num: string) => {
      const index = Number.parseInt(num, 10) - 1;
      usedCitations.add(index);
      // Use Obsidian footnote syntax: [^N]
      return `[^${num}]`;
    };

    // Handle both variants we see in responses: 【N†source】 and [N†source]
    const square = /\[(\d+)\s*†\s*source\s*\]/g;
    const curly = /【(\d+)\s*†\s*source\s*】/g;
    const curlyAny = /【(\d+)†[^】]*】/g;
    const squareAny = /\[(\d+)†[^\]]*\]/g;

    let result = content
      .replace(curly, replacer)
      .replace(square, replacer)
      .replace(curlyAny, replacer)
      .replace(squareAny, replacer);

    // B3: bare [N] markers (new backend format). Negative lookahead skips markdown links [label](url).
    result = result.replace(/\[(\d+)\](?!\()/g, (m, num) => {
      const idx = Number.parseInt(num, 10) - 1;
      if (!sources || idx < 0 || idx >= sources.length) return m;
      usedCitations.add(idx);
      return `[^${num}]`;
    });

    // Non-digit slot citations 【fileid†src】 / 【filename†src】 — map to sources index.
    result = result.replace(/【([^\d】][^†】]*)†[^】]*】/g, (m, slot) => {
      if (!sources?.length) return m;
      const idx = sources.findIndex(
        (x) =>
          x.fileid === slot ||
          x.filename === slot ||
          x.filename?.replace(/\.[^.]+$/, "") === slot,
      );
      if (idx < 0) return m;
      usedCitations.add(idx);
      return `[^${idx + 1}]`;
    });

    // Generate footnote definitions for used citations
    if (usedCitations.size > 0 && sources && sources.length > 0) {
      const footnotes: string[] = [];
      const sortedIndices = Array.from(usedCitations).sort((a, b) => a - b);

      for (const index of sortedIndices) {
        const num = index + 1;
        const source = sources[index];
        if (!source) {
          footnotes.push(`[^${num}]: Source not available`);
          continue;
        }

        if (source.filetype === "reference" && source.fileid) {
          // Obsidian internal link
          footnotes.push(`[^${num}]: [[${source.fileid}]]`);
        } else if (source.pdfUrl || source.url) {
          const url = source.pdfUrl || source.url;
          const title = source.filename || "Source";
          footnotes.push(`[^${num}]: [${title}](${url})`);
        } else {
          footnotes.push(`[^${num}]: ${source.filename || "Source"}`);
        }
      }

      if (footnotes.length > 0) {
        result += "\n\n" + footnotes.join("\n");
      }
    }

    return result;
  }

  /**
   * Convert citation tokens like 【12†source】 to clickable superscript links.
   * The number refers to the source index in the sources array.
   */
  function processCitationTokens(
    content: string,
    sources: import("../types").SourceNode[] | undefined,
  ): string {
    if (!content) return content;

    const markersBefore =
      (content.match(/【[^】]+】/g) || []).length +
      (content.match(/\[\d+\](?!\()/g) || []).length;
    // console.log("[Logically RA] processCitationTokens", {
    //   len: content.length,
    //   sources: sources?.length ?? 0,
    //   markersBefore,
    // });

    // B2: bare [N] markers first (new backend format). Negative lookahead skips markdown
    // links [label](url). Bounds-gate against sources length so prose like [citation needed]
    // is left as-is. Run before 【】 pass to avoid double-processing chip output.
    // Build a pill chip for a resolved source. idx is 1-based display number.
    const PILL =
      "display:inline-flex;align-items:center;height:20px;border-radius:10px;background:#ECEEED;" +
      "padding:2px 6px;font-size:11px;color:#080908;cursor:pointer;white-space:nowrap;" +
      "max-width:200px;overflow:hidden;vertical-align:middle;margin-left:2px;gap:2px;";
    const GLOBE_SVG =
      '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>';
    const CAP_SVG =
      '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0"><path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/></svg>';
    const BOOK_SVG =
      '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>';
    function srcIcon(filetype: string): string {
      if (filetype === "goog") return GLOBE_SVG;
      if (filetype === "semantic_scholar") return CAP_SVG;
      return BOOK_SVG;
    }
    function pillChip(
      src: import("../types").SourceNode,
      displayIdx: number,
    ): string {
      const icon = srcIcon(src.filetype ?? "");
      const title = escapeHtml(src.filename || `Source ${displayIdx}`);
      const url = src.pdfUrl || src.url;
      const inner = `${icon}<span style="overflow:hidden;text-overflow:ellipsis;">${title}</span>`;
      const chip = `<span class="ra-citation-link" data-src-idx="${displayIdx}" style="${PILL}" title="${title}">${inner}</span>`;
      if (url && isSafeUrl(url)) {
        return `<a href="${escapeHtml(url)}" target="_blank" rel="noopener" style="text-decoration:none;">${chip}</a>`;
      }
      return chip;
    }

    let processed = content.replace(/\[(\d+)\](?!\()/g, (m, num) => {
      const idx = parseInt(num, 10) - 1;
      if (!sources || idx < 0 || idx >= sources.length) return m;
      return pillChip(sources[idx], parseInt(num, 10));
    });

    // Match citation tokens: 【N†source】 or 【N†...】
    processed = processed.replace(/【(\d+)†[^】]*】/g, (match, num) => {
      const index = parseInt(num, 10) - 1;
      const source = sources?.[index];
      if (source) return pillChip(source, parseInt(num, 10));
      return `<sup class="ra-citation-link">[${num}]</sup>`;
    });

    // Non-digit slot 【fileid†src】 / 【Welcome.md†source】 — resolve via sources lookup.
    processed = processed.replace(/【([^\d】][^†】]*)†[^】]*】/g, (m, slot) => {
      if (!sources?.length) return m;
      const s = sources.find(
        (x) =>
          x.fileid === slot ||
          x.filename === slot ||
          x.filename?.replace(/\.[^.]+$/, "") === slot,
      );
      if (!s) {
        return `<sup class="ra-citation-link" title="${escapeHtml(slot)}">[${escapeHtml(slot)}]</sup>`;
      }
      const displayIdx = sources.indexOf(s) + 1;
      return pillChip(s, displayIdx);
    });

    const markersAfter =
      (processed.match(/【[^】]+】/g) || []).length +
      (processed.match(/\[\d+\](?!\()/g) || []).length;
    // console.log("[Logically RA] processCitationTokens", {
    //   len: processed.length,
    //   sources: sources?.length ?? 0,
    //   markersAfter,
    // });

    return processed;
  }

  const dispatch = createEventDispatcher<{
    insertToNote: ChatMessage;
    deleteFromIndex: number;
    regenerate: number;
    copy: ChatMessage;
    openConnectNotes: void;
    selectFollowUp: string;
  }>();

  let listEl: HTMLElement;
  let renderedIds = new Set<string>();

  // Create a Component instance for MarkdownRenderer to avoid memory leaks
  let markdownComponent: Component;

  function getModelName(modelId: string | undefined): string {
    if (!modelId) return "AI";
    const model = models.find((m) => m.id === modelId);
    return model?.name || modelId;
  }

  function formatTime(timestamp: number): string {
    return new Date(timestamp).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  /**
   * Inject citation chips as real DOM nodes after MarkdownRenderer.render.
   * Obsidian sanitizes inline style= and SVGs, so chips must be DOM-built here.
   */
  function injectCitationChips(
    el: HTMLElement,
    sources: import("../types").SourceNode[] | undefined,
  ): void {
    if (!sources || sources.length === 0) return;

    const SVG_NS = "http://www.w3.org/2000/svg";

    function makeSvgIcon(src: import("../types").SourceNode): SVGSVGElement {
      const filetype = src.filetype ?? "";
      const toolType = (src as { toolType?: string }).toolType ?? "";
      const isWeb = filetype === "goog" || toolType === "search_web";
      const isAcademic =
        filetype === "semantic_scholar" || toolType === "search_academic";

      const svg = document.createElementNS(SVG_NS, "svg") as SVGSVGElement;
      svg.setAttribute("width", "12");
      svg.setAttribute("height", "12");
      svg.setAttribute("fill", "currentColor");
      (svg as unknown as HTMLElement).style.flexShrink = "0";

      const p = document.createElementNS(SVG_NS, "path");
      if (isWeb) {
        svg.setAttribute("viewBox", "0 0 12 12");
        p.setAttribute(
          "d",
          "M6 0.625C3.036 0.625 0.625 3.0365 0.625 6C0.625 8.9635 3.036 11.375 6 11.375C8.964 11.375 11.375 8.9635 11.375 6C11.375 3.0365 8.964 0.625 6 0.625ZM10.606 5.625H8.58099C8.51549 4.2535 8.09349 2.85601 7.36349 1.58051C9.13499 2.12851 10.4515 3.715 10.606 5.625ZM6.36501 1.39349C7.24301 2.69899 7.75449 4.18 7.83099 5.625H4.16901C4.24501 4.18 4.75699 2.69899 5.63499 1.39349C5.75599 1.38399 5.877 1.375 6 1.375C6.123 1.375 6.24451 1.38399 6.36501 1.39349ZM4.63651 1.58051C3.90651 2.85601 3.48451 4.2535 3.41901 5.625H1.394C1.5485 3.715 2.86501 2.12851 4.63651 1.58051ZM1.394 6.375H3.41901C3.48451 7.7465 3.90651 9.14399 4.63651 10.4195C2.86501 9.87149 1.5485 8.285 1.394 6.375ZM5.63499 10.6065C4.75699 9.30101 4.24551 7.82 4.16901 6.375H7.83099C7.75499 7.82 7.24301 9.30101 6.36501 10.6065C6.24401 10.616 6.123 10.625 6 10.625C5.877 10.625 5.75549 10.616 5.63499 10.6065ZM7.36349 10.4195C8.09349 9.14399 8.51549 7.7465 8.58099 6.375H10.606C10.4515 8.285 9.13499 9.87149 7.36349 10.4195Z",
        );
      } else if (isAcademic) {
        svg.setAttribute("viewBox", "0 0 24 24");
        p.setAttribute(
          "d",
          "M21.75 9.696C21.75 8.659 21.2059 7.74293 20.2959 7.24593L13.824 3.71492C12.683 3.09292 11.32 3.09192 10.176 3.71492L3.7041 7.24593C2.7941 7.74293 2.25 8.659 2.25 9.696C2.25 10.733 2.7941 11.649 3.7041 12.146L5.25 12.989V16.6989C5.25 17.6549 5.74004 18.533 6.56104 19.05C8.36603 20.185 10.183 20.753 12 20.753C13.817 20.753 15.635 20.186 17.439 19.05C18.259 18.534 18.75 17.6549 18.75 16.6989V12.989L20.25 12.171V16C20.25 16.414 20.586 16.75 21 16.75C21.414 16.75 21.75 16.414 21.75 16V9.99996C21.75 9.95796 21.7321 9.91996 21.7261 9.87996C21.7301 9.81696 21.75 9.76 21.75 9.696ZM17.25 16.6989C17.25 17.1289 17.0171 17.544 16.6411 17.78C13.5191 19.743 10.4841 19.744 7.36011 17.78C6.98411 17.544 6.75098 17.1289 6.75098 16.6989V13.807L10.177 15.676C10.748 15.988 11.374 16.144 12.001 16.144C12.628 16.144 13.254 15.988 13.825 15.676L17.251 13.807V16.6989H17.25ZM19.5769 10.8299L13.105 14.3609C12.414 14.7389 11.585 14.7389 10.894 14.3609L4.42212 10.8299C4.00012 10.5999 3.74902 10.177 3.74902 9.69698C3.74902 9.21698 4.00012 8.79392 4.42212 8.56392L10.894 5.03292C11.24 4.84492 11.62 4.74996 11.999 4.74996C12.378 4.74996 12.759 4.84492 13.104 5.03292L19.5759 8.56392C19.9979 8.79392 20.249 9.21698 20.249 9.69698C20.249 10.177 19.9989 10.5999 19.5769 10.8299Z",
        );
      } else {
        svg.setAttribute("viewBox", "0 0 24 24");
        p.setAttribute(
          "d",
          "M22.679 18.611L22.1631 16.1851V16.184V16.183L20.1001 6.47709C20.1001 6.47609 20.1001 6.47504 20.1001 6.47404C20.1001 6.47304 20.0991 6.47199 20.0991 6.47099L19.584 4.04606C19.438 3.36106 19.1291 2.86002 18.6631 2.55802C18.1971 2.25602 17.616 2.17506 16.929 2.32206L14.988 2.73502C14.363 2.86802 13.897 3.15206 13.594 3.54606C13.289 2.72206 12.554 2.25102 11.502 2.25102H9.50195C8.88095 2.25102 8.37895 2.42299 8.00195 2.72599C7.62495 2.42299 7.12295 2.25102 6.50195 2.25102H4.50195C3.09295 2.25102 2.25195 3.09202 2.25195 4.50102V19.501C2.25195 20.91 3.09295 21.751 4.50195 21.751H6.50195C7.12295 21.751 7.62495 21.579 8.00195 21.276C8.37895 21.579 8.88095 21.751 9.50195 21.751H11.502C12.911 21.751 13.752 20.91 13.752 19.501V7.69108L15.843 17.5251C15.843 17.5261 15.843 17.526 15.843 17.527C15.843 17.528 15.844 17.5281 15.844 17.5291L16.3601 19.954C16.5061 20.639 16.815 21.1401 17.281 21.4421C17.596 21.6471 17.9651 21.7491 18.3831 21.7491C18.5821 21.7491 18.7941 21.726 19.0161 21.678L20.957 21.2651C21.643 21.1191 22.1441 20.809 22.4451 20.344C22.7451 19.879 22.825 19.295 22.679 18.611ZM3.75 7.75004H7.25V16.25H3.75V7.75004ZM8.75 7.75004H12.25V16.25H8.75V7.75004ZM9.5 3.75004H11.5C12.089 3.75004 12.25 3.91104 12.25 4.50004V6.25004H8.75V4.50004C8.75 3.91104 8.911 3.75004 9.5 3.75004ZM4.5 3.75004H6.5C7.089 3.75004 7.25 3.91104 7.25 4.50004V6.25004H3.75V4.50004C3.75 3.91104 3.911 3.75004 4.5 3.75004ZM6.5 20.25H4.5C3.911 20.25 3.75 20.089 3.75 19.5V17.75H7.25V19.5C7.25 20.089 7.089 20.25 6.5 20.25ZM11.5 20.25H9.5C8.911 20.25 8.75 20.089 8.75 19.5V17.75H12.25V19.5C12.25 20.089 12.089 20.25 11.5 20.25ZM15.3989 8.23808L18.7881 7.51798L20.54 15.761L17.1521 16.481L15.3989 8.23808ZM15.2981 4.20109L17.24 3.788C17.337 3.767 17.4521 3.75004 17.5601 3.75004C17.6681 3.75004 17.77 3.76698 17.844 3.81498C17.993 3.91198 18.074 4.16309 18.115 4.35709L18.4751 6.05106L15.0859 6.77103L14.7261 5.07707C14.6071 4.51007 14.7291 4.32109 15.2981 4.20109ZM21.1851 19.528C21.0881 19.677 20.837 19.757 20.644 19.799C20.643 19.799 20.6431 19.799 20.6431 19.799L18.7009 20.2121C18.5079 20.2531 18.2449 20.2811 18.0969 20.1851C17.9479 20.0881 17.8669 19.837 17.8259 19.643L17.4661 17.949L20.854 17.229L21.2141 18.923C21.2531 19.117 21.2821 19.378 21.1851 19.528Z",
        );
      }
      svg.appendChild(p);
      return svg;
    }

    function makeChip(
      src: import("../types").SourceNode,
      displayIdx: number,
    ): HTMLElement {
      const chip = document.createElement("span");
      chip.className = "ra-citation-chip ra-citation-link";
      chip.setAttribute("data-src-idx", String(displayIdx));
      chip.style.display = "inline-flex";
      chip.style.alignItems = "center";
      chip.style.height = "18px";
      chip.style.borderRadius = "9px";
      chip.style.background = "var(--background-modifier-hover)";
      chip.style.border = "1px solid var(--background-modifier-border)";
      chip.style.padding = "1px 5px";
      chip.style.fontSize = "10px";
      chip.style.color = "var(--text-muted)";
      chip.style.cursor = "pointer";
      chip.style.whiteSpace = "nowrap";
      chip.style.maxWidth = "200px";
      chip.style.overflow = "hidden";
      chip.style.verticalAlign = "middle";
      chip.style.marginLeft = "2px";
      chip.style.gap = "3px";
      chip.addEventListener("mouseenter", () => {
        chip.style.background = "var(--background-modifier-active-hover)";
        chip.style.color = "var(--text-normal)";
      });
      chip.addEventListener("mouseleave", () => {
        chip.style.background = "var(--background-modifier-hover)";
        chip.style.color = "var(--text-muted)";
      });
      const title = src.filename || src.url || `Source ${displayIdx}`;
      chip.title = title;
      chip.appendChild(makeSvgIcon(src));
      const label = document.createElement("span");
      label.style.overflow = "hidden";
      label.style.textOverflow = "ellipsis";
      label.textContent = title.length > 22 ? title.slice(0, 20) + "…" : title;
      chip.appendChild(label);

      const url = src.pdfUrl || src.url;
      if (url && isSafeUrl(url)) {
        const a = document.createElement("a") as HTMLAnchorElement;
        a.href = url;
        a.target = "_blank";
        a.rel = "noopener";
        a.style.textDecoration = "none";
        a.appendChild(chip);
        return a;
      }
      return chip;
    }

    // Collect all text nodes once.
    const collectTextNodes = (): Text[] => {
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      const out: Text[] = [];
      let n: Node | null;
      while ((n = walker.nextNode())) out.push(n as Text);
      return out;
    };

    // Walk text nodes, replace [N], 【N†...】, and 【slot†...】 with chip elements.
    // Three capture groups: (1) digit from [N], (2) digit from 【N†】, (3) slot from 【slot†】
    const CITE_RE =
      /\[(\d+)\](?!\()|【(\d+)†[^】]*】|【([^\d】][^†】]*)†[^】]*】/g;

    for (const textNode of collectTextNodes()) {
      const text = textNode.nodeValue ?? "";
      if (!CITE_RE.test(text)) continue;
      CITE_RE.lastIndex = 0;

      const parent = textNode.parentNode;
      if (!parent) continue;

      const frag = document.createDocumentFragment();
      let last = 0;
      let m: RegExpExecArray | null;
      let anyMatch = false;

      while ((m = CITE_RE.exec(text)) !== null) {
        anyMatch = true;
        if (m.index > last) {
          frag.appendChild(document.createTextNode(text.slice(last, m.index)));
        }

        let idx = -1;
        if (m[1] !== undefined || m[2] !== undefined) {
          idx = parseInt(m[1] ?? m[2], 10) - 1;
        } else if (m[3] !== undefined) {
          const slot = m[3];
          idx = sources.findIndex(
            (x) =>
              x.fileid === slot ||
              x.filename === slot ||
              x.filename?.replace(/\.[^.]+$/, "") === slot,
          );
        }

        if (idx >= 0 && sources[idx]) {
          frag.appendChild(makeChip(sources[idx], idx + 1));
        }
        // OOB or unresolved: drop token silently (no raw text left in DOM)

        last = m.index + m[0].length;
      }

      if (!anyMatch) continue;
      if (last < text.length) {
        frag.appendChild(document.createTextNode(text.slice(last)));
      }
      parent.replaceChild(frag, textNode);
    }
  }

  async function renderMarkdown(
    el: HTMLElement,
    content: string,
    sources?: import("../types").SourceNode[],
  ) {
    el.empty();
    try {
      // Convert [N] to 【N†cite】 before rendering so Obsidian's markdown parser
      // doesn't consume them as footnote references. 【】 are not markdown syntax
      // and survive the renderer intact as plain text nodes for injectCitationChips.
      const prepared = sources?.length
        ? content.replace(/\[(\d+)\](?!\()/g, (_m, n) => `【${n}†cite】`)
        : content;
      await MarkdownRenderer.render(app, prepared, el, "", markdownComponent);
      injectCitationChips(el, sources);
    } catch (e) {
      console.warn("[MessageList] Markdown render error:", e);
      el.textContent = content;
    }
  }

  function handleInsertToNote(message: ChatMessage) {
    dispatch("insertToNote", message);
  }

  function handleDelete(index: number) {
    dispatch("deleteFromIndex", index);
  }

  function handleRegenerate(index: number) {
    dispatch("regenerate", index);
  }

  function handleOpenConnectNotes() {
    dispatch("openConnectNotes");
  }

  function showCopyPopover(event: MouseEvent, message: ChatMessage) {
    const menu = new Menu();
    menu.addItem((item) =>
      item
        .setTitle("Copy with footnotes")
        .setIcon("copy")
        .onClick(async () => {
          const content = convertCitationsToFootnotes(
            message.content || "",
            message.sources,
          );
          const ok = await copyToClipboard(content);
          new Notice(ok ? "Copied to clipboard" : "Failed to copy");
        }),
    );
    menu.addItem((item) =>
      item
        .setTitle("Copy without citations")
        .setIcon("copy")
        .onClick(async () => {
          const content = (message.content || "").replace(
            /【[^】]+†[^】]*】/g,
            "",
          );
          const ok = await copyToClipboard(content);
          new Notice(ok ? "Copied to clipboard" : "Failed to copy");
        }),
    );
    menu.showAtMouseEvent(event);
  }

  function handleContextMenu(
    event: MouseEvent,
    message: ChatMessage,
    index: number,
  ) {
    event.preventDefault();
    const menu = new Menu();

    if (message.role === "user") {
      menu.addItem((item) =>
        item
          .setTitle("Delete")
          .setIcon("trash-2")
          .onClick(() => handleDelete(index)),
      );
    } else if (message.content) {
      menu.addItem((item) =>
        item
          .setTitle("Insert into note")
          .setIcon("file-plus")
          .onClick(() => handleInsertToNote(message)),
      );
      menu.addItem((item) =>
        item
          .setTitle("Copy with footnotes")
          .setIcon("copy")
          .onClick(async () => {
            const content = convertCitationsToFootnotes(
              message.content || "",
              message.sources,
            );
            const ok = await copyToClipboard(content);
            new Notice(ok ? "Copied to clipboard" : "Failed to copy");
          }),
      );
      menu.addItem((item) =>
        item
          .setTitle("Copy without citations")
          .setIcon("copy")
          .onClick(async () => {
            const content = (message.content || "").replace(
              /【[^】]+†[^】]*】/g,
              "",
            );
            const ok = await copyToClipboard(content);
            new Notice(ok ? "Copied to clipboard" : "Failed to copy");
          }),
      );
      menu.addItem((item) =>
        item
          .setTitle("Regenerate")
          .setIcon("refresh-cw")
          .onClick(() => handleRegenerate(index)),
      );
    }

    menu.showAtMouseEvent(event);
  }

  function isNearBottom(): boolean {
    if (!listEl) return true;
    const threshold = 100; // pixels from bottom
    return (
      listEl.scrollHeight - listEl.scrollTop - listEl.clientHeight < threshold
    );
  }

  function scrollToBottom() {
    if (listEl && isNearBottom()) {
      listEl.scrollTop = listEl.scrollHeight;
    }
  }

  async function renderAssistantMessages() {
    if (!listEl) return;

    for (const msg of messages) {
      if (msg.role !== "assistant") continue;

      const contentEl = listEl.querySelector(
        `[data-msg-id="${msg.id}"] .message-content`,
      ) as HTMLElement;
      if (!contentEl) continue;

      // Include sources in the content hash for re-render check
      const sourcesHash = msg.sources
        ? msg.sources.length +
          "|" +
          (msg.sources[0]?.url ??
            msg.sources[0]?.fileid ??
            msg.sources[0]?.filename ??
            "")
        : "0";
      const contentKey = `${msg.content}|${sourcesHash}`;
      const currentContent = contentEl.getAttribute("data-content");
      if (currentContent !== contentKey) {
        await renderMarkdown(contentEl, msg.content || "...", msg.sources);
        contentEl.setAttribute("data-content", contentKey);
      }
    }
  }

  afterUpdate(() => {
    renderAssistantMessages();
    scrollToBottom();
  });

  onMount(() => {
    // Create component for markdown rendering
    markdownComponent = new Component();
    markdownComponent.load();

    renderAssistantMessages();
    scrollToBottom();
  });

  onDestroy(() => {
    // Clean up component
    if (markdownComponent) {
      markdownComponent.unload();
    }
  });
</script>

<div class="message-list" bind:this={listEl}>
  {#if messages.length === 0 && !isLoading}
    <div class="empty-state">
      <div class="empty-icon">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="48"
          height="48"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
        >
          <path
            d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"
          ></path>
          <path d="M8 10h.01"></path>
          <path d="M12 10h.01"></path>
          <path d="M16 10h.01"></path>
        </svg>
      </div>
      <h3 class="empty-title">Start a conversation</h3>
      <p class="empty-desc">
        Ask me about your research, summarize papers, or explore topics.
      </p>
      {#if searchMode === "files"}
        <button
          type="button"
          class="file-hint"
          on:click={handleOpenConnectNotes}
          title="Connect vault notes to library"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </svg>
          <span>Connect vault notes to your library</span>
        </button>
      {/if}
    </div>
  {:else}
    {#each messages as message, index (message.id)}
      <!-- svelte-ignore a11y-no-static-element-interactions -->
      <div
        class="message-row"
        class:user={message.role === "user"}
        class:assistant={message.role === "assistant"}
        data-msg-id={message.id}
        on:contextmenu={(e) => handleContextMenu(e, message, index)}
      >
        <!-- Avatar -->
        <div
          class="message-avatar"
          class:user-avatar={message.role === "user"}
          class:assistant-avatar={message.role === "assistant"}
        >
          {#if message.role === "user"}
            <span class="avatar-initials">{getUserInitials(userName)}</span>
          {:else}
            <!-- Logically logo for assistant -->
            <svg class="logically-logo" viewBox="0 0 25 26" fill="currentColor">
              <circle cx="17.4406" cy="7.44062" r="3.44062" />
              <path
                fill-rule="evenodd"
                clip-rule="evenodd"
                d="M8.404 21.2031C6.86245 21.2031 6.09168 21.2031 5.50289 20.9031C4.98497 20.6392 4.5639 20.2181 4.3 19.7002C4 19.1114 4 18.3407 4 16.7991V8.12875C4 7.48947 4 7.16984 4.04236 6.90239C4.27554 5.43017 5.43017 4.27554 6.90239 4.04236C7.16984 4 7.48947 4 8.12875 4C8.76802 4 9.08765 4 9.3551 4.04236C10.8273 4.27554 11.982 5.43017 12.2151 6.90239C12.2575 7.16984 12.2575 7.48947 12.2575 8.12875V12.9455H17.073C17.7123 12.9455 18.0319 12.9455 18.2994 12.9879C19.7716 13.2211 20.9262 14.3757 21.1594 15.8479C21.2017 16.1154 21.2017 16.435 21.2017 17.0743C21.2017 17.7136 21.2017 18.0332 21.1594 18.3006C20.9262 19.7729 19.7716 20.9275 18.2994 21.1607C18.0319 21.203 17.7123 21.203 17.073 21.203H12.2575V21.2031H8.404ZM10.8807 12.9455H10.8799V19.8262H6.75195L6.75195 7.43993C6.75195 6.29981 7.6762 5.37556 8.81633 5.37556C9.95645 5.37556 10.8807 6.29981 10.8807 7.43994V12.9455ZM12.2575 19.8272H17.7589C18.899 19.8272 19.8233 18.903 19.8233 17.7628C19.8233 16.6227 18.899 15.6985 17.7589 15.6985H12.2575V19.8272Z"
              />
            </svg>
          {/if}
        </div>
        <!-- Message content -->
        <div class="message">
          <div class="message-header">
            <span class="message-sender"
              >{message.role === "user"
                ? "You"
                : getModelName(message.model)}</span
            >
            <span class="message-time">{formatTime(message.timestamp)}</span>
          </div>
          <!-- RA v2 thinking panel (live shimmer / frozen "Thought for Ns" + StepList). -->
          {#if message.role === "assistant" && (message.reasoning || (isLoading && index === messages.length - 1))}
            <ThinkingPanel
              reasoning={message.reasoning}
              isLive={isLoading && index === messages.length - 1}
              liveStage={message.id === liveAssistantId ? liveStage : null}
              liveGeneratingStarted={message.id === liveAssistantId
                ? liveGeneratingStarted
                : false}
            />
          {/if}
          <div class="message-content">
            {#if message.role === "user"}
              {message.content || "..."}
            {:else}
              <!-- Rendered via MarkdownRenderer -->
            {/if}
          </div>
          <!-- Sources table for assistant messages with citations -->
          {#if message.role === "assistant" && message.sources && message.sources.length > 0}
            <SourcesTable sources={message.sources} {app} />
          {/if}
          {#if message.role === "assistant" && message.suggestQuestions && message.suggestQuestions.length > 0}
            <SuggestedFollowUps
              questions={message.suggestQuestions}
              disabled={isLoading}
              on:select={(e) => dispatch("selectFollowUp", e.detail)}
            />
          {/if}
          <!-- Action buttons at bottom-right -->
          <div class="message-actions">
            {#if message.role === "user"}
              <button
                type="button"
                class="action-btn action-btn-danger"
                on:click={() => handleDelete(index)}
                title="Delete this message and all below"
                disabled={isLoading}
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path
                    d="M12.25 3.0625H10.1739C9.64833 3.0625 9.62617 2.996 9.48209 2.56433L9.36425 2.21025C9.18516 1.67358 8.68525 1.3125 8.11942 1.3125H5.88058C5.31475 1.3125 4.81425 1.673 4.63575 2.21025L4.51792 2.56433C4.37383 2.99658 4.35167 3.0625 3.82608 3.0625H1.75C1.5085 3.0625 1.3125 3.2585 1.3125 3.5C1.3125 3.7415 1.5085 3.9375 1.75 3.9375H2.50716L2.95458 10.6452C3.04092 11.9432 3.83659 12.6875 5.13742 12.6875H8.86317C10.1634 12.6875 10.9591 11.9432 11.046 10.6452L11.4934 3.9375H12.25C12.4915 3.9375 12.6875 3.7415 12.6875 3.5C12.6875 3.2585 12.4915 3.0625 12.25 3.0625ZM5.46583 2.48675C5.52591 2.30767 5.69216 2.1875 5.88058 2.1875H8.11942C8.30784 2.1875 8.47467 2.30767 8.53417 2.48675L8.652 2.84083C8.67767 2.91725 8.70333 2.99133 8.73133 3.0625H5.2675C5.2955 2.99075 5.32175 2.91666 5.34742 2.84083L5.46583 2.48675ZM10.1722 10.5869C10.1168 11.4228 9.70025 11.8125 8.86258 11.8125H5.13683C4.29917 11.8125 3.88325 11.4234 3.82725 10.5869L3.38392 3.9375H3.8255C3.89842 3.9375 3.95908 3.92992 4.02442 3.92525C4.04425 3.92817 4.06233 3.9375 4.08275 3.9375H9.91608C9.93708 3.9375 9.95458 3.92817 9.97442 3.92525C10.0397 3.92992 10.1004 3.9375 10.1733 3.9375H10.6149L10.1722 10.5869ZM8.60417 6.41667V9.33333C8.60417 9.57483 8.40817 9.77083 8.16667 9.77083C7.92517 9.77083 7.72917 9.57483 7.72917 9.33333V6.41667C7.72917 6.17517 7.92517 5.97917 8.16667 5.97917C8.40817 5.97917 8.60417 6.17517 8.60417 6.41667ZM6.27083 6.41667V9.33333C6.27083 9.57483 6.07483 9.77083 5.83333 9.77083C5.59183 9.77083 5.39583 9.57483 5.39583 9.33333V6.41667C5.39583 6.17517 5.59183 5.97917 5.83333 5.97917C6.07483 5.97917 6.27083 6.17517 6.27083 6.41667Z"
                    fill="currentColor"
                  />
                </svg>
              </button>
            {:else if message.content}
              <button
                type="button"
                class="action-btn"
                on:click={() => handleInsertToNote(message)}
                title="Insert into active note"
                disabled={isLoading}
              >
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                  <path
                    fill-rule="evenodd"
                    clip-rule="evenodd"
                    d="M1.78906 4.41451C1.78906 2.52873 3.31779 1 5.20358 1H10.9527C12.0523 1 12.9445 1.88831 12.9508 2.9865C13.9065 3.59171 14.541 4.65843 14.541 5.87336V8.99994H13.4588V5.87336C13.4588 4.58525 12.4146 3.54104 11.1265 3.54104H6.87336C5.58526 3.54104 4.54104 4.58525 4.54104 5.87336V12.1265C4.54104 13.4146 5.58526 14.4588 6.87336 14.4588H8.99994V15.541H6.87336C5.48984 15.541 4.29851 14.7182 3.76205 13.5352C2.66699 13.5033 1.78906 12.6056 1.78906 11.5028V4.41451ZM10.9527 2.0822C11.2799 2.0822 11.567 2.25376 11.729 2.51183C11.5334 2.47701 11.3321 2.45884 11.1265 2.45884H6.87336C4.98758 2.45884 3.45885 3.98757 3.45885 5.87336V12.1265C3.45885 12.2138 3.46212 12.3003 3.46855 12.3859C3.11848 12.2455 2.87126 11.903 2.87126 11.5028V4.41451C2.87126 3.12641 3.91547 2.0822 5.20358 2.0822H10.9527ZM6.39666 5.67008C6.09884 5.67008 5.85742 5.91151 5.85742 6.20932C5.85742 6.50714 6.09884 6.74857 6.39666 6.74857H11.6852C11.983 6.74857 12.2244 6.50714 12.2244 6.20932C12.2244 5.91151 11.983 5.67008 11.6852 5.67008H6.39666ZM5.85742 8.73114C5.85742 8.43333 6.09884 8.1919 6.39666 8.1919H10.7252V9.27039H6.39666C6.09884 9.27039 5.85742 9.02896 5.85742 8.73114ZM6.39666 10.7028C6.09884 10.7028 5.85742 10.9442 5.85742 11.242C5.85742 11.5398 6.09884 11.7813 6.39666 11.7813H8.99822V10.7028H6.39666Z"
                    fill="currentColor"
                  />
                  <path
                    fill-rule="evenodd"
                    clip-rule="evenodd"
                    d="M13.1874 10.0156C13.1874 9.73948 12.9635 9.51562 12.6874 9.51562C12.4112 9.51562 12.1874 9.73948 12.1874 10.0156V12.0864H10.1133C9.83714 12.0864 9.61328 12.3103 9.61328 12.5864C9.61328 12.8626 9.83714 13.0864 10.1133 13.0864H12.1874V15.1581C12.1874 15.4342 12.4112 15.6581 12.6874 15.6581C12.9635 15.6581 13.1874 15.4342 13.1874 15.1581V13.0864H15.2557C15.5319 13.0864 15.7557 12.8626 15.7557 12.5864C15.7557 12.3103 15.5319 12.0864 15.2557 12.0864H13.1874V10.0156Z"
                    fill="currentColor"
                  />
                </svg>
              </button>
              <button
                type="button"
                class="action-btn"
                on:click={(e) => showCopyPopover(e, message)}
                title="Copy response"
                disabled={isLoading}
              >
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                  <path
                    d="M13.3333 6H7.33333C6.59695 6 6 6.59695 6 7.33333V13.3333C6 14.0697 6.59695 14.6667 7.33333 14.6667H13.3333C14.0697 14.6667 14.6667 14.0697 14.6667 13.3333V7.33333C14.6667 6.59695 14.0697 6 13.3333 6Z"
                    stroke="currentColor"
                    stroke-width="1.2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  />
                  <path
                    d="M3.33333 10H2.66667C2.31304 10 1.97391 9.85952 1.72386 9.60947C1.47381 9.35943 1.33333 9.0203 1.33333 8.66667V2.66667C1.33333 2.31304 1.47381 1.97391 1.72386 1.72386C1.97391 1.47381 2.31304 1.33333 2.66667 1.33333H8.66667C9.0203 1.33333 9.35943 1.47381 9.60947 1.72386C9.85952 1.97391 10 2.31304 10 2.66667V3.33333"
                    stroke="currentColor"
                    stroke-width="1.2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  />
                </svg>
              </button>
              <button
                type="button"
                class="action-btn"
                on:click={() => handleRegenerate(index)}
                title="Regenerate response"
                disabled={isLoading}
              >
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                  <path
                    d="M2.5 8.33351C2.5 8.83618 2.6167 9.32077 2.84603 9.7741C2.97136 10.0208 2.87198 10.3215 2.62598 10.4461C2.55398 10.4828 2.47597 10.5002 2.40063 10.5002C2.21797 10.5002 2.04202 10.4003 1.95402 10.2263C1.65735 9.64025 1.5 8.98551 1.5 8.33351C1.5 5.88018 3.21333 4.16685 5.66667 4.16685H10.126L9.646 3.68686C9.45066 3.49153 9.45066 3.17484 9.646 2.97951C9.84133 2.78417 10.158 2.78417 10.3534 2.97951L11.6867 4.31284C11.7327 4.35884 11.7693 4.41411 11.7947 4.47544C11.8453 4.59744 11.8453 4.73544 11.7947 4.85744C11.7693 4.91877 11.7327 4.9742 11.6867 5.0202L10.3534 6.35353C10.256 6.45086 10.128 6.50018 10 6.50018C9.872 6.50018 9.74398 6.45153 9.64665 6.35353C9.45131 6.1582 9.45131 5.84151 9.64665 5.64617L10.1266 5.16619H5.66732C3.47932 5.16686 2.5 6.75751 2.5 8.33351ZM14.046 6.44077C13.9213 6.19477 13.6207 6.09488 13.374 6.22088C13.128 6.34555 13.0286 6.64625 13.154 6.89292C13.3833 7.34625 13.5 7.83085 13.5 8.33351C13.5 9.90951 12.5207 11.5002 10.3333 11.5002H5.87402L6.354 11.0202C6.54934 10.8249 6.54934 10.5082 6.354 10.3128C6.15867 10.1175 5.84198 10.1175 5.64665 10.3128L4.31331 11.6462C4.11798 11.8415 4.11798 12.1582 4.31331 12.3535L5.64665 13.6869C5.74398 13.7842 5.872 13.8335 6 13.8335C6.128 13.8335 6.25602 13.7849 6.35335 13.6869C6.54869 13.4915 6.54869 13.1748 6.35335 12.9795L5.87337 12.4995H10.3327C12.786 12.4995 14.4993 10.7862 14.4993 8.33286C14.5 7.68153 14.3433 7.02677 14.046 6.44077Z"
                    fill="currentColor"
                  />
                </svg>
              </button>
            {/if}
          </div>
        </div>
      </div>
    {/each}

    {#if isLoading && !messages.find((m) => m.content === currentResponse)}
      <div class="message assistant loading">
        <div class="message-header">
          <span class="message-sender">AI</span>
        </div>
        <div class="message-content">
          {#if currentResponse}
            {currentResponse}
          {:else}
            <div class="typing-indicator">
              <span></span>
              <span></span>
              <span></span>
            </div>
          {/if}
        </div>
      </div>
    {/if}
  {/if}
</div>

<style>
  .message-list {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 4px;
    overflow-y: auto;
    padding: 4px 0;
    min-height: 0;
    position: relative;
  }

  .empty-state {
    /* Override Obsidian's default .empty-state which has position:absolute */
    position: static !important;
    width: auto !important;
    height: auto !important;
    inset: auto !important;
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
    padding: 40px 20px;
    color: var(--text-muted);
  }

  .empty-icon {
    margin-bottom: 16px;
    opacity: 0.5;
  }

  .empty-title {
    font-size: 16px;
    font-weight: 600;
    color: var(--text-normal);
    margin: 0 0 8px 0;
  }

  .empty-desc {
    font-size: 13px;
    margin: 0;
    max-width: 280px;
    line-height: 1.5;
  }

  .file-hint {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-top: 16px;
    padding: 8px 12px;
    background: var(--background-secondary);
    border: 1px dashed var(--background-modifier-border);
    border-radius: 8px;
    font-size: 12px;
    color: var(--text-muted);
    cursor: pointer;
    font-family: inherit;
  }

  .file-hint:hover {
    background: var(--background-modifier-hover);
    color: var(--text-normal);
  }

  .file-hint:focus-visible {
    outline: 2px solid var(--interactive-accent);
    outline-offset: 2px;
  }

  .file-hint svg {
    flex-shrink: 0;
    opacity: 0.7;
  }

  /* Message row with avatar + bubble layout */
  .message-row {
    display: flex;
    flex-direction: row;
    align-items: flex-start;
    gap: 8px;
    padding: 4px 0;
  }

  .message-row.user {
    flex-direction: row-reverse;
  }

  /* Avatar styling */
  .message-avatar {
    width: 28px;
    height: 28px;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    margin-top: 2px;
  }

  .user-avatar {
    background: var(--interactive-accent);
  }

  .avatar-initials {
    font-size: 11px;
    font-weight: 600;
    color: var(--text-on-accent);
    text-transform: uppercase;
    line-height: 1;
  }

  .assistant-avatar {
    background: var(--background-secondary);
    border: 1px solid var(--background-modifier-border);
  }

  .assistant-avatar .logically-logo {
    width: 18px;
    height: 18px;
    color: var(--text-normal);
  }

  /* Message bubble */
  .message {
    display: flex;
    flex-direction: column;
    max-width: 85%;
    padding: 8px 12px;
    border-radius: 12px;
    position: relative;
  }

  .message-row.user .message {
    background: var(--interactive-accent);
    color: var(--text-on-accent);
    border-bottom-right-radius: 4px;
  }

  .message-row.assistant .message {
    background: var(--background-secondary);
    border-bottom-left-radius: 4px;
  }

  .message-header {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 4px;
  }

  .message-sender {
    font-size: 12px;
    font-weight: 600;
    line-height: 1;
  }

  .message-row.user .message-sender {
    color: var(--text-on-accent);
  }

  .message-row.assistant .message-sender {
    color: var(--text-normal);
  }

  .message-time {
    font-size: 10px;
    line-height: 1;
    opacity: 0.6;
  }

  .message-actions {
    display: flex;
    gap: 2px;
    margin-top: 6px;
    opacity: 0.5;
    transition: opacity 0.15s ease;
  }

  .message-row:hover .message-actions {
    opacity: 1;
  }

  .message-row.user .message-actions {
    justify-content: flex-start;
  }

  .message-row.assistant .message-actions {
    justify-content: flex-end;
  }

  .action-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 22px;
    height: 22px;
    padding: 0;
    background: transparent;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    opacity: 0.6;
    transition: all 0.15s ease;
  }

  .message-row.user .action-btn {
    color: var(--text-on-accent);
  }

  .message-row.assistant .action-btn {
    color: var(--text-normal);
  }

  .action-btn:hover:not(:disabled) {
    opacity: 1;
    background: rgba(0, 0, 0, 0.1);
  }

  .action-btn:disabled {
    opacity: 0.3;
    cursor: not-allowed;
  }

  .action-btn-danger:hover:not(:disabled) {
    color: var(--text-error);
    background: rgba(var(--color-red-rgb), 0.15);
  }

  .message-content {
    font-size: 14px;
    line-height: 1.5;
    word-break: break-word;
    white-space: normal;
  }

  .message-row.user .message-content {
    white-space: pre-wrap;
  }

  /* Markdown content styling */
  .message-row.assistant .message-content :global(p) {
    margin: 0 0 8px 0;
  }

  .message-row.assistant .message-content :global(p:last-child) {
    margin-bottom: 0;
  }

  .message-row.assistant .message-content :global(pre) {
    background: var(--background-primary);
    border-radius: 6px;
    padding: 10px;
    overflow-x: auto;
    margin: 8px 0;
    font-size: 13px;
  }

  .message-row.assistant .message-content :global(code) {
    background: var(--background-primary);
    padding: 2px 4px;
    border-radius: 3px;
    font-size: 13px;
  }

  .message-row.assistant .message-content :global(pre code) {
    background: none;
    padding: 0;
  }

  .message-row.assistant .message-content :global(ul),
  .message-row.assistant .message-content :global(ol) {
    margin: 8px 0;
    padding-left: 20px;
  }

  .message-row.assistant .message-content :global(li) {
    margin: 4px 0;
  }

  .message-row.assistant .message-content :global(h1),
  .message-row.assistant .message-content :global(h2),
  .message-row.assistant .message-content :global(h3),
  .message-row.assistant .message-content :global(h4) {
    margin: 12px 0 8px 0;
    font-weight: 600;
  }

  .message-row.assistant .message-content :global(h1) {
    font-size: 18px;
  }
  .message-row.assistant .message-content :global(h2) {
    font-size: 16px;
  }
  .message-row.assistant .message-content :global(h3) {
    font-size: 15px;
  }
  .message-row.assistant .message-content :global(h4) {
    font-size: 14px;
  }

  .message-row.assistant .message-content :global(blockquote) {
    border-left: 3px solid var(--text-muted);
    margin: 8px 0;
    padding-left: 12px;
    color: var(--text-muted);
  }

  .message-row.assistant .message-content :global(table) {
    border-collapse: collapse;
    margin: 8px 0;
    font-size: 13px;
  }

  .message-row.assistant .message-content :global(th),
  .message-row.assistant .message-content :global(td) {
    border: 1px solid var(--background-modifier-border);
    padding: 6px 10px;
  }

  .message-row.assistant .message-content :global(th) {
    background: var(--background-primary);
    font-weight: 600;
  }

  .typing-indicator {
    display: flex;
    gap: 4px;
    padding: 4px 0;
  }

  .typing-indicator span {
    width: 6px;
    height: 6px;
    background: var(--text-muted);
    border-radius: 50%;
    animation: typing 1.4s infinite ease-in-out;
  }

  .typing-indicator span:nth-child(1) {
    animation-delay: 0s;
  }
  .typing-indicator span:nth-child(2) {
    animation-delay: 0.2s;
  }
  .typing-indicator span:nth-child(3) {
    animation-delay: 0.4s;
  }

  @keyframes typing {
    0%,
    60%,
    100% {
      transform: translateY(0);
      opacity: 0.4;
    }
    30% {
      transform: translateY(-4px);
      opacity: 1;
    }
  }

  /* Citation link styling */
  .message-row.assistant .message-content :global(.ra-citation-link) {
    font-size: 10px;
    vertical-align: super;
    margin: 0 1px;
  }

  .message-row.assistant .message-content :global(.ra-citation-link a) {
    color: var(--interactive-accent);
    text-decoration: none;
    font-weight: 600;
    padding: 1px 3px;
    border-radius: 3px;
    background: var(--background-primary);
    transition: all 0.15s ease;
  }

  .message-row.assistant .message-content :global(.ra-citation-link a:hover) {
    background: var(--interactive-accent);
    color: var(--text-on-accent);
  }
</style>
