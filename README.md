# StudyMate AI

An AI study assistant for students. Paste your notes and get a revision summary, flashcards, a practice quiz, a simpler explanation or a day-by-day study plan. It runs entirely in the browser (plain HTML, CSS and JavaScript, no build step) and talks to Claude.

Built as a project for the Prompt Engineering course. The app has a **Prompt lab** panel that shows the exact prompt behind each tool, so the techniques are visible, not hidden.

## Features

| Tool | What it does | Output |
| --- | --- | --- |
| Summary | Big idea, key points, terms to remember, a likely exam question | Streamed text |
| Flashcards | Question and answer cards; flip, mark known or review again | JSON |
| Quiz | Multiple choice questions with scoring and an explanation per answer | JSON |
| Simplify | Explains the notes like you are 10, with an analogy, or as a dialogue | Streamed text |
| Study plan | A plan for the number of days you have, with a self-test per day | Streamed text |

Also: Hindi, Hinglish and English replies, three study levels, `.txt` / `.md` upload, copy to clipboard, light and dark theme, works on phones. Notes are saved only in your browser.

## Prompt engineering techniques used

| Technique | Where |
| --- | --- |
| Role prompting ("You are StudyMate, a patient tutor for ...") | Every tool |
| Grounding rules ("use only the notes, say so if something is missing") | Every tool, reduces made-up facts |
| Step-by-step reasoning before the answer | Summary |
| Fixed output format with headings | Summary, Study plan |
| Few-shot example | Flashcards, Quiz |
| Structured JSON output, validated in code | Flashcards, Quiz |
| Constraints (answer length, 4 options, vary the correct position) | Flashcards, Quiz |
| Style control through a parameter | Simplify |

The prompts live in `buildPrompt()` in `js/app.js`.

## Run locally

No install needed. Serve the folder with any static server:

```bash
python3 -m http.server 8000
```

Open http://localhost:8000 and paste your Anthropic API key when asked.

## How the AI connection works

`js/ai.js` has two modes behind one interface:

- **Inside Claude**: if the page is opened as a Claude artifact, it uses Claude directly. No key is needed.
- **Anywhere else** (GitHub Pages, localhost): each visitor pastes their own Anthropic API key. It is stored in that browser's `localStorage` and sent only to `api.anthropic.com`. There is no server and the key is never committed to this repository.

The model is set by the `MODEL` constant at the top of `js/ai.js`.

Security note: a key stored in a browser can be read by anyone with access to that browser. Use a key with a low spending limit and do not use it on a shared computer. For a public product, put a small backend in front of the API instead.

## Deploy to GitHub Pages

1. Push this repository to GitHub.
2. Open **Settings > Pages** and set **Source** to **GitHub Actions**.
3. The workflow in `.github/workflows/pages.yml` publishes the site on every push to `main`.
4. Your site appears at `https://<your-username>.github.io/<repo-name>/`.

## Project structure

```
index.html                    page markup
css/style.css                 theme tokens (light and dark) and layout
js/ai.js                      Claude connection (Claude mode and API key mode)
js/app.js                     prompts, UI, flashcards, quiz
.github/workflows/pages.yml   GitHub Pages deployment
```

## Limitations

- Notes longer than 24,000 characters are cut. Paste one chapter at a time.
- The AI can still make mistakes. Check important facts against your textbook.
- Images and PDFs are not read yet; upload plain text.

## License

MIT, see `LICENSE`.
