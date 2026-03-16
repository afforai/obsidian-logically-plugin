import {
  type Extension,
  Prec,
  StateEffect,
  StateField,
} from "@codemirror/state";
import {
  Decoration,
  type DecorationSet,
  EditorView,
  type ViewUpdate,
  ViewPlugin,
  WidgetType,
  keymap,
} from "@codemirror/view";
import CHECK_ICON from "../assets/icons/check.svg";
import REFRESH_ICON from "../assets/icons/refresh.svg";
import LOADING_ICON from "../assets/icons/loading.svg";

// ── Effects ──────────────────────────────────────────────────────────
/** Set ghost text at a position, or clear it (null). */
export const setGhostText = StateEffect.define<{
  text: string;
  pos: number;
} | null>();

/** Toggle regenerating state for the current ghost text. */
export const setGhostRegenerating = StateEffect.define<boolean>();

// Module-level map: .cm-editor DOM → EditorView (set by ViewPlugin)
const editorViewMap = new WeakMap<Element, EditorView>();

function createSvgIcon(svg: string): SVGElement {
  const parser = new DOMParser();
  const parsed = parser.parseFromString(svg, "image/svg+xml");
  const root = parsed.documentElement;
  if (root.tagName.toLowerCase() === "svg") {
    return root as unknown as SVGElement;
  }

  const fallback = document.createElementNS(
    "http://www.w3.org/2000/svg",
    "svg",
  );
  fallback.setAttribute("width", "14");
  fallback.setAttribute("height", "14");
  fallback.setAttribute("viewBox", "0 0 24 24");
  return fallback;
}

// ── Widget ───────────────────────────────────────────────────────────
class GhostTextWidget extends WidgetType {
  constructor(
    readonly text: string,
    readonly regenerating: boolean,
  ) {
    super();
  }

  eq(other: GhostTextWidget): boolean {
    return this.text === other.text && this.regenerating === other.regenerating;
  }

  toDOM(): HTMLElement {
    const wrapper = document.createElement("span");
    wrapper.className = "logically-ghost-wrapper";

    const textSpan = document.createElement("span");
    textSpan.className = "logically-ghost-text";
    textSpan.textContent = this.text;
    wrapper.appendChild(textSpan);

    const actions = document.createElement("span");
    actions.className = "logically-ghost-actions";

    if (this.regenerating) {
      const status = document.createElement("span");
      status.className = "logically-ghost-regenerating";
      status.textContent = "Regenerating...";
      actions.appendChild(status);
    }

    if (!this.regenerating) {
      const acceptBtn = document.createElement("button");
      acceptBtn.className = "logically-ghost-btn logically-ghost-accept";
      acceptBtn.appendChild(createSvgIcon(CHECK_ICON));
      acceptBtn.setAttribute("aria-label", "Accept suggestion (tab)");
      this.attachButtonHandlers(acceptBtn, (view) => {
        const cb = acceptCallbacks.get(view);
        if (cb) cb(view);
      });
      actions.appendChild(acceptBtn);
    }

    const regenBtn = document.createElement("button");
    regenBtn.className = "logically-ghost-btn logically-ghost-regenerate";
    if (this.regenerating) {
      regenBtn.disabled = true;
      regenBtn.classList.add("is-loading");
    }
    regenBtn.appendChild(
      createSvgIcon(this.regenerating ? LOADING_ICON : REFRESH_ICON),
    );
    regenBtn.setAttribute("aria-label", "Regenerate suggestion");
    this.attachButtonHandlers(regenBtn, (view) => {
      const cb = regenerateCallbacks.get(view);
      if (cb) cb(view);
    });
    actions.appendChild(regenBtn);

    wrapper.appendChild(actions);
    return wrapper;
  }

  /** Attach mousedown+click handlers that prevent CM6 interference. */
  private attachButtonHandlers(
    btn: HTMLElement,
    action: (view: EditorView) => void,
  ): void {
    btn.addEventListener("mousedown", (e) => {
      e.preventDefault();
      e.stopPropagation();
    });
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const editorDom = btn.closest(".cm-editor");
      if (!editorDom) return;
      const view = editorViewMap.get(editorDom);
      if (!view) return;
      action(view);
    });
  }

  ignoreEvent(): boolean {
    return false;
  }
}

// ── State field ──────────────────────────────────────────────────────
/** Stores the ghost text position so the plugin can check cursor drift. */
interface GhostState {
  decorations: DecorationSet;
  pos: number | null;
  text: string | null;
  regenerating: boolean;
}

