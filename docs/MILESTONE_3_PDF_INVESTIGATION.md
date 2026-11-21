# M3 local blank-PDF import investigation

M3 supports JPEG and PNG enrollment. Direct single-page PDF enrollment is deferred under the approved nonblocking PDF scope.

A viable offline implementation is to ship a pinned, same-origin PDF.js display module and worker, pass the file bytes to the display layer, enforce exactly one page, bound the viewport and render a canvas for the existing image pipeline. The viewer path would also need explicit worker/offline integration, licensing notices, malformed and encrypted input handling, font/resource behavior, and physical Safari and Home Screen tests.

I measured the minified display and worker files in the published Apache-2.0 `pdfjs-dist@6.5.438` package. They totaled 1,746,199 bytes before compression (474,284 + 1,271,915) and 515,690 bytes when individually gzipped (136,463 + 379,227). These figures cover the two modules only. No PDF runtime was shipped, and this inspection did not test rendering or iPhone support. The extra runtime and separate device-validation path are the basis for deferral.

Use the raster blank paired with each printable benchmark PDF. For another synthetic form, rasterize the single page locally at a resolution that preserves its bubble outlines and whole page before enrolling it.

- [PDF.js browser rendering walkthrough](https://mozilla.github.io/pdf.js/examples/)
- [PDF.js distribution](https://www.npmjs.com/package/pdfjs-dist/v/6.5.438)
