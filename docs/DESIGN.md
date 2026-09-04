# Meuxe design language

Meuxe should feel like a **personal desk companion**, not a tech demo or an enterprise AI console. The visual system balances Linear/Raycast-style utility (structured sidebar, keyboard-first, quiet chrome) with Notion/Figma-style warmth (soft shapes, a friendly mascot, gentle colour).

Tokens live in `src/index.css` (`@theme`). Primitives live in `src/components/ui/`. **Use them** — do not hand-roll colours, radii, shadows or icons in feature components.

## Principles

1. **Warm, low contrast.** No pure white, no cool grays, no saturated blue. Surfaces are warm off-whites; text is warm near-black. Accents are caramel, honey and muted peach.
2. **Soft geometry.** Generous radii everywhere (`rounded-card` 24px for tiles, `rounded-panel` 28px for docks/panels, `rounded-sheet` 36px for modals). Buttons and inputs are pillow-like. Add `squircle` to containers so browsers that support `corner-shape` smooth the corners further.
3. **Tactile minimalism.** Elevation comes from a surface-colour shift plus an ultra-soft, low-opacity shadow (`shadow-soft`, `shadow-float`, `shadow-pop`). Hard borders are the exception: a hairline (`line`) is allowed only where two same-colour surfaces would otherwise merge. Never stack `border + ring + shadow + backdrop-blur`.
4. **Negative space divides.** Sidebar and main content are separated by canvas background and padding, not by lines.
5. **Restrained iconography.** One stroke weight (1.6), round caps, from `ui/icons.tsx`. No emoji as UI icons.
6. **Mascot as anchor.** The blob (`<Mascot />`) appears in the mark, empty states and loading moments. It signals “friendly, collaborative, non-threatening”.
7. **Craft-hacker texture.** The stippled text-art strip (`<AsciiAccent />`) is the one decorative flourish — use it in onboarding, empty states and panel headers, in `ink-4`, never louder.
8. **Copy is human.** Sentence case. No uppercase-tracked micro-labels except for tiny status pills. Say “Your companion remembers this” rather than “MEMORY VAULT”.

## Palette

| Token | Use |
|---|---|
| `canvas` `#f3eee6` | App background behind panels |
| `surface` `#faf7f2` | Default panel / card |
| `surface-2` `#fffdfa` | Raised: inputs on focus, message cards, hover |
| `well` `#eee8df` / `well-2` | Sunken insets, resting inputs, sidebar rails, code |
| `line` / `line-2` | Hairlines (sparingly) |
| `ink` → `ink-4` | Text: primary, secondary, tertiary, placeholder |
| `accent-*` (caramel) | Primary actions, selection, links |
| `peach-*` | User messages, warm highlights |
| `honey-*` | In progress, needs attention |
| `sage-*` | Ready / success |
| `clay-*` | Destructive / errors |

The default Tailwind palette is disabled (`--color-*: initial`). If a class like `bg-slate-100` slips in it will silently render nothing — grep for `slate|blue|indigo|violet|gray|emerald|red-` before merging.

## Type

- **Figtree** for all UI. Headings 600–700, `tracking-tight`, line-height 1.2. Body 400–500, 14–15px, relaxed line height.
- **JetBrains Mono** for code, file paths, tool arguments and the ASCII accent.
- Sizes: page title 22–26px, section 15–16px semibold, body 14–15px, meta 12–13px `ink-3`, pills 11px.

## Layout

- **App shell** — canvas background with 12px padding; a 64px icon rail on the left (mark on top, settings at bottom); the avatar stage is a `rounded-panel` `surface` card that fills the rest. The conversation docks to the right as a second panel (not an overlay). Settings opens as a centred sheet with its own left navigation.
- **Composer** — a single pillowy field (`rounded-full`, `surface-2`, `shadow-float`) floating over the bottom of the stage: mic on the left, send on the right.
- **Onboarding** — two columns: a warm left rail with the ASCII strip, the mascot and vertical step list; a `rounded-sheet` content card on the right.
- **Mini widget** — transparent window. Chrome stays minimal and appears on hover; same tokens, same radii.

## Primitives (`src/components/ui`)

| Component | Notes |
|---|---|
| `Button` | `primary` caramel, `secondary` raised surface, `soft` tinted, `ghost`, `danger`, `danger-soft`; sizes `sm/md/lg`; `leading/trailing/loading` |
| `IconButton` | square, `label` required, `active` state |
| `Surface` | tones `surface/raised/well/canvas`; radius `control…sheet`; elevation `none/soft/float/pop`; `interactive` |
| `Field`, `Label`, `Input`, `Textarea`, `Select`, `Hint`, `FieldError` | inputs rest in a `well`, lift to `surface-2` on focus with a soft accent ring |
| `ChoiceCard` | selectable option tile with leading glyph, title, description |
| `Pill` | status chips; tones map to palette; `dot`/`pulse` |
| `Notice` | soft callout, no border |
| `Mascot`, `MeuxeMark` | mascot moods: `neutral/happy/thinking/sleepy/surprised` |
| `AsciiAccent` | stippled strip, deterministic per seed |
| `Dots` | thinking indicator |
| `Kbd`, `KeyCombo` | keycaps |
| `VibeGlyph` | stroke icon for a personality pack |
| `icons.tsx` | the icon set |

## Motion

Short and soft: `animate-fade-in`, `animate-rise-in`, `animate-pop-in` (≤350ms, `--ease-soft`). Ambient: `animate-breathe`, `animate-blink` on the mascot, `animate-dot` for thinking. Respect `motion-safe:`.
