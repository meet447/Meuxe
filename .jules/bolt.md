## 2024-05-18 - ChatPanel React List Re-renders
**Learning:** Managing text input state at the top level of a chat panel (`ChatPanel.tsx`) causes O(N) re-renders (where N is the number of messages) on every single keystroke. This causes a significant performance bottleneck, as all historical `MessageBubble` and `ToolCallBubble` components re-render unless explicitly memoized.
**Action:** Always wrap heavy list item components (like message bubbles) in `React.memo` when the parent container handles frequently updating state like text input, to prevent massive unnecessary re-render trees.

## 2025-01-18 - ChatPanel Map Re-evaluation on Stream
**Learning:** During streaming text generation, rapid state updates trigger frequent renders of `ChatPanel.tsx`. Mapping `timeline` to message bubbles (or evaluating `.some()`) during every re-render recreates JSX descriptors and executes O(N) array loops repeatedly. While `React.memo` stops DOM diffing on children, creating the large array of JSX on each frame causes unnecessary CPU overhead.
**Action:** Wrap `.map()` or `.some()` iterations over message history inside a `useMemo` keyed by the timeline state reference. This prevents recreating element definitions entirely for old messages and completely skips React diffing the history during the O(1) text streaming updates.

## 2023-10-27 - Fast Request Bodies
**Learning:** `reqwest`'s multipart `Part::bytes` with `Vec<u8>` or `Cow::Owned(Vec)` triggers deep copies when cloned inside a loop. `reqwest` inherently supports `bytes::Bytes` efficiently, but it requires using `Part::stream` instead.
**Action:** Use `Part::stream(reqwest::Body::from(bytes::Bytes))` for large binary payloads that need to be sent repeatedly, to leverage O(1) atomic reference counting.

## 2024-05-18 - React Timer Update Batching
**Learning:** Sequential calls to `setTimeout` within an iteration loop that dispatch independent React state updaters can result in non-batched N renders (especially when delays interact with JS event loop task queue processing or React 18+ automatic batching boundaries like setTimeout). Additionally, inner asynchronous timer effects (`setTimeout` within `setTimeout`) should always be tracked via refs or cleared appropriately, as un-tracked inner timers continue executing their closures containing outdated state captures or force component updates after unmount.
**Action:** When updating lists of items via intervals/timeouts, collect keys/IDs and perform a single batched timeout state update `setVisible(prev => prev.map(...))` to ensure atomic updates, significantly reducing render counts and memory leaks. Save all timer handles uniformly in refs and clear them on re-render/unmount.

## 2026-05-01 - Avoid Creating Arrays Inside Loops
**Learning:** Creating arrays from iterables (e.g. `[...map.keys()]` or `Array.from()`) inside a loop incurs significant performance overhead. Measuring this with Node's `perf_hooks` showed around 9-14% performance improvements depending on array size and match positions.
**Action:** Always instantiate arrays from Maps/Sets outside of loops when the underlying collection doesn't change during iteration.

## 2024-05-18 - String Concatenation Overhead for Large Binary Arrays
**Learning:** Appending characters one by one via `binary += String.fromCharCode(bytes[i])` for large TypedArrays (like audio PCM data) causes severe O(N^2) memory reallocation overhead because strings are immutable in JavaScript. For a 60-second audio clip, this can block the main thread for over 1.5 seconds.
**Action:** Use a chunked approach with `String.fromCharCode.apply(null, chunk)` and a chunk size around `0x8000` to avoid Maximum Call Stack errors while significantly reducing string reallocation (e.g., dropping encoding time from 1.5s to 160ms).

## 2026-10-30 - Defeated React.memo via Object Recreation in Maps
**Learning:** When rendering list items, mapping a timeline object to a new object on every render (e.g. `const msg = timelineItemToMessage(item)`) and passing it as a prop defeats `React.memo`'s shallow comparison, causing components to re-render constantly (e.g. during rapid text streaming).
**Action:** Always pass primitive values extracted from the generated object, or pass the original stable item directly to memoized child components to ensure `React.memo` behaves efficiently and prevents O(N) re-renders.
