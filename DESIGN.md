---
version: 1.0.0
name: "Mira Desk"
description: "A quiet desktop control surface for private, real-time conversation assistance."
colors:
  primary: "#282828"
  primaryForeground: "#FAFAFA"
  background: "#FFFFFF"
  foreground: "#242424"
  muted: "#F7F7F7"
  mutedForeground: "#686868"
  border: "#E5E5E5"
  success: "#10B981"
  warning: "#F59E0B"
  info: "#7C3AED"
  danger: "#DC2626"
  microphone: "#0369A1"
  systemAudio: "#7C3AED"
typography:
  sans:
    fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
  mono:
    fontFamily: "ui-monospace, SFMono-Regular, Consolas, monospace"
rounded:
  DEFAULT: "0.625rem"
  sm: "0.375rem"
  md: "0.5rem"
  lg: "0.625rem"
  xl: "0.875rem"
spacing:
  section-gap: "1.5rem"
  page-max: "none"
components:
  button:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primaryForeground}"
    rounded: "{rounded.DEFAULT}"
    height: "2.25rem"
  card:
    backgroundColor: "{colors.background}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.DEFAULT}"
  divider:
    backgroundColor: "{colors.border}"
    size: "1px"
  dialog:
    backgroundColor: "{colors.background}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.xl}"
  input:
    backgroundColor: "{colors.background}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.DEFAULT}"
    height: "2.75rem"
  select:
    backgroundColor: "{colors.background}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.DEFAULT}"
    height: "2.75rem"
  scrollbar:
    backgroundColor: "{colors.mutedForeground}"
    rounded: "{rounded.sm}"
    width: "0.5rem"
  listen-panel:
    backgroundColor: "{colors.background}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.xl}"
  status-success:
    backgroundColor: "{colors.success}"
    textColor: "{colors.foreground}"
  status-warning:
    backgroundColor: "{colors.warning}"
    textColor: "{colors.foreground}"
  status-info:
    backgroundColor: "{colors.info}"
    textColor: "{colors.primaryForeground}"
  status-danger:
    backgroundColor: "{colors.danger}"
    textColor: "{colors.primaryForeground}"
  microphone-channel:
    backgroundColor: "{colors.microphone}"
    textColor: "{colors.primaryForeground}"
  system-audio-channel:
    backgroundColor: "{colors.systemAudio}"
    textColor: "{colors.primaryForeground}"
  muted-surface:
    backgroundColor: "{colors.muted}"
    textColor: "{colors.mutedForeground}"
---

# Mira Desk Design System

## Overview

### Creative North Star

Mira Desk should feel like a compact field recorder paired with a calm control desk. The Assistant exposes only immediate actions. The Dashboard explains readiness and configuration. Listen is the focused session workspace.

### Product context and register

- **Audience and primary job:** A desktop user who needs discreet, real-time transcription and answer suggestions during calls and interviews.
- **Target market(s) and evidence:** Global desktop use. The current source has no country-specific business rules.
- **Locale(s) and language policy:** The owned UI is currently English. User content and AI response language may differ. New copy must remain ready for future localization and avoid string assembly that breaks grammar.
- **Usage scene:** Windows desktop, frequent short interactions, time pressure during a live call, and a fixed compact overlay.
- **Register:** Product UI across the Dashboard and Assistant surfaces.
- **Memorable signature:** The two-channel monitor uses sky for the user's microphone and violet for system audio from the other speaker.
- **Restraint:** Configuration, destructive actions, diagnostics, and error recovery use familiar controls and plain language.
- **Anti-references:** Avoid marketing landing-page layouts, glass effects that reduce contrast, oversized dashboard metrics, hidden icon actions, and technical provider details in primary task flows.
- **Token ownership/runtime mapping:** `src/global.css` is the canonical runtime token source. This file documents the implemented intent. Shared components in `src/components/ui` consume those tokens. `premium-ui.json` and the strict premium audit are the drift gate.

