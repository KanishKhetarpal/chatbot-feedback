/**
 * The embed loader for a Chatbot Feedback chatbot.
 *
 *   <script async src="https://<this-app>/widget.js"
 *           data-agent-key="pk_..."></script>
 *
 * **This file is never served as written.** It deliberately does not live in
 * `public/`, which Vite copies to the build output verbatim; the `widgetLoader`
 * plugin in `vite.config.ts` minifies it and emits the result as `/widget.js`,
 * in dev and in production alike. Edit here, not there.
 *
 * Minification strips the comments and mangles the names, which is worth having
 * — but it is obfuscation, not secrecy. Anything a browser can execute, a
 * browser can also display, and a determined reader will simply run it through
 * a formatter. So the rule this file lives under is unchanged: **nothing secret
 * may ever go in it.** No key, no token, no internal address that is not
 * already public. What actually stops another site using this agent is the
 * server-side `allowedOrigins` check, not anything written here.
 *
 * The `src` must be an absolute URL. It is the only address the snippet carries,
 * and it does double duty: it is where this file is fetched from, and — because
 * this file is served as a static asset by the CRM rather than by the API — it
 * is also where the chat panel at `/widget/:key` lives. A script always knows
 * where it was served from, so the loader and the panel are same-origin by
 * construction and cannot drift apart in config. A relative `src` would resolve
 * against the *embedding* site instead, and find neither.
 *
 * The API is the one address that cannot be inferred, since the CRM and the
 * backend are separate hosts. It is the `API_BASE` constant below.
 *
 * Sequence, in order, and the order is the point:
 *
 *   1. Ask the API whether this website may embed this agent, and what it looks like.
 *   2. If the answer is no, or anything goes wrong, render nothing at all.
 *   3. If yes, draw a launcher styled from the agent's own theme.
 *   4. Only when someone clicks it, mount the iframe that holds the chat.
 *
 * Two things worth understanding about step 1.
 *
 * The origin check is **not** performed here. A script running on someone else's
 * page cannot meaningfully vet its own origin — whatever it tested, a caller
 * could edit. The check that counts happens server-side against the `Origin`
 * header, which the browser attaches and the page cannot forge. This file just
 * respects the answer.
 *
 * And the call is free of side effects: it creates no visitor and issues no
 * token. Most page views never open the chat, and those should cost nothing.
 * Identity begins when the widget is opened, not when the page loads.
 *
 * Plain ES5 in an IIFE on purpose — this runs on someone else's page, where it
 * gets no bundler, no polyfills and no say in what else is on the page.
 */
