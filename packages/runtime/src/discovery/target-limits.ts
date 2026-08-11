export const TARGET_LIST_MAX_TARGETS = 128;

// Fully retired identities are retained with their complete private/public
// object and event chain until this horizon. The oldest retired chain is then
// purged atomically; its event cursors expire, while retained cursors and IDs
// remain stable.
export const TARGET_HISTORY_MAX_TARGETS = 512;

// Each retained target keeps a deliverable recent event window plus the latest
// integrity anchor for each event type within this physical bound.
export const TARGET_EVENT_MAX_EVENTS_PER_TARGET = 256;
