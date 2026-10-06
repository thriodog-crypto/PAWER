# SDD ledger — plan: docs/superpowers/plans/2026-10-06-local-coach.md

Baseline ffbe54b; 30 tests pass. Branch feature/local-coach.
Ruling: work in the existing checkout on a feature branch, not a second worktree — user explicitly asked to stop process confirmations and implement here; existing uncommitted docs/art are this task's assets — isolation is branch-level, not filesystem-level.
Pre-flight: tasks 1→2→3 share optional feedback fields; tasks 2→4 share date helper. Preserve public signatures.
Ruling: interpret legacy equipment as unknown; no numeric weight progression until new sessions capture equipment — safer than inventing comparability — existing histories get conservative advice.
Task 1: implemented. Optional feedback normalization, snapshots before assessment, no effort inheritance, serialized IndexedDB writes. Four data tests RED→GREEN.
Task 2: implemented. Conservative snapshot-aware rules, tone/context catalogue and schedule helper. Original engine tests RED→GREEN.
Task 3: implemented. Four existing arts integrated; optional assessment, safe retry, editable feedback, deliberate rewards button. Component tests RED→GREEN.
Task 4: implemented. Schedule/tone settings, unit-aware load steps, fresh optional pre-workout wellbeing check; pre-workout symptoms remain protective at completion. Tests RED→GREEN.
Ruling: pass an awaited onSave callback to WorkoutCoach instead of a fire-and-forget update — never display assessment success before durable persistence — interface differs from plan but existing storage is retained.
Ruling: persist startWellbeing separately — skipping end feedback must not erase symptoms recorded at the beginning — adds one optional backward-compatible field.
Ruling: consolidate implementation into one verified commit rather than four intermediate commits — all changes share App integration; original baseline remains the rollback point — less granular rollback.
Final review: fresh read-only coach_final_review (gpt-6-astra). No critical findings; five important findings fixed.
Final: fixed unnamed advice cards — definition-ID regression RED→GREEN.
Final: fixed reduced-snapshot progression — reduced original program regression RED→GREEN.
Final: fixed false full-program praise — snapshot target weight/repetition regression RED→GREEN.
Final: fixed resurrected skipped effort — discard/edit interaction regression RED→GREEN.
Final: fixed false saved headline — summary failure presentation regression RED→GREEN.
Final: minor (deferred): no explanatory effort-rating legend beyond the three labels.
Final: minor (deferred): failed coach image is hidden, with the speech text retained, rather than WolfArt fallback.
Verification: 61/61 tests; pnpm build passes; git diff --check clean. Browser at 390×844 verified start wellbeing, exercise creation, set entry and rest. Browser automation stalled on native finish confirm; fresh tab also unresponsive. Final visual screenshot/reload validation remains unverified; DOM component tests cover skip/save/failure/edit instead.
Ruling: preserve feature/local-coach locally without another approval question or production push — user requested no repeated confirmations; production verification is not complete — site has not changed yet.

## Publication continuation — 2026-10-06

User explicitly requested to continue through publication. Previous local-only ruling is superseded.
Fresh verification: 61/61 tests, production build and diff check pass.
Browser QA completed on local synthetic workout: partial workout finish → optional returning/good/normal assessment → support art and no-progression advice → reload → history. Assessment/phrase persisted and questionnaire did not reopen. At 390px viewport the document scroll width was 381px; art loaded with contain at 314×260. Screenshot capture remains unavailable in the browser backend; DOM and loaded-image checks succeeded.
Publication target confirmed from existing workflow: origin/main → GitHub Pages at https://thriodog-crypto.github.io/PAWER/. Remote main f605e6a is an ancestor of the reviewed branch; fast-forward only, no force push.
