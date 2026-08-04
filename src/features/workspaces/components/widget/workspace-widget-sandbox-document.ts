/**
 * Builds the full HTML document served into the widget sandbox iframe.
 *
 * The widget's authored HTML is untrusted (AI-generated), so it runs in an
 * iframe with `sandbox="allow-scripts"` and NO `allow-same-origin`. That gives
 * it an opaque origin: it cannot read the parent's cookies, localStorage, or
 * DOM even though it is served from the same site. We never grant
 * `allow-same-origin` — combined with `allow-scripts` it would let the frame
 * remove its own sandbox.
 *
 * Two things are composed around the authored HTML:
 *  - a theme layer: the resolved design tokens (read from the host at build
 *    time) are injected as CSS variables so widgets look native, plus a `.dark`
 *    class toggled from the passed theme.
 *  - an error harness: window `error` / `unhandledrejection` are forwarded to
 *    the host via postMessage so a crashed widget surfaces an "Ask AI to fix"
 *    affordance instead of a silent blank frame.
 */

/** Host → frame messages (theme updates). */
export const WIDGET_SANDBOX_HOST_SOURCE = "thinkex-widget-host" as const;
/** Frame → host messages (ready / runtime errors). */
export const WIDGET_SANDBOX_FRAME_SOURCE = "thinkex-widget-frame" as const;

export type WidgetSandboxFrameMessage =
	| { source: typeof WIDGET_SANDBOX_FRAME_SOURCE; kind: "ready" }
	| { source: typeof WIDGET_SANDBOX_FRAME_SOURCE; kind: "error"; message: string };

/**
 * Semantic design tokens copied from the host into the frame. Kept to a curated
 * set — enough for widgets to feel native without leaking the entire cascade.
 */
export const WIDGET_SANDBOX_TOKENS = [
	"--background",
	"--foreground",
	"--card",
	"--card-foreground",
	"--popover",
	"--popover-foreground",
	"--primary",
	"--primary-foreground",
	"--secondary",
	"--secondary-foreground",
	"--muted",
	"--muted-foreground",
	"--accent",
	"--accent-foreground",
	"--border",
	"--input",
	"--ring",
	"--destructive",
	"--success",
	"--warning",
	"--info",
	"--radius",
] as const;

/** Path KaTeX's browser build is served from (see scripts/copy-widget-libs.mjs). */
const WIDGET_KATEX_BASE_PATH = "/widget-libs/katex";