const ghostTextField = StateField.define<GhostState>({
  create(): GhostState {
    return {
      decorations: Decoration.none,
      pos: null,
      text: null,
      regenerating: false,
    };
  },

  update(value, tr): GhostState {
    for (const effect of tr.effects) {
      if (effect.is(setGhostText)) {
        if (effect.value === null) {
          return {
            decorations: Decoration.none,
            pos: null,
            text: null,
            regenerating: false,
          };
        }
        const { text, pos } = effect.value;
        const widget = Decoration.widget({
          widget: new GhostTextWidget(text, false),
          side: 1,
        });
        return {
          decorations: Decoration.set([widget.range(pos)]),
          pos,
          text,
          regenerating: false,
        };
      }
      if (effect.is(setGhostRegenerating)) {
        if (value.pos === null || value.text === null) {
          return value;
        }
        const widget = Decoration.widget({
          widget: new GhostTextWidget(value.text, effect.value),
          side: 1,
        });
        return {
          decorations: Decoration.set([widget.range(value.pos)]),
          pos: value.pos,
          text: value.text,
          regenerating: effect.value,
        };
      }
    }
    // Any document change → dismiss
    if (tr.docChanged) {
      return {
        decorations: Decoration.none,
        pos: null,
        text: null,
        regenerating: false,
      };
    }
    // Cursor moved away from ghost position → dismiss
    if (value.pos !== null && tr.selection) {
      const cursor = tr.state.selection.main.head;
      if (cursor !== value.pos) {
        return {
          decorations: Decoration.none,
          pos: null,
          text: null,
          regenerating: false,
        };
      }
    }
    return {
      decorations: value.decorations.map(tr.changes),
      pos: value.pos,
      text: value.text,
      regenerating: value.regenerating,
    };
  },

  provide: (f) => EditorView.decorations.from(f, (val) => val.decorations),
});

// ── View plugin (cursor-move detection) ──────────────────────────────
/** Delegates cursor-move to the service so it can restore cached suggestions or dismiss. */
const ghostTextCursorGuard = ViewPlugin.fromClass(
  class {
    constructor(readonly view: EditorView) {
      editorViewMap.set(view.dom, view);
    }

    update(update: ViewUpdate): void {
      if (!update.selectionSet || update.docChanged) return;
      const cursor = update.state.selection.main.head;

      // Ghost dismissal is handled by the StateField (no dispatch needed).
      // Defer cursor-move callback so the service can restore cached
      // suggestions without dispatching during the CM6 update cycle.
      const cb = cursorMoveCallbacks.get(update.view);
      if (cb) {
        const view = update.view;
        setTimeout(() => cb(view, cursor), 0);
      }
    }
  },
);

// ── Callback registry ────────────────────────────────────────────────
// The keymap needs a way to tell the service "Tab was pressed, accept".
// We store per-view callbacks so multiple editors don't conflict.
type AcceptCallback = (view: EditorView) => boolean;
const acceptCallbacks = new WeakMap<EditorView, AcceptCallback>();

/** Called when cursor moves — service decides whether to restore or dismiss. */
type CursorMoveCallback = (view: EditorView, pos: number) => void;
const cursorMoveCallbacks = new WeakMap<EditorView, CursorMoveCallback>();

/** Called when Regenerate button is clicked. */
type RegenerateCallback = (view: EditorView) => void;
const regenerateCallbacks = new WeakMap<EditorView, RegenerateCallback>();

/** Register an accept handler for a specific EditorView. */
export function registerAcceptHandler(
  view: EditorView,
  cb: AcceptCallback,
): void {
  acceptCallbacks.set(view, cb);
}

/** Remove the accept handler for a specific EditorView. */
export function unregisterAcceptHandler(view: EditorView): void {
  acceptCallbacks.delete(view);
}

/** Register a cursor-move handler for a specific EditorView. */
export function registerCursorMoveHandler(
  view: EditorView,
  cb: CursorMoveCallback,
): void {
  cursorMoveCallbacks.set(view, cb);
}

/** Remove the cursor-move handler for a specific EditorView. */
export function unregisterCursorMoveHandler(view: EditorView): void {
  cursorMoveCallbacks.delete(view);
}

/** Register a regenerate handler for a specific EditorView. */
export function registerRegenerateHandler(
  view: EditorView,
  cb: RegenerateCallback,
): void {
  regenerateCallbacks.set(view, cb);
}

/** Remove the regenerate handler for a specific EditorView. */
export function unregisterRegenerateHandler(view: EditorView): void {
  regenerateCallbacks.delete(view);
}

// ── Keymap ────────────────────────────────────────────────────────────
const ghostTextKeymap = keymap.of([
  {
    key: "Tab",
    run(view: EditorView): boolean {
      const ghost = view.state.field(ghostTextField);
      if (ghost.pos === null) return false; // no ghost → pass through

      const cb = acceptCallbacks.get(view);
      if (cb) return cb(view);

      // Fallback: just clear ghost text
      view.dispatch({ effects: setGhostText.of(null) });
      return true;
    },
  },
  {
    key: "Escape",
    run(view: EditorView): boolean {
      const ghost = view.state.field(ghostTextField);
      if (ghost.pos === null) return false;
      view.dispatch({ effects: setGhostText.of(null) });
      return true;
    },
  },
]);

// ── Public helper ────────────────────────────────────────────────────
/** Check whether ghost text is currently showing in a view. */
export function hasGhostText(view: EditorView): boolean {
  return view.state.field(ghostTextField).pos !== null;
}

/** Get current ghost text position, or null. */
export function getGhostTextPos(view: EditorView): number | null {
  return view.state.field(ghostTextField).pos;
}

// ── Bundled extension ────────────────────────────────────────────────
/** All CM6 extensions needed for ghost-text auto-suggest. */
export function ghostTextExtension(): Extension {
  return [ghostTextField, Prec.highest(ghostTextKeymap), ghostTextCursorGuard];
}
