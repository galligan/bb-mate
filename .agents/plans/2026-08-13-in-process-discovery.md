# #99 — In-process primary-host discovery

## Outcome

Run bounded manifest discovery and the bb-owned development-target catalog in
the Studio plugin process. The production plugin must not start or call the
packaged child runtime. Enrolled-host and ambiguous project sources remain
unavailable.

## Proof

- [x] RED/GREEN: direct adapter preserves grouped aliases, overlapping roots,
      complete/partial inventories, capacity limits, and retirement/reopen.
- [x] RED/GREEN: one refresh is shared by concurrent RPC calls; disposal aborts
      and drains it, with no catalog write after abort.
- [x] RED/GREEN: sources are revalidated before scanning and before catalog
      mutation; non-primary, mixed, and ambiguous sources fail closed.
- [x] RED/GREEN: RPC/frontend schema v4 contains only
      `{schemaVersion: 4, browserLaunch: "unavailable", projects}` and errors
      remain path-private while last-good project data is retained.
- [x] Production plugin imports and registrations have no supervisor,
      background service, or child-runtime call.
- [x] Runtime, inspection, Studio, build, visual, accessibility, check,
      formatting, and diff checks pass.

## Boundary

Keep child/runtime/serve/artifact/package files for #101. Do not add upstream bb
work or an enrolled-host filesystem fallback.
