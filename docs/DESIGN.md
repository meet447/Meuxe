# Meuxe design language

Meuxe should feel like a **personal desk companion**, not a tech demo or an enterprise AI console. The visual system balances Linear/Raycast-style utility (structured sidebar, keyboard-first, quiet chrome) with Notion-style warmth from the mascot and pastel tints — never from warm greys.

Tokens live in `src/index.css` (`@theme`). Primitives live in `src/components/ui/`. **Use them** — do not hand-roll colours, radii, shadows or icons in feature components.

## Principles

1. **Neutral, low contrast.** Surfaces are neutral white and grey; text is neutral near-black (`ink`). Colour appears only as pastel tints for highlights, status and the mascot. No saturated fills. Never put white text on a pastel.
2. **Soft geometry.** Generous radii everywhere (`rounded-control` and `rounded-field` 12px, `rounded-card` 16px, `rounded-panel` 20px, `rounded-sheet` 24px). Buttons and inputs are pillow-like. Add `squircle` to containers so browsers that support `corner-shape` smooth the corners further.
3. **Flat, not floating.** Nothing casts a drop shadow. Elevation is a surface-colour shift plus a 1px hairline edge: `shadow-soft` and `shadow-float` are just neutral rings (0.07 / 0.09 alpha) so a white card still reads on a white page; `shadow-pop` adds one very faint blur and is reserved for overlays (modals, popovers) sitting on a scrim. A `line` hairline is fine where white meets white. Never stack `border + ring + shadow + backdrop-blur`.
4. **Negative space divides.** Sidebar and main content are separated by canvas background and padding, not by lines.
5. **Restrained iconography.** One stroke weight (1.6), round caps, from `ui/icons.tsx`. No emoji as UI icons.
6. **Mascot as anchor.** The blob (`<Mascot />`) appears in the mark, empty states and loading moments. It signals “friendly, collaborative, non-threatening”.
7. **Craft-hacker texture.** The stippled text-art strip (`<AsciiAccent />`) is an optional flourish for empty states and panel headers, in `ink-4`, never louder. It is not part of onboarding.
8. **Copy is human.** Sentence case. No uppercase-tracked micro-labels except for tiny status pills. Say “Your companion remembers this” rather than “MEMORY VAULT”.

## Palette

| Token | Use |
|---|---|
| `surface-2` `#ffffff` | Raised: inputs on focus, hover, message cards |
| `surface` `#fcfcfc` | Default panel / card |
| `canvas` `#f4f4f5` | App background behind panels |
| `well` `#f0f0f2` / `well-2` `#e6e6e9` | Sunken insets, resting inputs, sidebar rails, code |
| `line` `#ebebee` / `line-2` `#dcdce0` | Hairlines (sparingly) |
| `ink` `#1b1b1e` → `ink-4` `#bbbbc2` | Text: primary, secondary, tertiary, placeholder |
| `accent-*` (pastel amber, 300 = `#f3cd78`) | Tint for highlights, selection rings, links, mascot body, user chat bubbles (`bg-accent-300 text-ink`). Not for filled buttons with white text — primary actions are ink. |
| `peach-*` (pastel rose) | Soft highlights |
| `honey-*` (pastel lemon) | In progress, needs attention |
| `sage-*` (pastel mint) | Ready / success |
| `clay-*` (pastel coral) | Destructive / errors |

The default Tailwind palette is disabled (`--color-*: initial`). If a class like `bg-slate-100` slips in it will silently render nothing — grep for `slate|blue|indigo|violet|gray|emerald|red-` before merging.

## Type

- **Figtree** for all UI. Headings 600–700, `tracking-tight`, line-height 1.2. Body 400–500, 14–15px, relaxed line height.
- **JetBrains Mono** for code, file paths, tool arguments and the ASCII accent.
- Sizes: page title 22–26px, section 15–16px semibold, body 14–15px, meta 12–13px `ink-3`, pills 11px.

## Layout

- **App shell** — canvas background with 12px padding; a 64px icon rail on the left (mark on top, settings at bottom); the avatar stage is a `rounded-panel` `surface` card that fills the rest. The conversation docks to the right as a second panel (not an overlay). Settings opens as a centred sheet with its own left navigation.
- **Composer** — a single pill field (`rounded-full`, `surface-2`, hairline edge via `shadow-float`) anchored at the bottom of the stage: mic on the left, ink send button on the right.
- **Onboarding** — centred single-column flow on a light page (`bg-surface`): thin top bar with the mark and five tiny progress dots on the right; mascot, meta line, heading and subtitle centred; content in a 560px column; footer row with ghost Back on the left and an ink primary Continue on the right.
- **Mini widget** — transparent window. Chrome stays minimal and appears on hover; same tokens, same radii.

## Primitives (`src/components/ui`)

| Component | Notes |
|---|---|
| `Button` | `primary` ink (`bg-ink text-white`), `secondary` raised surface, `soft` tinted, `ghost`, `danger`, `danger-soft`; sizes `sm/md/lg`; `leading/trailing/loading` |
| `IconButton` | square, `label` required, `active` state |
| `Surface` | tones `surface/raised/well/canvas`; radius `control…sheet`; elevation `none/soft/float/pop`; `interactive` |
| `Field`, `Label`, `Input`, `Textarea`, `Select`, `Hint`, `FieldError` | inputs rest in a `well`, lift to `surface-2` on focus with a soft accent ring |
| `ChoiceCard` | selectable option tile with leading glyph, title, description; selected check is `bg-ink` |
| `Pill` | status chips; tones map to palette; `dot`/`pulse` |
| `Notice` | soft callout, no border |
| `Mascot`, `MeuxeMark` | mascot moods: `neutral/happy/thinking/sleepy/surprised`; mark is a pale amber (`accent-100`) squircle holding a warm mascot |
| `AsciiAccent` | stippled strip, deterministic per seed; optional flourish for empty states |
| `Dots` | thinking indicator |
| `Kbd`, `KeyCombo` | keycaps |
| `VibeGlyph` | stroke icon for a personality pack |
| `icons.tsx` | the icon set |

## Motion

Short and soft: `animate-fade-in`, `animate-rise-in`, `animate-pop-in` (≤350ms, `--ease-soft`). Ambient: `animate-breathe`, `animate-blink` on the mascot, `animate-dot` for thinking. Respect `motion-safe:`.
