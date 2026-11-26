import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { EventEmitter, once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const extensionPath = fileURLToPath(new URL("../extension/", import.meta.url));
const chromePath = process.env.CHROME_BIN ?? (process.platform === "darwin"
  ? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
  : "google-chrome");

async function startChrome(t) {
  const profile = await mkdtemp(join(tmpdir(), "noquery-test-"));
  const chrome = spawn(chromePath, [
    "--headless", "--remote-debugging-pipe", "--enable-unsafe-extension-debugging",
    "--no-first-run", "--disable-background-networking", "--host-resolver-rules=MAP * ~NOTFOUND",
    "--user-data-dir=" + profile,
  ], { stdio: ["ignore", "ignore", "inherit", "pipe", "pipe"] });

  const exited = once(chrome, "exit").catch(() => {});
  t.after(async () => {
    chrome.kill();
    await exited;
    await rm(profile, { recursive: true, force: true });
  });

  const events = new EventEmitter();
  const pending = new Map();
  let nextId = 0;
  let buffer = "";

  await once(chrome, "spawn");
  chrome.stdio[4].setEncoding("utf8").on("data", (chunk) => {
    buffer += chunk;
    let end;
    while ((end = buffer.indexOf("\0")) !== -1) {
      const message = JSON.parse(buffer.slice(0, end));
      buffer = buffer.slice(end + 1);
      if (message.id) {
        const { resolve, reject } = pending.get(message.id);
        pending.delete(message.id);
        if (message.error) reject(new Error(message.error.message));
        else resolve(message.result);
      } else {
        events.emit(message.method, message.params);
      }
    }
  });

  function send(method, params = {}, sessionId) {
    return new Promise((resolve, reject) => {
      const id = ++nextId;
      pending.set(id, { resolve, reject });
      chrome.stdio[3].write(JSON.stringify({ id, method, params, sessionId }) + "\0");
    });
  }

  return { send, events };
}

test("Chrome copies X post URLs without their query and leaves other values alone", {
  timeout: 20000,
}, async (t) => {
  const { send, events } = await startChrome(t);
  if (!process.env.NOQUERY_TEST_BASELINE) {
    await send("Extensions.loadUnpacked", { path: extensionPath });
  }
  const { targetId } = await send("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
  const page = (method, params) => send(method, params, sessionId);
  const fixture = Buffer.from(`<!doctype html><meta charset="utf-8"><script>
    // X has used a selected temporary span and execCommand for its share action.
    window.copySelection = (value) => {
      const span = document.createElement("span");
      span.textContent = value;
      span.style.opacity = "0";
      span.style.position = "absolute";
      span.style.whiteSpace = "pre-wrap";
      document.body.append(span);
      const selection = getSelection();
      const range = document.createRange();
      range.selectNodeContents(span);
      selection.addRange(range);
      const copied = document.execCommand("copy");
      selection.removeAllRanges();
      span.remove();
      if (!copied) throw new Error("Copy failed");
    };
    window.copyText = navigator.clipboard.writeText.bind(navigator.clipboard);
  </script><body></body>`).toString("base64");

  events.on("Fetch.requestPaused", ({ requestId }) => {
    void page("Fetch.fulfillRequest", {
      requestId,
      responseCode: 200,
      responseHeaders: [{ name: "Content-Type", value: "text/html; charset=utf-8" }],
      body: fixture,
    }).catch((error) => events.emit("error", error));
  });
  await page("Fetch.enable", { patterns: [{ urlPattern: "https://*/noquery-test" }] });
  await page("Page.enable");

  async function open(hostname) {
    const origin = "https://" + hostname;
    await send("Browser.setPermission", {
      origin, permission: { name: "clipboard-read" }, setting: "granted",
    });
    const loaded = once(events, "Page.loadEventFired");
    await page("Page.navigate", { url: origin + "/noquery-test" });
    await loaded;
  }

  async function verifyCopy(fn, input, expected) {
    const { result, exceptionDetails } = await page("Runtime.evaluate", {
      expression: `(async () => {
        await ${fn}(${JSON.stringify(input)});
        return navigator.clipboard.readText();
      })()`,
      awaitPromise: true,
      userGesture: true,
      returnByValue: true,
    });
    assert.equal(exceptionDetails, undefined, result.description);
    assert.equal(result.value, expected);
  }

  await open("x.com");
  await t.test("the selection-based share link drops every query parameter", async () => {
    await verifyCopy("copySelection", "https://x.com/example/status/123?t=abc&s=20",
      "https://x.com/example/status/123");
  });
  await t.test("an early writeText binding drops the query and preserves the fragment", async () => {
    await verifyCopy("copyText", "https://twitter.com/i/web/status/123?a=abc&future=1#part?keep=1",
      "https://twitter.com/i/web/status/123#part?keep=1");
    await verifyCopy("copyText", "https://x.com/example/status/123/photo/1?",
      "https://x.com/example/status/123/photo/1");
  });
  await t.test("text, other URL types, and existing clean links are preserved", async () => {
    for (const value of [
      "See https://x.com/example/status/123?s=20",
      "https://x.com/example/status/123?s=20\nhttps://example.com/",
      "https://x.com/search?q=chrome",
      "https://x.com.example.test/example/status/123?s=20",
      "https://x.com/example/status/123#part?keep=1",
    ]) {
      await verifyCopy("copyText", value, value);
      await verifyCopy("copySelection", value, value);
    }
  });
  await t.test("there is no interception on another site", async () => {
    await open("example.test");
    const value = "https://x.com/example/status/123?s=20";
    await verifyCopy("copySelection", value, value);
    await verifyCopy("copyText", value, value);
  });
});
