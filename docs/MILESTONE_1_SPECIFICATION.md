# Milestone 1 specification — Offline capture shell

**Status:** Approved by the Product Owner for implementation and a synthetic GitHub Pages development preview. Milestone 0 is accepted. Implementation stays on a branch pending explicit merge approval. Production deployment and student-data use require separate authorization.

## Outcome and scope

On an iPhone, a teacher can open the app in Safari or as a Home Screen web app, prepare it for offline use, then reopen it without a network connection to photograph or import one mock answer sheet. They can inspect it, retake it or clear it. The image remains temporary. Provide a responsive, keyboard-accessible surface with visible offline status, capture controls and actionable recovery messages.

Deliver a static app under `app/`, shell assets and manifest, local capture/import and normalization modules, cache and offline-state logic, tests and a reproducible device checklist. Keep runtime dependencies at zero and use relative resource URLs. Deployable artifact contents map to `/talus-scree-mark/`. Include no alignment, layout calibration or discovery, marking, grading, export, persistent images or backend. The capture contract makes no assumption about the sheet's layout, anchors or printed identifiers.

## Capture and import

- The teacher explicitly starts the camera. Request video only, prefer the rear camera, and render an inline preview. Enable the shutter only after a usable frame. Provide a separate local file picker that remains available after a denial, missing camera or other camera error. Give a short retry or permission-recovery cue.
- Stop all tracks and detach the stream on shutter, cancel, error, leaving the capture view, page hide or backgrounding. Invalidate canceled operations and stop any stream that resolves late. Return to an actionable state on resume without restarting the camera. The system file picker may temporarily background the page. Keep its explicitly initiated selection valid when the browser returns it.
- Accept JPEG and PNG based on actual content. Detect types and dimensions before full image decode. Proposed limits are 20 MiB encoded, 24 megapixels, and 8,192 pixels per dimension. Cap the normalized working image at a 2,400-pixel long edge without upscaling and preserve aspect ratio. Treat these as M1 memory/detail defaults, subject to revision from later alignment evidence. Reject unreadable, unsupported or oversized files with a recovery message. Report actual HEIC picker behavior on the iPhone. If the picker provides unsupported HEIC bytes, offer the JPEG/PNG or in-app camera path.
- Normalize orientation exactly once, including supported mirrored EXIF orientations, and strip source metadata by retaining decoded, normalized pixels only. Use a common capture/import output with local ID, source kind, dimensions and pixels. Release source buffers, tracks and preview URLs when no longer needed. Keep at most one active working image. Preserve the previous preview if a replacement fails. Clear or replace it on explicit action, and reset the image and operation state on teardown or reopening, including browser restoration paths.

## Offline lifecycle

Use a relative manifest, local icons and scoped service worker. Test the project subpath including its canonical trailing slash and ensure the worker leaves parent and sibling paths alone. A cold online launch can be used while setup finishes. Show offline ready only after the controlling worker confirms a matching release and all required static assets are present. Show a setup-pending or retry state if install or verification fails. Recheck readiness after controller changes and on app resume. If verified assets are gone, surface that when the app is running and give an online recovery instruction. If storage eviction prevents launch entirely, document the need to reopen online.

Stage each identified release with an explicit critical-asset list, a versioned cache and version-qualified resources or content validation that prevents mixing releases. Reject missing, failed, redirected or unexpected assets during staging. Preserve the active release while an update fails or waits. Use the normal waiting-worker lifecycle and tell the teacher to close and reopen the affected app clients when an update is ready. After activation, serve the matching shell and clean up only this scope's obsolete release caches. Limit interception to known same-origin shell GETs and cache only static assets. Temporary capture/import state always lives outside the service worker.

## GitHub Pages development preview

