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
 *  - a theme layer: resolved host tokens and a compact semantic UI foundation
 *    make ordinary controls look native while authored styles remain free to
 *    override them. Later theme changes arrive over a small host-to-frame
 *    message channel, so live widget state survives them.
 *  - an error harness: window `error` / `unhandledrejection` are forwarded to
 *    the host via postMessage so a crashed widget surfaces an "Ask AI to fix"
 *    affordance instead of a silent blank frame.
 */

/** Frame → host messages (ready / height / runtime errors). */
export const WIDGET_SANDBOX_FRAME_SOURCE = "thinkex-widget-frame" as const;
export const WIDGET_SANDBOX_HOST_SOURCE = "thinkex-widget-host" as const;

export type WidgetSandboxTheme = {
	theme: "light" | "dark";
	tokens: Record<string, string>;
};

export type WidgetSandboxHostMessage = WidgetSandboxTheme & {
	source: typeof WIDGET_SANDBOX_HOST_SOURCE;
	kind: "theme";
	sessionId: number;
};

export type WidgetSandboxFrameMessage =
	| { source: typeof WIDGET_SANDBOX_FRAME_SOURCE; kind: "ready"; sessionId: number }
	| {
			source: typeof WIDGET_SANDBOX_FRAME_SOURCE;
			kind: "height";
			height: number;
			sessionId: number;
	  }
	| {
			source: typeof WIDGET_SANDBOX_FRAME_SOURCE;
			kind: "error";
			message: string;
			sessionId: number;
	  };

/**
 * Bounds on a widget's reported height. A widget sits in the flow of a
 * document, so it should take the room it needs and no more: a four-line
 * converter should not reserve a screenful, and a tall explorer should not be
 * cut off. Past the maximum the widget scrolls inside its own frame.
 */
export const WIDGET_SANDBOX_MIN_HEIGHT = 120;
export const WIDGET_SANDBOX_MAX_HEIGHT = 720;

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
	"--chart-1",
	"--chart-2",
	"--chart-3",
	"--chart-4",
	"--chart-5",
	"--chart-6",
	"--radius",
	"--font-sans",
	"--font-mono",
] as const;

/** Path KaTeX's browser build is served from (see scripts/copy-widget-libs.mjs). */
const WIDGET_KATEX_BASE_PATH = "/widget-libs/katex";
const WIDGET_KATEX_STYLESHEET_PATH = `${WIDGET_KATEX_BASE_PATH}/katex.min.css`;
const WIDGET_KATEX_SCRIPT_PATHS = [
	`${WIDGET_KATEX_BASE_PATH}/katex.min.js`,
	`${WIDGET_KATEX_BASE_PATH}/contrib/mhchem.min.js`,
] as const;
const WIDGET_KATEX_FONT_PATH = `${WIDGET_KATEX_BASE_PATH}/fonts/`;

/** Path mathjs's browser build is served from (see scripts/copy-widget-libs.mjs). */
const WIDGET_MATHJS_SCRIPT_PATH = "/widget-libs/mathjs/math.js";

/** Paths uPlot's browser build is served from (see scripts/copy-widget-libs.mjs). */
const WIDGET_UPLOT_BASE_PATH = "/widget-libs/uplot";
const WIDGET_UPLOT_STYLESHEET_PATH = `${WIDGET_UPLOT_BASE_PATH}/uPlot.min.css`;
const WIDGET_UPLOT_SCRIPT_PATH = `${WIDGET_UPLOT_BASE_PATH}/uPlot.iife.min.js`;

const WIDGET_MATH_PATTERN = /data-latex|dataset\.latex/;
// The graphing skill names these globals, so an authored widget that plots
// references them by name. Matching is deliberately loose, like the math test
// below: over-matching only costs a cached fetch, under-matching leaves the
// graph unrendered.
const WIDGET_MATHJS_PATTERN = /\bmath\.(?:evaluate|compile|parse|derivative|simplify|chain)\b/;
const WIDGET_UPLOT_PATTERN = /\buPlot\b/;

