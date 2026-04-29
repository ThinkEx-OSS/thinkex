"use client";

import { Extension } from "@tiptap/core";
import {
  BlockMath,
  InlineMath,
  type MathematicsOptions,
} from "@tiptap/extension-mathematics";
import katex, { type KatexOptions } from "katex";

/**
 * LRU cache for KaTeX render results, shared across all editor instances.
 *
 * KaTeX rendering is deterministic given (latex, options), so caching by
 * `${latex}\0${JSON.stringify(options)}` is safe and lets reopens of the
 * same doc — and duplicate expressions across docs — skip the synchronous
 * parse + DOM-build cost.
 *
 * Caveat: this assumes `katexOptions.macros` is not used. `\gdef` mutates
 * the shared `macros` object across renders, which would make cached HTML
 * stale. We do not use `macros` in this codebase.
 */
const CACHE_MAX = 500;

type Cached = { html: string; error: boolean };

const renderCache = new Map<string, Cached>();

function cachedRenderToString(
  latex: string,
  options: KatexOptions | undefined,
): Cached {
  const key = `${latex}\u0000${options ? JSON.stringify(options) : ""}`;
  const existing = renderCache.get(key);
  if (existing) {
    // LRU touch: move to end of insertion order.
    renderCache.delete(key);
    renderCache.set(key, existing);
    return existing;
  }

  let result: Cached;
  try {
    result = { html: katex.renderToString(latex, options), error: false };
  } catch {
    result = { html: "", error: true };
  }

  if (renderCache.size >= CACHE_MAX) {
    const oldest = renderCache.keys().next().value;
    if (oldest !== undefined) {
      renderCache.delete(oldest);
    }
  }
  renderCache.set(key, result);
  return result;
}

const CachedInlineMath = InlineMath.extend({
  addNodeView() {
    return ({ node, getPos }) => {
      const wrapper = document.createElement("span");
      wrapper.className = "tiptap-mathematics-render";

      if (this.editor.isEditable) {
        wrapper.classList.add("tiptap-mathematics-render--editable");
      }

      wrapper.dataset.type = "inline-math";
      wrapper.setAttribute("data-latex", node.attrs.latex);

      const result = cachedRenderToString(
        node.attrs.latex,
        this.options.katexOptions,
      );
      if (result.error) {
        wrapper.textContent = node.attrs.latex;
        wrapper.classList.add("inline-math-error");
      } else {
        wrapper.innerHTML = result.html;
      }

      const handleClick = (event: MouseEvent) => {
        event.preventDefault();
        event.stopPropagation();
        const pos = getPos();
        if (pos == null) return;
        if (this.options.onClick) {
          this.options.onClick(node, pos);
        }
      };

      if (this.options.onClick) {
        wrapper.addEventListener("click", handleClick);
      }

      return {
        dom: wrapper,
        destroy: () => {
          wrapper.removeEventListener("click", handleClick);
        },
      };
    };
  },
});

const CachedBlockMath = BlockMath.extend({
  addNodeView() {
    return ({ node, getPos }) => {
      const wrapper = document.createElement("div");
      const innerWrapper = document.createElement("div");
      wrapper.className = "tiptap-mathematics-render";

      if (this.editor.isEditable) {
        wrapper.classList.add("tiptap-mathematics-render--editable");
      }

      innerWrapper.className = "block-math-inner";
      wrapper.dataset.type = "block-math";
      wrapper.setAttribute("data-latex", node.attrs.latex);
      wrapper.appendChild(innerWrapper);

      const result = cachedRenderToString(
        node.attrs.latex,
        this.options.katexOptions,
      );
      if (result.error) {
        // Match upstream behavior: replace wrapper contents with raw latex on error.
        wrapper.textContent = node.attrs.latex;
        wrapper.classList.add("block-math-error");
      } else {
        innerWrapper.innerHTML = result.html;
      }

      const handleClick = (event: MouseEvent) => {
        event.preventDefault();
        event.stopPropagation();
        const pos = getPos();
        if (pos == null) return;
        if (this.options.onClick) {
          this.options.onClick(node, pos);
        }
      };

      if (this.options.onClick) {
        wrapper.addEventListener("click", handleClick);
      }

      return {
        dom: wrapper,
        destroy: () => {
          wrapper.removeEventListener("click", handleClick);
        },
      };
    };
  },
});

/**
 * Drop-in replacement for `Mathematics` from `@tiptap/extension-mathematics`
 * that renders math via a shared LRU cache around `katex.renderToString`.
 *
 * Same options shape as the upstream `Mathematics` extension.
 */
export const CachedMathematics = Extension.create<MathematicsOptions>({
  name: "Mathematics",

  addOptions() {
    return {
      inlineOptions: undefined,
      blockOptions: undefined,
      katexOptions: undefined,
    };
  },

  addExtensions() {
    return [
      CachedBlockMath.configure({
        ...this.options.blockOptions,
        katexOptions: this.options.katexOptions,
      }),
      CachedInlineMath.configure({
        ...this.options.inlineOptions,
        katexOptions: this.options.katexOptions,
      }),
    ];
  },
});

export default CachedMathematics;
