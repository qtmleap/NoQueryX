(() => {
  "use strict";

  const postUrl = /^https?:\/\/(?:www\.|mobile\.)?(?:x|twitter)\.com\/(?:[a-z0-9_]+|i\/web)\/status\/\d+(?:\/(?:photo|video)\/\d+)?\/?$/i;

  function stripQuery(text) {
    if (typeof text !== "string" || /\s/.test(text)) return text;

    const query = text.indexOf("?");
    const fragment = text.indexOf("#");
    if (query === -1 || (fragment !== -1 && fragment < query)) return text;

    const base = text.slice(0, query);
    if (!postUrl.test(base)) return text;
    return fragment === -1 ? base : base + text.slice(fragment);
  }

  // Rewrite text before the page sends it to the browser's Clipboard API.
  const clipboard = globalThis.Clipboard?.prototype;
  if (typeof clipboard?.writeText === "function") {
    const writeText = clipboard.writeText;
    clipboard.writeText = function (...args) {
      if (args.length) args[0] = stripQuery(args[0]);
      return Reflect.apply(writeText, this, args);
    };
  }

  // X has also used a temporary selection followed by execCommand("copy").
  window.addEventListener("copy", (event) => {
    if (!event.isTrusted || !event.cancelable || event.defaultPrevented || !event.clipboardData) return;
    if (event.target?.matches?.("input, textarea")) return;

    const text = window.getSelection()?.toString();
    const clean = stripQuery(text);
    if (clean === text) return;

    event.clipboardData.setData("text/plain", clean);
    event.preventDefault();
  }, true);
})();