M1 and subsequent user-facing milestones must provide a directly accessible HTTPS preview for Product Owner testing at [ccheng.github.io/talus-scree-mark/](https://ccheng.github.io/talus-scree-mark/). Publish the tested candidate's static app and any approved synthetic preview assets only. Verify the live entry, version and required paths before reporting it as available. Preserve candidate identity in the test report. Use only synthetic or mock answer sheets on this public preview. The preview authorizes no processing of actual student data. Evaluate a dedicated, isolated HTTPS origin before any actual student-data pilot.

## Privacy acceptance

The app must attempt zero outbound transfers of photos, metadata, results or derived image content. It uses no analytics, CDN, cloud inference, write API, remote fonts or user accounts. The only expected application network traffic is documented same-origin GETs for initial static delivery and updates. The app must create no persistent working image, identifier, metadata or capture history in Cache Storage, IndexedDB, local/session storage or other app-origin persistence. It must leave no app-created copy in Photos or Files. Imports read a teacher-selected source, which remains managed by the source app.

Use synthetic and physical mock sheets. For an online run, inspect browser-context requests, worker events where available, test-server logs and request URLs and bodies. Audit source paths that can send requests, and verify app storage entries following capture, import, clear, failure and reopen. Repeat the core workflow offline and record connectivity state. A network monitor alone cannot establish that an attempted transfer was absent while offline.

## Independent acceptance matrix

| ID | Required observed result | Evidence |
| --- | --- | --- |
| M1-01 Scope and layout | App, manifest, worker and local icons resolve under `/talus-scree-mark/`. Parent/sibling pages are unaffected. Controls remain usable in phone portrait and landscape. Keyboard users can see focus and operate every app-provided control. | Desktop browser, iPhone spot check. |
| M1-02 Fresh install | Clean profile shows pending until the matching worker controls the page and required assets verify. A deliberately failed asset prevents ready. Restoration plus retry recovers. | Desktop browser with deterministic server faults. |
| M1-03 Real offline launch | Warm Safari and Home Screen independently. Verify ready in each, then disable cellular and Wi-Fi, close Safari or quit the Home Screen app, and reopen in each mode before restoring connectivity. Complete camera capture, local import, preview, retake and clear in each mode. | Actual iPhone in Safari and installed Home Screen mode. |
| M1-04 Release isolation | Stage an interrupted or missing-asset v2 while v1 is active. Old clients and a cold offline launch still use v1. Stage a complete v2, close old clients, reopen and verify a coherent v2 offline. Simulated asset loss reports degraded readiness when the app can launch. | Desktop fault injection and a controlled iPhone update on the approved test origin. Distinguish injected loss from observed OS eviction. |
| M1-05 Camera lifecycle | Grant, deny and recover permissions. Verify camera preference where the device exposes a rear camera, cancel, retake and background/foreground recovery. Import still works after denial. Test late-resolving stream cleanup independently. | Actual iPhone in both modes for physical behavior, desktop test doubles for deterministic races. |
| M1-06 Import and preview | Asymmetric JPEG/PNG fixtures render upright and correctly mirrored where specified. Accept valid JPEG/PNG bytes despite an incorrect extension or MIME label. Reject corrupt, unsupported or oversized bytes with a clear message, including unsupported bytes labeled as JPEG/PNG. Validate actual iPhone picker output and portrait/landscape shots. Preview survives a failed replacement. Clear/reopen removes the working image. | Unit tests, desktop browser and actual iPhone. |
| M1-07 Privacy | No image data or metadata leaves the app, no capture content enters persistent storage, and cache contents match the static allowlist. Verify online failed and successful operations as well as offline workflows. | Static audit, desktop browser and server evidence, corroborated by iPhone workflow. |

For each run record candidate commit/build, test origin and subpath, device/OS, browser mode, fixture IDs, install/cache state, exact steps, expected/actual results and sanitized evidence. Test the GitHub Pages preview on the Product Owner's reference iPhone and record the phone model and iOS build. Desktop Chromium or desktop WebKit gives browser integration evidence. Emulation and simulated camera input provide no physical-device result. Device-dependent gates remain pending until run on physical iPhone hardware.

## Roles and review

The Developer implements and tests from the approved spec. The Independent Tester owns the acceptance oracles and verifies the exact candidate. The Research Evaluator reviews image normalization and capture fixtures for future recognition work and records capture constraints. Recognition accuracy is outside M1. If defects are verified, use one bounded correction with regression tests followed by focused independent retest and Coordinator disposition.

Provide the clickable GitHub Pages URL, candidate and test evidence, known limitations, and step-by-step iPhone instructions for camera capture, JPEG/PNG import, retake, clear, Home Screen installation and offline reopening. Label the publication and hardware gates pending if they remain unverified. A development preview and completed desktop checks do not constitute Product Owner acceptance of M1.

## Platform references

- [Apple Home Screen web app instructions](https://support.apple.com/guide/iphone/open-as-web-app-iphea86e5236/27/ios/27)
- [MDN camera and secure-context requirements](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia)
- [MDN waiting service worker](https://developer.mozilla.org/en-US/docs/Web/API/ServiceWorkerRegistration/waiting)
- [WebKit storage policy](https://webkit.org/blog/14403/updates-to-storage-policy/)
- [Playwright worker network observation](https://playwright.dev/docs/service-workers#network-events-and-routing)
