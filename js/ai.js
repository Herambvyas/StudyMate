/*
 * StudyAI: one interface for talking to Claude from the page.
 *
 * Two modes:
 *  - "claude": the page is opened inside Claude, which provides window.claude.
 *              No key is needed and calls use the viewer's own Claude usage.
 *  - "key":    the page is hosted anywhere else (GitHub Pages, localhost).
 *              The visitor pastes their own Anthropic API key. It is kept in
 *              this browser's localStorage and sent only to api.anthropic.com.
 *
 * Both modes expose the same two calls:
 *   StudyAI.text(prompt, { signal, onText })  -> { text, truncated }
 *   StudyAI.json(prompt, { signal })          -> parsed JSON value
 * Failures reject with { code, message, text? }.
 */
(function () {
  "use strict";
  var MODEL = "claude-sonnet-5-5";
  var API_URL = "https://api.anthropic.com/v1/messages";
  var KEY_NAME = "studymate-api-key";
  var host = null;
  var mode = "key";

  function fail(code, message, text) { return { code: code, message: message || code, text: text }; }

  function getKey() { try { return localStorage.getItem(KEY_NAME) || ""; } catch (e) { return ""; } }
  function setKey(k) { try { localStorage.setItem(KEY_NAME, String(k || "").trim()); } catch (e) {} }
  function clearKey() { try { localStorage.removeItem(KEY_NAME); } catch (e) {} }

  async function init() {
    try {
      if (window.claude && typeof window.claude.use === "function") host = await window.claude.use("sample");
    } catch (e) { host = null; }
    mode = host ? "claude" : "key";
    return mode;
  }
  function ready() { return mode === "claude" || !!getKey(); }

  function parseJson(text) {
    var t = String(text || "").trim();
    try { return JSON.parse(t); } catch (e) {}
    var fence = t.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fence) { try { return JSON.parse(fence[1]); } catch (e) {} }
    var a = t.indexOf("["), b = t.lastIndexOf("]");
    if (a !== -1 && b > a) { try { return JSON.parse(t.slice(a, b + 1)); } catch (e) {} }
    throw fail("invalid_json", "The reply did not contain valid JSON.", t);
  }

  async function apiCall(prompt, opts, stream) {
    var key = getKey();
    if (!key) throw fail("no_key", "Add your API key first.");
    var res;
    try {
      res = await fetch(API_URL, {
        method: "POST",
        signal: opts.signal,
        headers: {
          "content-type": "application/json",
          "x-api-key": key,
          "anthropic-version": "2023-06-01",
          "anthropic-dangerous-direct-browser-access": "true"
        },
        body: JSON.stringify({ model: MODEL, max_tokens: 4096, stream: !!stream, messages: [{ role: "user", content: prompt }] })
      });
    } catch (e) {
      if (e && e.name === "AbortError") throw fail("cancelled");
      throw fail("upstream_error", "Network error. Check your connection.");
    }
    if (!res.ok) {
      if (res.status === 401 || res.status === 403) throw fail("bad_key", "The API key was rejected.");
      if (res.status === 429) throw fail("rate_limited", "Rate limit reached.");
      if (res.status === 413) throw fail("prompt_too_large", "Input too large.");
      throw fail("upstream_error", "The API returned status " + res.status + ".");
    }
    if (!stream) {
      var j = await res.json();
      var full = (j.content || []).map(function (b) { return b.text || ""; }).join("");
      return { text: full, truncated: j.stop_reason === "max_tokens" };
    }
    var reader = res.body.getReader(), dec = new TextDecoder(), buf = "", text = "", truncated = false;
    try {
      for (;;) {
        var chunk = await reader.read();
        if (chunk.done) break;
        buf += dec.decode(chunk.value, { stream: true });
        var lines = buf.split("\n");
        buf = lines.pop();
        for (var i = 0; i < lines.length; i++) {
          var line = lines[i].trim();
          if (line.indexOf("data:") !== 0) continue;
          var payload = line.slice(5).trim();
          if (!payload || payload === "[DONE]") continue;
          var ev; try { ev = JSON.parse(payload); } catch (e) { continue; }
          if (ev.type === "content_block_delta" && ev.delta && typeof ev.delta.text === "string") {
            text += ev.delta.text;
            if (opts.onText) opts.onText({ text: text, delta: ev.delta.text });
          } else if (ev.type === "message_delta" && ev.delta && ev.delta.stop_reason === "max_tokens") {
            truncated = true;
          } else if (ev.type === "error") {
            throw fail("upstream_error", (ev.error && ev.error.message) || "Stream error.", text);
          }
        }
      }
    } catch (e) {
      if (e && e.code) throw e;
      if (e && e.name === "AbortError") throw fail("cancelled", "", text);
      throw fail("upstream_error", "The connection was interrupted.", text);
    }
    if (!text.trim()) throw fail("empty_completion", "No text came back.");
    return { text: text, truncated: truncated };
  }

  async function text(prompt, opts) {
    opts = opts || {};
    if (mode === "claude") return host(prompt, { signal: opts.signal, cache: false, onText: opts.onText });
    return apiCall(prompt, opts, true);
  }
  async function json(prompt, opts) {
    opts = opts || {};
    if (mode === "claude") return host.json(prompt, { signal: opts.signal, cache: false });
    var r = await apiCall(prompt, opts, false);
    return parseJson(r.text);
  }

  window.StudyAI = {
    init: init, ready: ready, text: text, json: json,
    mode: function () { return mode; },
    hasKey: function () { return !!getKey(); },
    setKey: setKey, clearKey: clearKey, model: MODEL
  };
})();