/**
 * Which bundled libraries an authored widget references. Drives both the tags
 * injected into the frame and the render/error analytics, so a graph widget is
 * countable apart from an ordinary one.
 */
export function detectWidgetLibraries(html: string) {
	return {
		katex: WIDGET_MATH_PATTERN.test(html),
		mathjs: WIDGET_MATHJS_PATTERN.test(html),
		uplot: WIDGET_UPLOT_PATTERN.test(html),
	};
}

/**
 * Restrictive CSP for the frame. Widgets are self-contained HTML: only inline
 * scripts/styles and the exact bundled libraries (KaTeX, mathjs, uPlot) may
 * load. No library uses eval, so the frame never needs script-src
 * 'unsafe-eval'. Connection APIs such as fetch, XHR, and WebSocket are blocked.
 * A script can still navigate its own sandboxed frame, so this policy promises
 * isolation from the host app rather than impossible zero communication.
 */
function getWidgetSandboxCsp(origin: string) {
	const styleUrls = [WIDGET_KATEX_STYLESHEET_PATH, WIDGET_UPLOT_STYLESHEET_PATH]
		.map((path) => `${origin}${path}`)
		.join(" ");
	const scriptUrls = [
		...WIDGET_KATEX_SCRIPT_PATHS,
		WIDGET_MATHJS_SCRIPT_PATH,
		WIDGET_UPLOT_SCRIPT_PATH,
	]
		.map((path) => `${origin}${path}`)
		.join(" ");
	const fontUrl = `${origin}${WIDGET_KATEX_FONT_PATH}`;

	return [
		"default-src 'none'",
		`style-src 'unsafe-inline' ${styleUrls}`,
		`script-src 'unsafe-inline' ${scriptUrls}`,
		"img-src data: blob:",
		`font-src data: ${fontUrl}`,
		"media-src data: blob:",
		"connect-src 'none'",
		"object-src 'none'",
		"base-uri 'none'",
		"form-action 'none'",
	].join("; ");
}

type BuildWidgetSandboxDocumentInput = WidgetSandboxTheme & {
	html: string;
	/** App origin the frame may load bundled libraries from. */
	origin: string;
	/** Changes only when authored HTML changes, to reject messages from the old document. */
	sessionId: number;
};

