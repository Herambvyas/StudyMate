(function () {
  var $ = function (id) { return document.getElementById(id); };
  var EXAMPLE = "CPU scheduling decides which process in the ready queue gets the CPU next. Goals: maximise CPU utilisation and throughput, and minimise waiting time, turnaround time and response time.\n\nFCFS (First Come First Served): processes run in arrival order. Simple and non-preemptive, but one long process at the front makes everyone wait (the convoy effect).\n\nSJF (Shortest Job First): picks the process with the smallest next CPU burst. It gives the minimum average waiting time, but it needs the burst length in advance and can starve long processes. The preemptive version is called SRTF.\n\nRound Robin: each process gets a fixed time quantum, then goes to the back of the queue. Good response time for interactive systems. If the quantum is too large it behaves like FCFS; if it is too small, context-switch overhead dominates.\n\nPriority scheduling: the highest priority process runs first. Starvation of low priority processes is solved by aging, which gradually raises the priority of waiting processes.\n\nContext switch: saving the state of one process and loading another. It is pure overhead.";

  var MODES = {
    summary:  { label: "Summary",    json: false, chips: ["Role", "Rules", "Step-by-step", "Fixed format"] },
    cards:    { label: "Flashcards", json: true,  chips: ["Role", "Rules", "Few-shot example", "JSON output"] },
    quiz:     { label: "Quiz",       json: true,  chips: ["Role", "Rules", "Few-shot example", "JSON output", "Constraints"] },
    simplify: { label: "Simplify",   json: false, chips: ["Role", "Rules", "Style control"] },
    plan:     { label: "Study plan", json: false, chips: ["Role", "Rules", "Constraints", "Fixed format"] }
  };
  var EMPTY = {
    summary: ["Revision summary", "A one-sentence big idea, key points, terms to remember and a likely exam question."],
    cards: ["Flashcards", "Question and answer cards. Flip each one, then mark it known or review it again."],
    quiz: ["Practice quiz", "Multiple choice questions built from your notes, with an explanation after every answer."],
    simplify: ["Simple explanation", "Your notes in plain words, with an analogy, or as a short dialogue."],
    plan: ["Study plan", "Tell it how many days you have and get a plan with a self-test for each day."]
  };
  var ICONS = {
    summary: '<path d="M5 6h14M5 12h14M5 18h9"/>',
    cards: '<rect x="4" y="8" width="13" height="11" rx="2"/><path d="M8 5h11a1 1 0 0 1 1 1v10"/>',
    quiz: '<circle cx="12" cy="12" r="8"/><path d="M8.5 12.2l2.4 2.4 4.6-5"/>',
    simplify: '<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2V16h5v-.1c0-.8.4-1.5 1-2A6 6 0 0 0 12 3z"/>',
    plan: '<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M8 3v4M16 3v4M4 10h16"/>'
  };
  var VERB = { summary: "Generate summary", cards: "Make flashcards", quiz: "Build quiz", simplify: "Simplify my notes", plan: "Make study plan" };
  function icon(k) { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + ICONS[k] + "</svg>"; }

  var ai = window.StudyAI;
  var mode = "summary";
  var results = {};
  var ctl = null;
  var busy = false;

  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function inl(t) { return t.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/`(.+?)`/g, "<code>$1</code>"); }
  function md(src) {
    var lines = esc(src).split("\n"), out = "", list = false;
    for (var i = 0; i < lines.length; i++) {
      var l = lines[i].replace(/\s+$/, "");
      var m = l.match(/^\s*(?:[-*•]|\d+[.)])\s+(.*)/);
      if (m) { if (!list) { out += "<ul>"; list = true; } out += "<li>" + inl(m[1]) + "</li>"; continue; }
      if (list) { out += "</ul>"; list = false; }
      var h = l.match(/^#{1,4}\s+(.*)/);
      if (h) { out += '<h4 class="h-' + h[1].toLowerCase().replace(/[^a-z]+/g, "-").replace(/^-|-$/g, "") + '">' + inl(h[1]) + "</h4>"; continue; }
      if (!l.trim()) continue;
      out += "<p>" + inl(l) + "</p>";
    }
    if (list) out += "</ul>";
    return out;
  }

  /* ---------- prompts ---------- */
  function head() {
    var lang = $("lang").value, level = $("level").value;
    var langNote = lang === "Hinglish" ? "Hinglish (Hindi written in Roman script, mixed with English technical terms)" : lang;
    return "ROLE: You are StudyMate, a patient tutor for " + level + " students.\n" +
      "RULES: Use only the notes below. If the notes do not cover something, say so instead of guessing. Write in " + langNote + ". Keep technical terms in English.\n\n";
  }
  function buildPrompt(m, notes) {
    var block = 'NOTES:\n"""\n' + notes + '\n"""\n\n';
    var task = "";
    if (m === "summary") {
      task = "TASK: Summarize the notes for last-minute revision. First work out the structure of the notes step by step, then output exactly this format:\n" +
        "## Big idea\n(one sentence)\n## Key points\n(5 to 7 bullets, each under 20 words)\n## Terms to remember\n(bullets written as **term**: short meaning)\n## Likely exam question\n(one question, then a 2 line model answer)";
    } else if (m === "cards") {
      task = "TASK: Make " + $("nCards").value + " flashcards from the notes. Test understanding, not copying. Answers must be under 30 words.\n" +
        'Reply with only a JSON array of {"q": string, "a": string} objects. Example:\n[{"q":"Why does Round Robin use a time quantum?","a":"To give each process a fair CPU slice so none waits forever."}]';
    } else if (m === "quiz") {
      task = "TASK: Write " + $("nQuiz").value + " multiple choice questions from the notes. Each has exactly 4 options, one correct, and plausible wrong options. Vary the position of the correct option.\n" +
        'Reply with only a JSON array of {"question": string, "options": [4 strings], "answer": 0-3 index of the correct option, "explanation": one sentence} objects. Example:\n[{"question":"Which scheduler can starve long jobs?","options":["FCFS","SJF","Round Robin","None"],"answer":1,"explanation":"SJF always prefers short bursts, so long ones may wait forever."}]';
    } else if (m === "simplify") {
      task = "TASK: Explain the notes " + $("style").value + ". Cover every main idea, but do not add facts that are not in the notes. End with one sentence that starts with 'Remember:'.";
    } else {
      var d = Math.max(1, Math.min(30, parseInt($("days").value, 10) || 5));
      task = "TASK: Make a " + d + "-day study plan for these notes. Spread the topics sensibly across the days. For each day give the focus topic, 2 to 3 things to do, and one 10 minute self-test question. Make the last day revision plus mock questions.\n" +
        "Format: '## Day 1: topic' followed by bullets. Use only topics found in the notes.";
    }
    return head() + block + task;
  }
  function refreshLab() {
    $("chips").innerHTML = MODES[mode].chips.map(function (c) { return '<span class="chip">' + esc(c) + "</span>"; }).join("");
    var raw = esc(buildPrompt(mode, "[your notes appear here]"));
    raw = raw.replace(/^(ROLE|RULES|NOTES|TASK|Format)(:)/gm, '<span class="kw">$1$2</span>').replace(/\[your notes appear here\]/, '<span class="pl">[your notes appear here]</span>');
    $("promptView").innerHTML = raw;
  }

  /* ---------- UI shell ---------- */
  function buildTabs() {
    var t = $("tabs");
    t.innerHTML = "";
    Object.keys(MODES).forEach(function (k) {
      var b = document.createElement("button");
      b.type = "button"; b.className = "tool"; b.setAttribute("role", "tab"); b.dataset.mode = k;
      b.style.setProperty("--c", "var(--t-" + k + ")"); b.style.setProperty("--ci", "var(--ti-" + k + ")");
      b.innerHTML = '<span class="ti">' + icon(k) + "</span><span>" + esc(MODES[k].label) + "</span>";
      b.addEventListener("click", function () { mode = k; paint(); });
      t.appendChild(b);
    });
  }
  function paint() {
    Array.prototype.forEach.call($("tabs").children, function (b) { b.setAttribute("aria-selected", b.dataset.mode === mode ? "true" : "false"); });
    Array.prototype.forEach.call(document.querySelectorAll("[data-for]"), function (f) { f.hidden = f.dataset["for"] !== mode; });
    $("copied").textContent = "";
    document.body.dataset.tool = mode;
    $("goIcon").innerHTML = icon(mode);
    $("goLabel").textContent = VERB[mode];
    refreshLab();
    renderOutput();
  }
  function setStatus(msg, isErr) { var s = $("status"); s.textContent = msg || ""; s.className = "status" + (isErr ? " err" : ""); }

  function renderOutput() {
    var out = $("out"), r = results[mode];
    $("actions").hidden = !r;
    if (!r && busy) { out.className = "out"; out.innerHTML = '<div class="skel" aria-label="Loading"><i class="t"></i><i></i><i class="s"></i><i></i><i class="s"></i></div>'; return; }
    if (!r) {
      out.className = "out";
      out.innerHTML = '<div class="empty"><div class="ico">' + icon(mode) + "</div><h3>" + esc(EMPTY[mode][0]) + "</h3><p>" + esc(EMPTY[mode][1]) + '</p><p class="hintline">Press "' + esc(VERB[mode]) + '" to try it on your notes.</p></div>';
      return;
    }
    out.className = "out has";
    if (mode === "cards") return renderCards(out, r);
    if (mode === "quiz") return renderQuiz(out, r);
    out.innerHTML = md(r.text || "");
  }

  function renderCards(out, r) {
    var total = r.cards.length, left = r.queue.length, done = total - left;
    if (!left) {
      out.innerHTML = '<div class="score"><span>All ' + total + " cards done. Nice work.</span></div>";
      var again = document.createElement("button"); again.className = "btn small"; again.type = "button"; again.textContent = "Study them again";
      again.onclick = function () { r.queue = r.cards.map(function (_, i) { return i; }); r.flip = false; renderOutput(); };
      out.appendChild(again); return;
    }
    var c = r.cards[r.queue[0]];
    out.innerHTML = '<div class="cardwrap"><div class="meta"><span>Card ' + (done + 1) + " of " + total + '</span><span>' + done + ' known</span></div>' +
      '<div class="prog"><i style="width:' + Math.round(done / total * 100) + '%"></i></div>' +
      '<div class="stack"><button type="button" class="fc' + (r.flip ? " back" : "") + '" id="fc" aria-label="Flip card">' +
      '<span class="side">' + (r.flip ? "Answer" : "Question") + '</span><span class="txt">' + esc(r.flip ? c.a : c.q) + '</span><span class="hint">' + (r.flip ? "" : "Tap the card to see the answer") + "</span></button></div>" +
      '<div class="row"><button type="button" class="btn again" id="again">Review again</button><button type="button" class="btn primary" id="know">I know this</button></div></div>';
    $("fc").onclick = function () { r.flip = !r.flip; renderOutput(); };
    $("know").onclick = function () { r.queue.shift(); r.flip = false; renderOutput(); };
    $("again").onclick = function () { r.queue.push(r.queue.shift()); r.flip = false; renderOutput(); };
  }

  function renderQuiz(out, r) {
    var answered = 0, score = 0;
    r.qs.forEach(function (q, i) { if (r.picked[i] !== undefined) { answered++; if (r.picked[i] === q.answer) score++; } });
    var html = '<div class="score"><span>' + (answered === r.qs.length ? "Final score" : "Score") + ": " + score + " / " + r.qs.length + "</span><span>" + (r.qs.length - answered) + " left</span></div>";
    r.qs.forEach(function (q, i) {
      var p = r.picked[i];
      html += '<div class="q"><h5>' + (i + 1) + ". " + esc(q.question) + "</h5>";
      q.options.forEach(function (o, j) {
        var cls = "opt";
        if (p !== undefined) { if (j === q.answer) cls += " ok"; else if (j === p) cls += " no"; }
        html += '<button type="button" class="' + cls + '" data-q="' + i + '" data-o="' + j + '"' + (p !== undefined ? " disabled" : "") + '><span class="ltr">' + String.fromCharCode(65 + j) + "</span><span>" + esc(o) + "</span></button>";
      });
      if (p !== undefined && q.explanation) html += '<p class="why">' + esc(q.explanation) + "</p>";
      html += "</div>";
    });
    out.innerHTML = html;
    Array.prototype.forEach.call(out.querySelectorAll(".opt"), function (b) {
      b.onclick = function () { r.picked[+b.dataset.q] = +b.dataset.o; renderOutput(); };
    });
  }

  /* ---------- generation ---------- */
  var ERR = {
    no_key: "Add your Anthropic API key above first.",
    bad_key: "The API key was rejected. Check it and save it again.",
    empty_completion: "Nothing came back. Try again.",
    upstream_error: "The connection failed. Check your internet and try again.",
    not_granted: "Claude access was declined for this page. Reload the page and allow it when asked.",
    sampling_disabled: "Claude is not available for this account.",
    rate_limited: "Too many requests or your usage limit is reached. Wait a little, then try again.",
    invalid_json: "The reply was not in the expected format. Press Generate again.",
    prompt_too_large: "Your notes are too long. Paste a smaller section.",
    session_expired: "Your session expired. Sign in again and retry.",
    refused: "Claude could not help with these notes. Try different text."
  };
  function setBusy(b) { busy = b; $("go").disabled = b; $("stop").hidden = !b; }

  async function generate() {
    if (busy) return;
    if (!ai.ready()) { setStatus("Add your Anthropic API key above first.", true); $("keybox").hidden = false; $("apiKey").focus(); return; }
    var notes = $("notes").value.trim().slice(0, 24000);
    if (notes.length < 80) { setStatus("Add a few lines of notes first (at least 80 characters).", true); return; }
    var m = mode, prompt = buildPrompt(m, notes);
    ctl = new AbortController();
    setBusy(true); setStatus("Thinking..."); renderOutput();
    try {
      if (MODES[m].json) {
        var data = await ai.json(prompt, { signal: ctl.signal });
        if (!Array.isArray(data)) throw { code: "invalid_json" };
        if (m === "cards") {
          var cards = data.filter(function (x) { return x && typeof x.q === "string" && typeof x.a === "string"; });
          if (!cards.length) throw { code: "invalid_json" };
          results.cards = { cards: cards, queue: cards.map(function (_, i) { return i; }), flip: false };
        } else {
          var qs = data.filter(function (x) { return x && typeof x.question === "string" && Array.isArray(x.options) && x.options.length >= 2 && Number.isInteger(x.answer) && x.answer >= 0 && x.answer < x.options.length; });
          if (!qs.length) throw { code: "invalid_json" };
          results.quiz = { qs: qs, picked: {} };
        }
        setStatus("Done.");
      } else {
        var res = await ai.text(prompt, {
          signal: ctl.signal,
          onText: function (u) { results[m] = { text: u.text }; if (mode === m) renderOutput(); }
        });
        results[m] = { text: res.text };
        setStatus(res.truncated ? "The answer was cut short. Try shorter notes." : "Done.");
      }
    } catch (e) {
      if (e && e.code === "cancelled") { setStatus("Stopped."); }
      else {
        if (e && e.text && !MODES[m].json) results[m] = { text: e.text };
        setStatus(ERR[e && e.code] || "Something went wrong. Please try again.", true);
        if (e && (e.code === "not_granted" || e.code === "sampling_disabled")) $("banner").hidden = false;
      }
    } finally {
      setBusy(false); ctl = null;
      if (mode === m) renderOutput();
    }
  }

  function plainText() {
    var r = results[mode];
    if (!r) return "";
    if (mode === "cards") return r.cards.map(function (c) { return "Q: " + c.q + "\nA: " + c.a; }).join("\n\n");
    if (mode === "quiz") return r.qs.map(function (q, i) { return (i + 1) + ". " + q.question + "\n" + q.options.map(function (o, j) { return "   " + String.fromCharCode(65 + j) + ") " + o; }).join("\n") + "\n   Answer: " + String.fromCharCode(65 + q.answer) + (q.explanation ? " (" + q.explanation + ")" : ""); }).join("\n\n");
    return r.text || "";
  }
  async function copyOut() {
    var t = plainText(), msg = $("copied");
    try { await navigator.clipboard.writeText(t); msg.textContent = "Copied."; }
    catch (e) {
      var tmp = document.createElement("textarea"); tmp.value = t; tmp.style.position = "fixed"; tmp.style.opacity = "0";
      document.body.appendChild(tmp); tmp.select();
      var ok = false; try { ok = document.execCommand("copy"); } catch (_) {}
      document.body.removeChild(tmp);
      msg.textContent = ok ? "Copied." : "Select the text and copy it manually.";
    }
  }

  /* ---------- notes handling ---------- */
  function updateCount() {
    var v = $("notes").value, words = (v.trim().match(/\S+/g) || []).length;
    $("count").textContent = words + " words" + (v.length > 24000 ? " (only the first 24,000 characters are used)" : "");
    $("exTag").hidden = v !== EXAMPLE;
  }
  var saveT;
  function persist() {
    clearTimeout(saveT);
    saveT = setTimeout(function () {
      try { localStorage.setItem("studymate-notes", $("notes").value); localStorage.setItem("studymate-opts", JSON.stringify({ level: $("level").value, lang: $("lang").value })); } catch (e) {}
    }, 400);
  }

  function init() {
    buildTabs();
    var saved = null, opts = null;
    try { saved = localStorage.getItem("studymate-notes"); opts = JSON.parse(localStorage.getItem("studymate-opts") || "null"); } catch (e) {}
    $("notes").value = saved !== null && saved !== "" ? saved : EXAMPLE;
    if (opts) { if (opts.level) $("level").value = opts.level; if (opts.lang) $("lang").value = opts.lang; }
    updateCount(); paint();

    $("notes").addEventListener("input", function () { updateCount(); persist(); });
    ["level", "lang", "nCards", "nQuiz", "style", "days"].forEach(function (id) { $(id).addEventListener("change", function () { refreshLab(); persist(); }); });
    $("days").addEventListener("input", refreshLab);
    $("exBtn").onclick = function () { $("notes").value = EXAMPLE; updateCount(); persist(); };
    $("clrBtn").onclick = function () { $("notes").value = ""; updateCount(); persist(); $("notes").focus(); };
    $("fileBtn").onclick = function () { $("file").click(); };
    $("file").addEventListener("change", function () {
      var f = $("file").files && $("file").files[0]; if (!f) return;
      var rd = new FileReader();
      rd.onload = function () { $("notes").value = String(rd.result || ""); updateCount(); persist(); };
      rd.onerror = function () { setStatus("Could not read that file.", true); };
      rd.readAsText(f); $("file").value = "";
    });
    $("go").onclick = generate;
    $("stop").onclick = function () { if (ctl) ctl.abort(); };
    $("copy").onclick = copyOut;

    function showKeyState() {
      var needKey = ai.mode() === "key";
      $("keybox").hidden = !needKey || ai.hasKey();
      $("keyInfo").hidden = !needKey || !ai.hasKey();
    }
    $("saveKey").onclick = function () {
      var v = $("apiKey").value.trim();
      if (!v) { setStatus("Paste your API key first.", true); return; }
      ai.setKey(v); $("apiKey").value = ""; setStatus("API key saved in this browser."); showKeyState();
    };
    $("forgetKey").onclick = function () { ai.clearKey(); setStatus("API key removed from this browser."); showKeyState(); };
    var THEME_KEY = "studymate-theme";
    try { var th = localStorage.getItem(THEME_KEY); if (th === "light" || th === "dark") document.documentElement.dataset.theme = th; } catch (e) {}
    $("themeBtn").onclick = function () {
      var t = document.documentElement.dataset.theme;
      var dark = t ? t === "dark" : window.matchMedia("(prefers-color-scheme: dark)").matches;
      var next = dark ? "light" : "dark";
      document.documentElement.dataset.theme = next;
      try { localStorage.setItem(THEME_KEY, next); } catch (e) {}
    };
    ai.init().then(function () { showKeyState(); if (ai.mode() === "claude") $("themeBtn").hidden = true; });
  }
  init();
})();