(function () {
  "use strict";

  /**
   * Where the API lives. Filled by the widgetLoader plugin from this CRM
   * build's `VITE_API_URL` (plus `/api/v1`). `data-api-base` on the script
   * tag still overrides a single page.
   */
  var API_BASE = "__EMBED_API_BASE__";

  // A second copy of the tag (a CMS that injects on every partial render, a
  // duplicated snippet) would otherwise stack launchers on top of each other.
  if (window.__acharyaChatWidgetLoaded) return;
  window.__acharyaChatWidgetLoaded = true;

  var script =
    document.currentScript ||
    document.querySelector("script[data-agent-key]") ||
    document.querySelector("script[data-agent-id]");
  if (!script) return;

  var agentKey = script.getAttribute("data-agent-key") || script.getAttribute("data-agent-id");
  if (!agentKey) {
    warn("missing data-agent-key");
    return;
  }

  // Where the chat panel lives: wherever this script came from.
  var appOrigin = new URL(script.src, window.location.href).origin;

  // Now that the loader and the panel share an origin, a page that carries the
  // snippet *and* is the panel would mount a launcher inside its own iframe,
  // and that iframe another, and so on. Most visibly: the CRM's own index.html
  // during local testing.
  if (window.location.origin === appOrigin && window.location.pathname.indexOf("/widget/") === 0) {
    return;
  }

  // The attribute is an escape hatch for pointing a staging page at a different
  // backend without editing this file; the constant is the normal answer.
  var apiBase = (script.getAttribute("data-api-base") || API_BASE).replace(/\/+$/, "");
  var positionAttr = script.getAttribute("data-position");

  function warn(message) {
    if (window.console && console.warn) console.warn("[acharya-chat] " + message);
  }

  // ── Step 1: may we? and what do we look like? ─────────────────────────────

  fetch(apiBase + "/widget/config?publicKey=" + encodeURIComponent(agentKey), {
    method: "GET",
    headers: { Accept: "application/json" },
  })
    .then(function (res) {
      if (!res.ok) {
        return res
          .json()
          .catch(function () {
            return {};
          })
          .then(function (body) {
            // Deliberately quiet on the page itself. A visitor who cannot use
            // the chat is better served by no button than by a broken one, and
            // an error banner on the university's site would be worse than
            // either. The console line is for whoever installed the snippet.
            throw new Error(body.error || body.message || "HTTP " + res.status);
          });
      }
      return res.json();
    })
    .then(function (config) {
      mount(config && config.agent ? config.agent : {});
    })
    .catch(function (err) {
      warn("not shown on this site: " + err.message);
    });

  // ── Steps 3 and 4: launcher now, chat on demand ───────────────────────────

  function mount(agent) {
    var theme = agent.theme || {};
    var accent = typeof theme.primary === "string" ? theme.primary : "#ea580c";
    var accentText = typeof theme.primaryText === "string" ? theme.primaryText : "#ffffff";
    var label = agent.heading || agent.name || "Chat";
    var launcherSize = Number(theme.launcherSize);
    if (!(launcherSize >= 44 && launcherSize <= 80)) launcherSize = 48;
    var side =
      positionAttr === "left" || positionAttr === "right"
        ? positionAttr
        : theme.launcherPosition === "left"
          ? "left"
          : "right";

    var frame = null; // the panel wrapper, built lazily — see setOpen()
    var overlay = null; // boot cover over the iframe, dismissed on "ready"
    var open = false;
    var hovering = false;

    var closedShadow = "0 4px 10px rgba(15,23,42,.28), 0 14px 36px rgba(15,23,42,.38)";
    var closedShadowHover = "0 8px 16px rgba(15,23,42,.32), 0 20px 44px rgba(15,23,42,.46)";
    var openShadow = "0 2px 8px rgba(15,23,42,.14), 0 10px 28px rgba(15,23,42,.22)";
    var openShadowHover = "0 4px 12px rgba(15,23,42,.18), 0 16px 36px rgba(15,23,42,.28)";

    function prefersReducedMotion() {
      try {
        return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      } catch (e) {
        return false;
      }
    }

    var chevronSize = Math.round(launcherSize * 0.42);
    var button = document.createElement("button");
    button.type = "button";
    button.setAttribute("aria-label", "Open " + label);
    button.setAttribute("aria-expanded", "false");
    button.style.cssText = [
      "position:fixed",
      "bottom:20px",
      side + ":20px",
      "width:" + launcherSize + "px",
      "height:" + launcherSize + "px",
      "border:0",
      "border-radius:9999px",
      "cursor:pointer",
      "display:flex",
      "align-items:center",
      "justify-content:center",
      "padding:0",
      "background:transparent",
      "color:" + accentText,
      "box-shadow:" + closedShadow,
      "z-index:2147483001",
      "transform:scale(1)",
      "transform-origin:center",
      "transition:transform .2s ease, box-shadow .2s ease",
    ].join(";");
    button.style.setProperty("cursor", "pointer", "important");
    button.style.setProperty("transition", "transform .2s ease, box-shadow .2s ease", "important");

    var face = document.createElement("span");
    face.style.cssText = [
      "position:relative",
      "display:flex",
      "width:100%",
      "height:100%",
      "align-items:center",
      "justify-content:center",
      "overflow:hidden",
      "border-radius:9999px",
      "background:" + accent,
      "pointer-events:none",
      "transition:background-color .32s ease",
    ].join(";");

    // Both faces live stacked on top of each other so the swap can cross-fade
    // instead of popping. Both layers stay in the layout at all times;
    // only opacity/transform change, which keeps the swap on the compositor.
    function makeLayer() {
      var l = document.createElement("span");
      l.setAttribute("aria-hidden", "true");
      l.style.cssText = [
        "position:absolute",
        "inset:0",
        "display:flex",
        "align-items:center",
        "justify-content:center",
        "line-height:0",
        "border-radius:9999px",
        "overflow:hidden",
        "will-change:transform,opacity",
      ].join(";");
      return l;
    }

    var logoLayer = makeLayer();
    var chevronLayer = makeLayer();

    // Closed: agent avatar (or a chat mark). Open: the chevron takes over.
    // The chevron is inline SVG — not a data-URI, which many host CSPs block,
    // leaving the previous logo on screen.
    if (agent.avatarUrl) {
      var triggerImg = document.createElement("img");
      triggerImg.alt = "";
      triggerImg.src = agent.avatarUrl;
      triggerImg.style.cssText = "width:100%;height:100%;object-fit:cover";
      logoLayer.appendChild(triggerImg);
    } else {
      logoLayer.innerHTML =
        '<svg data-chat-mark width="' +
        chevronSize +
        '" height="' +
        chevronSize +
        '" viewBox="0 0 24 24" fill="none" aria-hidden="true">' +
        '<path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    }

    chevronLayer.style.setProperty("color", "#111827", "important");
    chevronLayer.innerHTML =
      '<svg width="' +
      chevronSize +
      '" height="' +
      chevronSize +
      '" viewBox="0 0 24 24" fill="none">' +
      '<path d="M6 9l6 6 6-6" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    face.appendChild(logoLayer);
    face.appendChild(chevronLayer);
    button.appendChild(face);

    // The two faces swap with a quiet cross-fade and a slight turn — just
    // enough movement to read as a state change, no spin and no bounce.
    // Skipped wholesale when the visitor asks for reduced motion.
    function paintFace(animate) {
      var reduce = prefersReducedMotion();
      var dur = !animate || reduce ? 0 : 200;
      var ease = "cubic-bezier(.4,0,.2,1)";
      var trans = dur ? "opacity " + dur + "ms ease, transform " + dur + "ms " + ease : "none";

      logoLayer.style.setProperty("transition", trans, "important");
      chevronLayer.style.setProperty("transition", trans, "important");

      logoLayer.style.setProperty("opacity", open ? "0" : "1", "important");
      logoLayer.style.setProperty(
        "transform",
        open ? "rotate(-45deg) scale(.85)" : "rotate(0deg) scale(1)",
        "important",
      );
      chevronLayer.style.setProperty("opacity", open ? "1" : "0", "important");
      chevronLayer.style.setProperty(
        "transform",
        open ? "rotate(0deg) scale(1)" : "rotate(45deg) scale(.85)",
        "important",
      );

      face.style.setProperty("background", open ? "#ffffff" : accent, "important");
      button.style.color = open ? "#111827" : accentText;
    }

    function applyHover() {
      var lifted = hovering;
      var shadow = open
        ? lifted
          ? openShadowHover
          : openShadow
        : lifted
          ? closedShadowHover
          : closedShadow;
      var scale = lifted && !prefersReducedMotion() ? "scale(1.1)" : "scale(1)";
      // !important so a host stylesheet cannot swallow the hover.
      button.style.setProperty("box-shadow", shadow, "important");
      button.style.setProperty("transform", scale, "important");
    }

    paintFace();
    applyHover();

    button.addEventListener("pointerenter", function () {
      hovering = true;
      applyHover();
    });
    button.addEventListener("pointerleave", function () {
      hovering = false;
      applyHover();
    });

    function applyFrameLayout(el) {
      var mobile = window.innerWidth < 520;
      var inset = mobile ? 0 : 12;
      var panelH = Math.min(640, window.innerHeight - inset * 2 - (mobile ? 0 : launcherSize + 12));
      var radius = theme.corners === "square" ? 2 : theme.corners === "soft" ? 12 : 22;
      var shadow = "0 24px 60px rgba(0,0,0,.22)";
      el.style.cssText = [
        "position:fixed",
        mobile ? "top:0" : "top:auto",
        "bottom:" + (mobile ? "0" : inset + launcherSize + 12 + "px"),
        "height:" + (mobile ? "100%" : panelH + "px"),
        mobile ? "left:0" : side + ":" + inset + "px",
        mobile ? "right:0" : "",
        "width:" + (mobile ? "100%" : "400px"),
        "max-width:calc(100vw - " + inset * 2 + "px)",
        "border:0",
        "border-radius:" + (mobile ? "0" : radius + "px"),
        "box-shadow:" + (mobile ? "none" : shadow),
        "z-index:2147483000",
        // Opaque, never transparent: until the chat app inside has booted and
        // painted, a transparent panel is a see-through rectangle with a drop
        // shadow — the host page shows straight through where the chat is
        // about to be. Dark, matching the app's own boot screen
        // (DEFAULT_WIDGET_THEME.background), so the overlay → app handover
        // does not flash.
        "background:#0a0a0a",
        "overflow:hidden",
        // Closed is `display:none`, not a transform parked below the fold.
        // `translateY(110%)` is 110% of the panel's own height, but the panel
        // sits a launcher's height above the viewport bottom to begin with — so
        // it slid down by less than it needed to and left a strip of its header
        // showing. Taking it out of the layout cannot leave a strip.
        "display:" + (open ? "block" : "none"),
      ]
        .filter(Boolean)
        .join(";");
    }

    /**
     * Ease the panel in: a short rise with a fade, not a full-height slide.
     * A dozen pixels is enough for the eye to read "appeared from the
     * launcher" without the panel sweeping across the page.
     *
     * Only ever called on the way in. Closing is instant: someone who has
     * decided they are done with the chat should not have to watch it leave,
     * and an exit animation is a quarter-second of nothing before the page is
     * theirs again.
     */
    function slideFrameIn(el) {
      if (prefersReducedMotion()) return;
      el.style.transition = "none";
      el.style.opacity = "0";
      el.style.transform = "translateY(12px)";
      // Flush the start position. Without this the browser coalesces both
      // writes into one style recalculation and there is nothing to animate
      // from — the panel simply appears.
      void el.offsetHeight;
      el.style.transition = "opacity .2s ease, transform .24s cubic-bezier(.22,1,.36,1)";
      el.style.opacity = "1";
      el.style.transform = "none";
    }

    /**
     * The boot cover: a replica of the chat app's own "Starting chat…" screen,
     * laid OVER the iframe. The app's document paints an opaque background the
     * moment its HTML arrives, seconds before React boots — so anything drawn
     * behind the iframe is covered while the panel still reads as a blank
     * page. The cover stays until the app posts `ready` on first render, at
     * which point the app is showing this exact screen itself and the swap is
     * invisible. A timer dismisses it regardless, so a lost message can never
     * leave the panel stuck behind a spinner.
     */
    function buildOverlay() {
      var el = document.createElement("div");
      el.setAttribute("aria-hidden", "true");
      el.style.cssText = [
        "position:absolute",
        "inset:0",
        "z-index:1",
        "display:flex",
        "flex-direction:column",
        "align-items:center",
        "justify-content:center",
        "gap:16px",
        "background:#0a0a0a",
        "transition:opacity .25s ease",
      ].join(";");

      // The twin of `WidgetBootFigure` in widget-chrome.tsx — same bubble,
      // dots, ripples, timings and colours (DEFAULT_WIDGET_THEME), because the
      // app's own boot screen replaces this cover mid-animation and the seam
      // must not show. Change one, change both.
      var reduce = prefersReducedMotion();
      if (!reduce && !document.getElementById("acharya-chat-widget-style")) {
        var style = document.createElement("style");
        style.id = "acharya-chat-widget-style";
        style.textContent =
          "@keyframes acharyaCwBob{0%,100%{transform:translateY(0)}50%{transform:translateY(-5px)}}" +
          "@keyframes acharyaCwDot{0%,60%,100%{transform:translateY(0);opacity:.35}30%{transform:translateY(-3px);opacity:1}}" +
          "@keyframes acharyaCwRipple{0%{transform:scale(.55);opacity:.5}80%{opacity:.08}100%{transform:scale(1.25);opacity:0}}";
        document.head.appendChild(style);
      }

      var dots = "";
      for (var i = 0; i < 3; i++) {
        dots +=
          '<span style="width:7px;height:7px;border-radius:9999px;background:#fff7ed;opacity:.35' +
          (reduce
            ? ""
            : ";animation:acharyaCwDot 1.2s " + (i * 0.16).toFixed(2) + "s infinite ease-in-out") +
          '"></span>';
      }
      var ripples = reduce
        ? ""
        : '<span style="position:absolute;inset:0;border-radius:9999px;border:2px solid #ea580c;opacity:0;animation:acharyaCwRipple 2.2s ease-out infinite"></span>' +
          '<span style="position:absolute;inset:0;border-radius:9999px;border:2px solid #ea580c;opacity:0;animation:acharyaCwRipple 2.2s 1.1s ease-out infinite"></span>';

      el.innerHTML =
        '<div style="position:relative;width:88px;height:88px;display:flex;align-items:center;justify-content:center">' +
        ripples +
        '<div style="position:relative' +
        (reduce ? "" : ";animation:acharyaCwBob 2.2s infinite ease-in-out") +
        '">' +
        '<div style="display:flex;width:56px;height:42px;align-items:center;justify-content:center;gap:5px;border-radius:14px;background:#ea580c">' +
        dots +
        "</div>" +
        '<span style="position:absolute;left:10px;bottom:-4px;width:12px;height:12px;border-radius:2px;background:#ea580c;transform:rotate(45deg)"></span>' +
        "</div>" +
        "</div>" +
        '<span style="font:14px/1.4 system-ui,-apple-system,sans-serif;color:#a3a3a3;letter-spacing:.01em">Starting chat…</span>';
      return el;
    }

    function dismissOverlay() {
      if (!overlay) return;
      var el = overlay;
      overlay = null;
      if (prefersReducedMotion()) {
        if (el.parentNode) el.parentNode.removeChild(el);
        return;
      }
      el.style.opacity = "0";
      setTimeout(function () {
        if (el.parentNode) el.parentNode.removeChild(el);
      }, 300);
    }

    function buildFrame() {
      // A wrapper div carries the geometry and the boot cover; the iframe
      // fills it. Without the cover the panel is a blank page-coloured
      // rectangle from click until the app's first React render.
      var wrap = document.createElement("div");
      applyFrameLayout(wrap);

      var el = document.createElement("iframe");
      el.src = appOrigin + "/widget/" + encodeURIComponent(agentKey);
      el.title = label;
      el.allow = "clipboard-write";
      el.setAttribute("loading", "lazy");
      el.style.cssText =
        "position:absolute;inset:0;width:100%;height:100%;border:0;background:transparent";
      wrap.appendChild(el);

      overlay = buildOverlay();
      wrap.appendChild(overlay);
      // The backstop for a `ready` that never arrives. Generous on purpose: it
      // only matters when the app is broken or the network is crawling, and a
      // spinner that gives way to a broken page late beats a broken page early.
      setTimeout(dismissOverlay, 15000);

      document.body.appendChild(wrap);
      slideFrameIn(wrap);
      return wrap;
    }

    function setOpen(next) {
      var wasOpen = open;
      open = next;
      // First open pays for the iframe; a visitor who never clicks never loads
      // the chat app at all, which is most of them.
      if (open && !frame) frame = buildFrame();
      else if (frame) {
        // Rewrites `cssText`, which clears the transform and transition with it
        // — so closing lands on `display:none` at once, and a resize while open
        // re-lays-out without replaying the slide.
        applyFrameLayout(frame);
        if (open && !wasOpen) slideFrameIn(frame);
      }
      button.style[side] = "20px";
      applyHover();
      paintFace(true);
      button.setAttribute("aria-expanded", open ? "true" : "false");
      button.setAttribute("aria-label", (open ? "Close " : "Open ") + label);
    }

    button.addEventListener("click", function () {
      setOpen(!open);
    });

    // Escape closes, matching every other overlay on the web.
    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && open) {
        setOpen(false);
        button.focus();
      }
    });

    // Lets the panel close itself, and announce that it has rendered. Same-
    // origin as this script by construction, so the origin check is exact
    // rather than a wildcard.
    window.addEventListener("message", function (event) {
      if (event.origin !== appOrigin) return;
      if (!event.data || event.data.source !== "acharya-chat-widget") return;
      if (event.data.type === "close") setOpen(false);
      if (event.data.type === "ready") dismissOverlay();
    });

    window.addEventListener("resize", function () {
      if (frame) applyFrameLayout(frame);
      button.style[side] = "20px";
    });

    function attach() {
      document.body.appendChild(button);
    }
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", attach);
    } else {
      attach();
    }

    window.ChatWidget = {
      open: function () {
        setOpen(true);
      },
      close: function () {
        setOpen(false);
      },
      toggle: function () {
        setOpen(!open);
      },
      agentKey: agentKey,
    };
  }
})();