/** Any supported math notation: chat LaTeX delimiters, document markup, or the API. */
const WIDGET_MATH_PATTERN = /\$\$|\\\(|\\\[|\$[^$\n]+\$|data-latex|katex|renderMathInElement/;

/**
 * Restrictive CSP for the frame. Widgets are self-contained HTML: inline
 * scripts/styles, plus the app's own origin so the bundled KaTeX build can
 * load. `connect-src 'none'` still blocks every runtime network call.
 */
function getWidgetSandboxCsp(origin: string) {
	return [
		"default-src 'none'",
		`style-src 'unsafe-inline' ${origin}`,
		`script-src 'unsafe-inline' ${origin}`,
		"img-src data: https:",
		`font-src data: https: ${origin}`,
		"media-src data: https:",
		"connect-src 'none'",
	].join("; ");
}

type BuildWidgetSandboxDocumentInput = {
	html: string;
	theme: "light" | "dark";
	/** `--token` → resolved value, read from the host via getComputedStyle. */
	tokens: Record<string, string>;
	/** App origin the frame may load bundled libraries from. */
	origin: string;
};

export function buildWidgetSandboxDocument({
	html,
	theme,
	tokens,
	origin,
}: BuildWidgetSandboxDocumentInput): string {
	const tokenDeclarations = Object.entries(tokens)
		.filter(([, value]) => value.trim().length > 0)
		.map(([name, value]) => `${name}: ${value};`)
		.join("");

	// Only widgets that actually contain math pay for KaTeX (~290KB plus fonts).
	// Over-matching just costs a cached fetch; under-matching leaves math
	// unrendered, so the test is deliberately loose.
	const katexTags = WIDGET_MATH_PATTERN.test(html)
		? `<link rel="stylesheet" href="${origin}${WIDGET_KATEX_BASE_PATH}/katex.min.css" />
<script src="${origin}${WIDGET_KATEX_BASE_PATH}/katex.min.js"></script>
<script src="${origin}${WIDGET_KATEX_BASE_PATH}/contrib/mhchem.min.js"></script>
<script src="${origin}${WIDGET_KATEX_BASE_PATH}/contrib/auto-render.min.js"></script>`
		: "";

	// Widgets are HTML, so math is authored the same way documents author it —
	// `data-latex` markup — and the unambiguous LaTeX delimiters are accepted too
	// for when a model reaches for chat habits. Single `$…$` is deliberately NOT
	// a delimiter: it cannot be told apart from prices, so "$30 an hour … $75 an
	// hour" would render the text between them as math. Dropping it is safer than
	// defending it with a currency heuristic, and `$$…$$` still covers real math.
	// Bad expressions render muted in place rather than throwing, so one
	// malformed formula never takes the whole widget down.
	//
	// The base stylesheet sets a definite height chain and nothing else: widgets
	// fill the frame with `height: 100%`, and a percentage height only resolves
	// against a parent with a definite height. Layout beyond that belongs to the
	// widget — host-side centring or max-widths just strand it in dead space.
	return `<!doctype html>
<html lang="en"${theme === "dark" ? ' class="dark"' : ""}>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta http-equiv="Content-Security-Policy" content="${getWidgetSandboxCsp(origin)}" />
${katexTags}
<style>
:root{${tokenDeclarations}color-scheme:${theme};}
html,body{margin:0;padding:0;height:100%;background:var(--background);color:var(--foreground);font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;}
*,*::before,*::after{box-sizing:border-box;}
</style>
</head>
<body>
${html}
<script>
(function(){
  var HOST="${WIDGET_SANDBOX_HOST_SOURCE}",FRAME="${WIDGET_SANDBOX_FRAME_SOURCE}";
  function post(message){ try{ parent.postMessage(message,"*"); }catch(_){} }
  function report(message){ post({source:FRAME,kind:"error",message:String(message)}); }
  window.addEventListener("error",function(event){
    report((event.message||"Error")+(event.error&&event.error.stack?"\\n"+event.error.stack:""));
  });
  if(typeof renderMathInElement==="function"){
    var mathOptions={throwOnError:false,errorColor:"var(--muted-foreground)"};
    window.renderWidgetMath=function(target){
      var root=target||document.body;
      renderMathInElement(root,Object.assign({
        delimiters:[
          {left:"$$",right:"$$",display:true},
          {left:"\\\\[",right:"\\\\]",display:true},
          {left:"\\\\(",right:"\\\\)",display:false}
        ]
      },mathOptions));
      root.querySelectorAll("[data-latex]").forEach(function(node){
        if(node.dataset.widgetMathRendered)return;
        node.dataset.widgetMathRendered="1";
        katex.render(node.getAttribute("data-latex"),node,Object.assign(
          {displayMode:node.getAttribute("data-type")==="block-math"},mathOptions));
      });
    };
    try{ window.renderWidgetMath(); }catch(_){}
  }
  window.addEventListener("unhandledrejection",function(event){
    var reason=event.reason;
    report("Unhandled promise rejection: "+((reason&&reason.stack)||reason));
  });
  window.addEventListener("message",function(event){
    var data=event.data;
    if(!data||data.source!==HOST)return;
    if(data.type==="theme"){
      document.documentElement.classList.toggle("dark",data.theme==="dark");
      document.documentElement.style.colorScheme=data.theme;
    }
  });
  post({source:FRAME,kind:"ready"});
})();
</script>
</body>
</html>`;
}

export function isWidgetSandboxFrameMessage(value: unknown): value is WidgetSandboxFrameMessage {
	if (typeof value !== "object" || value === null) {
		return false;
	}

	const message = value as { source?: unknown; kind?: unknown };
	return (
		message.source === WIDGET_SANDBOX_FRAME_SOURCE &&
		(message.kind === "ready" || message.kind === "error")
	);
}