## Colors

The product is neutral and low-glare. Primary actions use the near-black primary token. Text hierarchy uses foreground and mutedForeground. Semantic states always pair color with an icon or text. Microphone and system-audio accents are reserved for channel identity. Light and dark themes use the CSS tokens in `src/global.css`; forced-color mode returns control to system colors.

The documented mappings are `colors.primary` and `colors.primaryForeground` for committed actions, `colors.background` and `colors.foreground` for the base surface, `colors.muted` and `colors.mutedForeground` for secondary hierarchy, and `colors.border` for structure. Status uses `colors.success`, `colors.warning`, `colors.info`, and `colors.danger`. Listen channel identity uses `colors.microphone` and `colors.systemAudio`.

## Typography

The application uses the operating-system sans stack for predictable Windows rendering. Body and control text should normally be at least 12px in the compact Assistant and 14px in the Dashboard. Text below 12px is reserved for short metadata. Use sentence case. The mono stack is reserved for shortcuts and technical values. Avoid italic text.

## Layout

The Dashboard has a 14rem sidebar and one owned content scroller. Pages use a 1.5rem vertical rhythm. Forms remain single-column at the current desktop window width. Listen keeps two equal-purpose columns with independent scrolling. Floating session settings overlay the workspace and never reduce the transcript or response viewport. Async and feedback states reserve existing control geometry.

## Elevation & Depth

Borders and tonal surfaces carry most hierarchy. Use a strong shadow only for dialogs, popovers, and the floating session inspector. Avoid stacked shadows inside lists. Transparency may affect cards and popovers but must preserve readable contrast.

## Shapes

Controls and compact cards use the 0.625rem base radius. Larger Listen regions use the xl radius. Status indicators are circular. One-pixel borders are the default; selected cards may use a two-pixel border when geometry remains stable.

## Components

### Foundational visual states

Every interactive control needs a visible hover state, a four-pixel focus-visible ring, a selected or pressed state when applicable, and a non-interactive disabled state. Busy states keep the same dimensions and include readable status text or an accessible name. Errors stay near the action that can correct them.

### Buttons and actions

Primary buttons commit a task. Outline buttons perform secondary actions. Ghost buttons are limited to compact toolbars. Destructive styling appears on the final destructive action. Icon-only buttons require an accessible name and tooltip. Shared buttons default to `type="button"`.

### Navigation and data display

Sidebar items use exact route matching with subroute support and expose `aria-current`. Conversation and prompt rows are semantic buttons. Local history loads in explicit batches and preserves a stable page scroller.

### Forms and overlays

Inputs have persistent labels or accessible names. Search includes an explicit clear button. All single-select controls use the shared Radix Select. Textareas do not resize manually and instead receive sufficient height. Dialogs use the shared Radix Dialog. The Listen session inspector is a documented non-modal floating panel with its own scroll area.

### Iconography

Use Lucide icons with consistent 1.5px to 2px strokes. Standard controls use 16px icons; compact metadata may use 12px to 14px. Text labels remain visible for unfamiliar or consequential actions.

### Motion

Use 100ms to 300ms transitions to explain hover, focus, selection, expansion, and live activity. No decorative continuous animation. Respect reduced motion by removing nonessential animation and smooth scrolling.

### Content and data visualization

Use direct task language: Listen, Pause, Resume, Stop, Suggest, Delete. Explain device roles as You (microphone) and Them (system audio). Provider details belong on Providers. Never place API keys, transcript text, response text, or raw audio in telemetry.

## Do's and Don'ts

- **Do:** Keep live transcript and suggested response visible throughout a session.
- **Do:** Show readiness and recovery at the point where the user can act.
- **Do:** Pair channel colors with labels and icons.
- **Don't:** Use a clickable `div` or card when a native button or link fits.
- **Don't:** make diagnostics, provider syntax, or licensing copy dominate ordinary workflows.
- **Don't:** depend on hover to explain an icon-only control.
