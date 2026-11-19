# Complete Article Output Implementation Plan

> **For agentic workers:** Use executing-plans to run the checkpoints inline.

**Goal:** Give the model room to finish each article and automatically continue an interrupted draft at most once.

**Architecture:** Share a streamed Messages API reader between generation and manual/automatic continuation. Keep the selected endpoint, model, and key consistent for both calls in one article. The existing course prompt remains the source of the target length.

**Tech Stack:** Static HTML, browser Fetch/Streams, Node.js test runner.

### Task 1: Verify generation and continuation

**Files:** `index.html`, `tests/article-output.test.mjs`, `tests/api-config.test.mjs`.

- [x] Run the real page script without startup in Node with a stubbed browser and SSE responses. Test one request on normal completion, a 12000-token ceiling, split chunks, continuation on a length stop or a partial sentence, a single automatic attempt, and a failed continuation that preserves the draft and manual action.
- [x] Run `node --test tests/article-output.test.mjs`. Expect failures on the existing 4096 ceiling, dropped split data, and missing automatic continuation.
- [x] Add a shared request reader that carries unfinished lines between chunks, captures the stop reason, and keeps the existing live preview. Call it once initially and at most once to append to an unfinished result. Preserve the existing manual button and keep the draft available if a continuation fails.
- [x] Replace static counts of fetch calls and model lookups with runtime assertions for the endpoint and model on each request.
- [x] Run `node --test tests/*.test.mjs` and `git diff --check`. Confirm all tests pass and no whitespace errors remain.