export function buildWidgetSandboxDocument({
	html,
	theme,
	tokens,
	origin,
	sessionId,
}: BuildWidgetSandboxDocumentInput): string {
	let tokenDeclarations = "";
	for (const name of WIDGET_SANDBOX_TOKENS) {
		const value = tokens[name]?.trim();
		if (value) tokenDeclarations += `${name}: ${value};`;
	}

	// Only widgets that reference a library pay for it: KaTeX is ~290KB plus
	// fonts, mathjs ~650KB. Over-matching just costs a cached fetch;
	// under-matching leaves the feature unrendered, so the tests stay loose.
	const libraries = detectWidgetLibraries(html);
	const libraryTags = [
		libraries.katex &&
			`<link rel="stylesheet" href="${origin}${WIDGET_KATEX_STYLESHEET_PATH}" />
${WIDGET_KATEX_SCRIPT_PATHS.map((path) => `<script src="${origin}${path}"></script>`).join("\n")}`,
		libraries.mathjs && `<script src="${origin}${WIDGET_MATHJS_SCRIPT_PATH}"></script>`,
		libraries.uplot &&
			`<link rel="stylesheet" href="${origin}${WIDGET_UPLOT_STYLESHEET_PATH}" />
<script src="${origin}${WIDGET_UPLOT_SCRIPT_PATH}"></script>`,
	]
		.filter(Boolean)
		.join("\n");

	// Widgets and documents use the same data-latex markup. The iframe still has
	// to render it locally because its opaque origin cannot reuse the parent DOM.
	// The base stylesheet deliberately sets no height. The frame reports what its
	// content measures and the host sizes the block to match, so a widget takes
	// the room it needs rather than a number picked here. Layout beyond that
	// belongs to the widget — host-side centring or max-widths strand it in dead
	// space.
	return `<!doctype html>
<html lang="en" data-theme="${theme}"${theme === "dark" ? ' class="dark"' : ""}>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta http-equiv="Content-Security-Policy" content="${getWidgetSandboxCsp(origin)}" />
${libraryTags}
<style>
:root{${tokenDeclarations}color-scheme:${theme};}
html,body{margin:0;background:var(--background);color:var(--foreground);font-family:var(--font-sans,ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif);}
html{padding:0;}
body{padding:clamp(10px,2.5%,16px);font-size:14px;line-height:1.5;}
*,*::before,*::after{box-sizing:border-box;}
:where(h1,h2,h3,p){margin:0;}
:where(h1,h2,h3){line-height:1.25;letter-spacing:-0.01em;}
h1{font-size:1.25rem;}
h2{font-size:1.125rem;}
h3{font-size:1rem;}
:where(button,input,select,textarea){font:inherit;color:inherit;}
button{min-height:36px;padding:0 12px;border:1px solid var(--border);border-radius:min(var(--radius),10px);background:var(--secondary);color:var(--secondary-foreground);font-weight:500;cursor:pointer;transition:background-color 150ms ease,border-color 150ms ease,box-shadow 150ms ease,transform 150ms ease;}
button:hover{background:color-mix(in oklch,var(--secondary) 82%,var(--foreground));}
button:active{transform:translateY(1px);}
button[data-variant="primary"]{border-color:transparent;background:var(--primary);color:var(--primary-foreground);}
button[data-variant="primary"]:hover{background:color-mix(in oklch,var(--primary) 82%,var(--background));}
button:disabled{cursor:not-allowed;opacity:.5;transform:none;}
:where(input:not([type="checkbox"]):not([type="radio"]):not([type="range"]),select,textarea){min-height:36px;max-width:100%;padding:7px 10px;border:1px solid var(--input);border-radius:min(var(--radius),10px);background:transparent;box-shadow:0 1px 2px color-mix(in oklch,var(--foreground) 7%,transparent);}
textarea{resize:vertical;}
:where(input[type="checkbox"],input[type="radio"],input[type="range"]){accent-color:var(--primary);}
:where(button,input,select,textarea):focus-visible{outline:none;border-color:var(--ring);box-shadow:0 0 0 3px color-mix(in oklch,var(--ring) 35%,transparent);}
[role="tablist"]{display:flex;flex-wrap:wrap;gap:4px;width:fit-content;padding:3px;border-radius:calc(var(--radius) + 2px);background:var(--muted);}
[role="tab"]{min-height:30px;padding:0 10px;border-color:transparent;background:transparent;color:var(--muted-foreground);}
[role="tab"][aria-selected="true"]{background:var(--background);color:var(--foreground);box-shadow:0 1px 2px color-mix(in oklch,var(--foreground) 10%,transparent);}
.tx-stack{display:flex;min-width:0;flex-direction:column;gap:12px;}
.tx-row{display:flex;min-width:0;flex-wrap:wrap;align-items:center;gap:8px;}
.tx-panel{min-width:0;padding:12px;border:1px solid var(--border);border-radius:calc(var(--radius) + 2px);background:var(--card);color:var(--card-foreground);}
.tx-muted{color:var(--muted-foreground);}
.tx-visual{position:relative;min-width:0;overflow:hidden;}
</style>
</head>
<body>
<script>
(function(){
  var FRAME="${WIDGET_SANDBOX_FRAME_SOURCE}";
  var HOST="${WIDGET_SANDBOX_HOST_SOURCE}";
  var SESSION=${sessionId};
  var TOKENS=${JSON.stringify(WIDGET_SANDBOX_TOKENS)};
  function post(message){
    message.source=FRAME;
    message.sessionId=SESSION;
    try{ parent.postMessage(message,"*"); }catch(_){}
  }
  function report(message){ post({kind:"error",message:String(message)}); }
  window.addEventListener("message",function(event){
    var message=event.data;
    if(event.source!==parent||!message||message.source!==HOST||message.kind!=="theme"||message.sessionId!==SESSION)return;
    if((message.theme!=="light"&&message.theme!=="dark")||!message.tokens||typeof message.tokens!=="object")return;
    var root=document.documentElement;
    root.classList.toggle("dark",message.theme==="dark");
    root.dataset.theme=message.theme;
    root.style.colorScheme=message.theme;
    TOKENS.forEach(function(name){
      var value=message.tokens[name];
      if(typeof value==="string")root.style.setProperty(name,value);
    });
    window.dispatchEvent(new CustomEvent("thinkex:themechange",{detail:{theme:message.theme}}));
  });
  window.addEventListener("error",function(event){
    report((event.message||"Error")+(event.error&&event.error.stack?"\\n"+event.error.stack:""));
  });
  window.addEventListener("unhandledrejection",function(event){
    var reason=event.reason;
    report("Unhandled promise rejection: "+((reason&&reason.stack)||reason));
  });
  window.addEventListener("DOMContentLoaded",function(){
    if(typeof katex!=="undefined"&&typeof katex.render==="function"){
      var mathOptions={throwOnError:false,errorColor:"var(--muted-foreground)"};
      function renderLatexNode(node){
        if(node.dataset.widgetMathRendered)return;
        node.dataset.widgetMathRendered="1";
        katex.render(node.getAttribute("data-latex"),node,Object.assign(
          {displayMode:node.getAttribute("data-type")==="block-math"},mathOptions));
      }
      function renderLatexIn(root){
        if(root.matches&&root.matches("[data-latex]"))renderLatexNode(root);
        if(root.querySelectorAll)root.querySelectorAll("[data-latex]").forEach(renderLatexNode);
      }
      try{
        renderLatexIn(document.body);
      }catch(_){}
      new MutationObserver(function(records){
        records.forEach(function(record){
          if(record.type==="attributes"){
            if(record.target.matches&&record.target.matches("[data-latex]")){
              delete record.target.dataset.widgetMathRendered;
              try{renderLatexNode(record.target);}catch(_){}
            }
            return;
          }
          record.addedNodes.forEach(function(node){
            if(node.nodeType===1)try{renderLatexIn(node);}catch(_){}
          });
        });
      }).observe(document.body,{
        attributeFilter:["data-latex","data-type"],
        attributes:true,
        childList:true,
        subtree:true
      });
    }
    var lastHeight=0;
    var measureScheduled=false;
    function measure(){
      if(measureScheduled)return;
      measureScheduled=true;
      requestAnimationFrame(function(){
        measureScheduled=false;
        var root=document.documentElement;
        var previousHeight=root.style.height;
        root.style.height="max-content";
        var height=Math.ceil(root.getBoundingClientRect().height);
        root.style.height=previousHeight;
        if(!height||Math.abs(height-lastHeight)<2)return;
        lastHeight=height;
        post({kind:"height",height:height});
      });
    }
    if(typeof ResizeObserver==="function"){
      var resizeObserver=new ResizeObserver(measure);
      resizeObserver.observe(document.documentElement);
      resizeObserver.observe(document.body);
    }
    window.addEventListener("load",measure);
    measure();
    post({kind:"ready"});
  },{once:true});
})();
</script>
${html}
</body>
</html>`;
}

export function isWidgetSandboxFrameMessage(value: unknown): value is WidgetSandboxFrameMessage {
	if (typeof value !== "object" || value === null) {
		return false;
	}

	const message = value as {
		source?: unknown;
		kind?: unknown;
		height?: unknown;
		message?: unknown;
		sessionId?: unknown;
	};
	if (
		message.source !== WIDGET_SANDBOX_FRAME_SOURCE ||
		typeof message.sessionId !== "number" ||
		!Number.isInteger(message.sessionId) ||
		message.sessionId < 1
	) {
		return false;
	}
	if (message.kind === "ready") {
		return true;
	}
	if (message.kind === "error") {
		return typeof message.message === "string";
	}
	return (
		message.kind === "height" &&
		typeof message.height === "number" &&
		Number.isFinite(message.height) &&
		message.height > 0
	);
}
