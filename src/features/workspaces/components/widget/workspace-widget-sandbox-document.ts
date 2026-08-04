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
 *  - a theme layer: the resolved design tokens (read from the host when this
 *    document is built) are injected as CSS variables so widgets look native.
 *    Later theme changes arrive over a small host-to-frame message channel, so
 *    live widget state survives them.
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
	`${WIDGET_KATEX_BASE_PATH}/contrib/auto-render.min.js`,
] as const;
const WIDGET_KATEX_FONT_PATH = `${WIDGET_KATEX_BASE_PATH}/fonts/`;

/** Any supported math notation: chat LaTeX delimiters, document markup, or the API. */
const WIDGET_MATH_PATTERN = /\$\$|\\\(|\\\[|data-latex|katex|renderMathInElement|renderWidgetMath/;

/**
 * Restrictive CSP for the frame. Widgets are self-contained HTML: only inline
 * scripts/styles and the exact bundled KaTeX resources may load. Connection
 * APIs such as fetch, XHR, and WebSocket are blocked. A script can still
 * navigate its own sandboxed frame, so this policy promises isolation from the
 * host app rather than impossible zero communication.
 */
function getWidgetSandboxCsp(origin: string) {
	const stylesheetUrl = `${origin}${WIDGET_KATEX_STYLESHEET_PATH}`;
	const scriptUrls = WIDGET_KATEX_SCRIPT_PATHS.map((path) => `${origin}${path}`).join(" ");
	const fontUrl = `${origin}${WIDGET_KATEX_FONT_PATH}`;

	return [
		"default-src 'none'",
		`style-src 'unsafe-inline' ${stylesheetUrl}`,
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

	// Only widgets that actually contain math pay for KaTeX (~290KB plus fonts).
	// Over-matching just costs a cached fetch; under-matching leaves math
	// unrendered, so the test is deliberately loose.
	const katexTags = WIDGET_MATH_PATTERN.test(html)
		? `<link rel="stylesheet" href="${origin}${WIDGET_KATEX_STYLESHEET_PATH}" />
${WIDGET_KATEX_SCRIPT_PATHS.map((path) => `<script src="${origin}${path}"></script>`).join("\n")}`
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
${katexTags}
<style>
:root{${tokenDeclarations}color-scheme:${theme};}
html,body{margin:0;background:var(--background);color:var(--foreground);font-family:var(--font-sans,ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif);}
html{padding:0;}
body{padding:clamp(10px,2.5%,16px);}
*,*::before,*::after{box-sizing:border-box;}
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
