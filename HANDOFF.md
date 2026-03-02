# Handoff Notes

## 2026-02-26: Match Level Label & Sorting Fix

### Problem
- Creator Brand Match results showed MEDIUM-labeled results between HIGH results
- Match level labels were determined by source type (BOTH = HIGH) rather than actual score
- Single-source results could never get HIGH label because the threshold was `score >= 1` (impossible for cosine similarity)
- `getMatchLevelPriority` was defined but never used in sorting

### Changes

**Label logic** (`page.tsx`, `SimilarVideoResults.tsx`):
- Removed source-type dependency from label determination
- New pure score-based thresholds: HIGH >= 0.9, MEDIUM >= 0.7, LOW < 0.7
- BOTH-source results already receive a 5% score boost in `combineSearchResults`, so they naturally score higher

**Sorting** (`page.tsx`):
- Changed from pure score sorting to level-first sorting
- Results now sort by match level (HIGH > MEDIUM > LOW), then by score within each level
- Uses the existing `getMatchLevelPriority` function that was previously unused

## 2026-02-26: React Security Update

- Upgraded `react` and `react-dom` from 19.1.0 to 19.1.2 (CVE-2025-66478)

## 2026-02-26: Segment Match Visualization

매칭 결과에서 어떤 구간끼리 비슷해서 추천된 건지 시각적으로 표시.

### Segment Match Data Pipeline
- Pinecone 클립 검색 시 video별 상위 3개 세그먼트 매치 쌍 보존하여 프론트까지 전달
- `SegmentMatch` 타입 추가 (`types/index.ts`)
- video-to-video / text-to-video 양쪽 라우트에서 세그먼트 정보 수집
- `combineSearchResults`에서 text/video 양쪽 segmentMatches 병합, 상위 5개 유지

### Ranking Logic
- 기존: 등급 우선 정렬 + 15% boost → 역전 발생
- 변경: 순수 점수순 정렬 + 5% boost. 라벨은 시각적 표시로만 사용

### Segment Playback UX
- 결과 카드 hover → 첫 번째 매칭 구간 자동 재생 (muted, loop)
- 개별 세그먼트 클릭 → 해당 구간 재생 (loop)
- 기본 3개 표시 + "더 보기" 버튼으로 전체 펼치기
- 각 세그먼트에 VID(파란)/TXT(보라) 소스 라벨

### Text Search Term Fix
- 기존: user_metadata 모든 string 값 → 날짜 등 노이즈 포함
- 변경: brand_product_events에서 브랜드명, creator, tones, styles만 추출

## 2026-02-27: Source-Target Segment Sync & UI Improvements

### Problem
- Hovering/clicking a matched segment only played the target video, not the source segment
- Root cause: `onPlayerReady` race condition with `<hls-video>` custom element ref
- Source video kept playing after cursor left a result card

### Changes

**Source-target segment sync** (`VideoPlayer.tsx`, `page.tsx`, `SimilarVideoResults.tsx`):
- `onPlayerReady`를 `useEffect` watching `isVideoReady`로 이동 → ref 보장
- `onPlayerReadyRef`로 최신 콜백 참조
- `handleSourceSegmentClear` → mouse leave 시 소스 비디오 pause + segment clear

**Segment click UX**:
- Active segment: blue ring highlight
- 클릭 시 source/target 모두 lock (mouse leave 무시)
- 새 카드 hover 시 이전 클릭 비디오 pause

**Video dropdown** (`VideosDropdown.tsx`):
- 파일 확장자 제거, full width, tighter text styling

**Admin metadata editor** (`admin/page.tsx`):
- Inline key-value metadata editor per video

## 2026-03-02: Source/Target UI 개선 & Creator Name Override

### Source/Target Selection
- Source에서 Creator 옵션 제거 — Brand, Brand-PPL만 소스로 선택 가능
- 체크박스 → pill toggle 버튼 디자인으로 변경 (rounded-full 컨테이너 + 선택 시 bg-[#1D1C1B])
- 앱 전체 디자인 언어(Milling font, rounded pills, gray border)와 통일

### VideoPlayer 개선 (`VideoPlayer.tsx`)
- `creatorNameOverride`, `brandNameOverride` props 추가 — metadata 없어도 이름 표시 가능
- `onReadyChange` callback prop 추가

### SimilarVideoResults 개선 (`SimilarVideoResults.tsx`)
- PPL 결과 감지 로직 추가 (`indexNameMap`으로 PPL 여부 판별)
- Creator name 추출: user_metadata → filename 패턴 fallback
- PPL 결과에도 creator tag 표시

### Admin 페이지 (`admin/page.tsx`)
- `triggerBulkAnalyze`를 범용화 (targetIndexId, label 파라미터)
- "Re-analyze All PPL" 버튼 추가

### Handoff 파일 통합
- `HANDOFF-segment-match-visualization.md` → `HANDOFF.md`로 병합, 파일 삭제
