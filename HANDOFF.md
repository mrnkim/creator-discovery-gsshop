# Handoff Notes

## 2026-02-26: Match Level Label & Sorting Fix

### Problem
- Creator Brand Match results showed MEDIUM-labeled results between HIGH results
- Match level labels were determined by source type (BOTH = HIGH) rather than actual score
- Single-source results could never get HIGH label because the threshold was `score >= 1` (impossible for cosine similarity)
- `getMatchLevelPriority` was defined but never used in sorting

### Changes

**Label logic** (`src/app/creator-brand-match/page.tsx`, `src/components/SimilarVideoResults.tsx`):
- Removed source-type dependency from label determination
- New pure score-based thresholds: HIGH >= 0.9, MEDIUM >= 0.7, LOW < 0.7
- BOTH-source results already receive a 5% score boost in `combineSearchResults`, so they naturally score higher

**Sorting** (`src/app/creator-brand-match/page.tsx`):
- Changed from pure score sorting to level-first sorting
- Results now sort by match level (HIGH > MEDIUM > LOW), then by score within each level
- Uses the existing `getMatchLevelPriority` function that was previously unused

## 2026-02-27: Source-Target Segment Sync & UI Improvements

### Problem
- Hovering/clicking a matched segment in search results only played the target (result) video, not the corresponding source video segment
- Root cause: `onPlayerReady` in VideoPlayer was called from a `loadstart` event handler where `playerRef.current` could be null (race condition with `<hls-video>` custom element ref setup), so the source player controls were never registered
- Source video kept playing after cursor left a result card, while target video stopped (out of sync)
- Video dropdown showed file extensions (e.g. `.mp4`) and was too narrow

### Changes

**Source-target segment sync** (`VideoPlayer.tsx`, `page.tsx`, `SimilarVideoResults.tsx`):
- Moved `onPlayerReady` from `handleReady` event handler to a `useEffect` watching `isVideoReady` — guarantees `playerRef.current` is set (useEffect runs after React commit phase)
- Used `onPlayerReadyRef` to always reference the latest callback without re-triggering the effect
- Added `handleSourceSegmentClear` callback to pause source video and clear segment on mouse leave
- Added `onSourceSegmentClear` prop to SimilarVideoResults, called in `onMouseLeave` (skipped when segment is clicked)

**Segment click UX** (`SimilarVideoResults.tsx`):
- Active segment highlighted with blue ring (`bg-blue-50 ring-1 ring-blue-300`)
- Clicking a segment locks both source and target videos (immune to mouse leave)
- Hovering a new card pauses any previously clicked video

**Video dropdown** (`VideosDropdown.tsx`):
- Strip file extensions from displayed video names
- Removed `max-w-sm`, uses full container width
- Tighter text styling (`text-md tracking-tight`)

**Admin metadata editor** (`admin/page.tsx`):
- Inline key-value metadata editor per video (Edit Metadata button)
- Add/remove metadata fields, save via `/api/videos/updateUserMetadata`

## 2026-02-26: React Security Update

### Problem
- Vercel deployment blocked due to CVE-2025-66478 (React Server Components RCE vulnerability)

### Changes
- Upgraded `react` and `react-dom` from 19.1.0 to 19.1.2
