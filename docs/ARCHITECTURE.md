# Proposed architecture

Use static HTML, CSS and native ES modules. Keep browser adapters separate from pure image and grading logic. Build under `app/` with an app shell, relative manifest and service worker, `src/` for modules, and same-origin `assets/`. For a future approved GitHub Pages deployment, publish the contents of `app/` as the artifact root so the entry point is `/talus-scree-mark/`. Keep verification in `tests/` and design records in `docs/`. Start with Node's test runner and zero runtime dependencies. Add a dev-only browser harness when M1 needs it.

| Boundary | Input | Output and ownership |
| --- | --- | --- |
| Capture | Live camera or explicit image import | Bounded, orientation-normalized image and local source ID. Handle errors and free camera tracks on exit. |
| Alignment | Image and registration hints | Page projection, quality diagnostics, source-to-page transform and aligned pixels, or retake/review status. |
| Layout | Aligned page and selected/identified profile | Stable template revision and item IDs, normalized rectangles, symbol maps and validation results. |
| Bubble OMR | Aligned page and approved regions | Per-cell raw scores and candidates, per-field states and evidence references. |
| Handwriting | Predefined cell crops | Optional per-character candidates and confidence, model version and evidence references. |
| Comparison | Bubble and handwriting readings | Agreement, disagreement or unavailable. Route mismatches to review without changing either reading. |
| Review | Recognition run plus correction history | Effective response, pending-review status and auditable correction events. |
| Grading | Effective response, versioned optional key and policy | Exact score or explicit unkeyed/review state. |
| Storage and export | Local session, artifacts, grades and corrections | Versioned IndexedDB transactions, JSON audit export and a CSV grade view. Export begins with teacher action. |

Coordinates are normalized to the rectified page, origin top left, x rightward, y downward. Keep layout IDs, revisions and item IDs stable and validate topology before processing. Use reusable teacher-selected per-test profiles first. Prefer printed orientation/registration anchors and a layout ID. Provide a reviewed fallback for supported sheets without anchors after measuring usability and failure modes. Surface a wrong or uncertain profile before attempting to grade. Treat automatic discovery of novel layouts as a separate capability.

An immutable recognition run records the capture, explicit processing version, profile revision, raw MC and cell-level NR evidence and review reasons. Distinguish blank, single, multiple, ambiguous and unreadable. Preserve literal NR strings and per-cell blanks, leading zeros, decimal position and any printed sign. Treat grading normalization as a separate versioned rule. Corrections are append-only events with previous/effective response, new response, reason, timestamp and source run reference. Reprocessing creates a fresh run and requires a defined decision about carrying corrections forward.

Use video only for in-app capture, with a rear-camera preference and file-import fallback. Decode and normalize orientation once, apply bounds to image dimensions and working memory, and move substantial processing to a dedicated worker with a bounded queue. Define raw-image and crop retention before pilot use. Keep storage and image deletion transactional where possible and report policy failures visibly.

## Offline installation and hosting

Scope the manifest and service worker to the app's relative path. Test the actual GitHub Pages-style subpath. Precache an explicit versioned app-shell allowlist. Confirm that a compatible worker controls the app and verified required assets are available before reporting offline readiness. Preserve the previous usable shell during interrupted updates. Cache optional, version-pinned same-origin CNN/runtime assets separately and expose their own readiness. Keep student data in the local data layer outside the service-worker cache and keep all capture and grading operations free of outbound requests.

WebKit storage is subject to quota and eviction. Plan quota and migration failure handling, explicit deletion, and a local recovery path. Serve device tests on an authorized HTTPS origin. GitHub Pages project paths share the `ccheng.github.io` origin, so service-worker scopes or distinct database names do not isolate student data from other same-origin pages. Prefer a dedicated HTTPS origin before any student-data pilot, subject to approval. Browser-origin boundaries and platform backup/export behavior must be verified before such a pilot.

- [WebKit storage policy](https://webkit.org/blog/14403/updates-to-storage-policy/)
- [MDN origin and storage isolation](https://developer.mozilla.org/en-US/docs/Web/Security/Same-origin_policy#cross-origin_data_storage_access)
- [Secure-context requirements](https://developer.mozilla.org/en-US/docs/Web/Security/Defenses/Secure_Contexts/features_restricted_to_secure_contexts)
