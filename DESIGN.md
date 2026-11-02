---
name: EuroAmazon Dispatch
description: Cross-border European & UK Amazon price and shipping comparison manifest in PLN
colors:
  primary: "#bf4520"
  primary-hover: "#a33817"
  winner-plate: "#141923"
  winner-mint: "#7be0ad"
  status-green: "#1b6b45"
  status-amber: "#8a4b08"
  status-red: "#a82020"
  stock-bg: "#eef2f6"
  panel-bg: "#dfe6ee"
  surface-bg: "#ffffff"
  ink-primary: "#141923"
  ink-secondary: "#334155"
  ink-muted: "#475569"
typography:
  headline:
    fontFamily: "'Public Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: "1.2rem"
    fontWeight: 700
    lineHeight: 1.3
    letterSpacing: "-0.015em"
  title:
    fontFamily: "'Public Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: "1.125rem"
    fontWeight: 700
    lineHeight: 1.3
    letterSpacing: "-0.015em"
  body:
    fontFamily: "'Public Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "'Azeret Mono', ui-monospace, 'SFMono-Regular', Menlo, Consolas, monospace"
    fontSize: "0.78rem"
    fontWeight: 600
    lineHeight: 1.4
rounded:
  sm: "4px"
  md: "6px"
spacing:
  xs: "0.35rem"
  sm: "0.65rem"
  md: "1rem"
  lg: "1.5rem"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.surface-bg}"
    rounded: "{rounded.sm}"
    padding: "0.65rem 1.25rem"
  button-primary-hover:
    backgroundColor: "{colors.primary-hover}"
  button-secondary:
    backgroundColor: "{colors.surface-bg}"
    textColor: "{colors.ink-primary}"
    rounded: "{rounded.sm}"
    padding: "0.35rem 0.65rem"
---

# Design System: EuroAmazon Dispatch

## Overview

**Creative North Star: "Continental Rail & Parcel Dispatch Board"**

EuroAmazon Dispatch treats cross-border e-commerce comparison across 9 European and UK Amazon storefronts as a precision logistics and currency arbitrage manifest. Instead of decorative marketing cards or promotional banners, the interface is structured as a high-contrast tabular sheet where live NBP exchange rates, shelf prices, cross-border shipping quotes to Poland, and landed PLN totals lock into an exposed hairline grid.

**Key Characteristics:**
- Exposed structural cell hairlines (`1px` and `1.5px` carbon-navy rules) that separate every currency input, verdict cell, and country row.
- Reversed carbon-navy plate (`#141923`) with clearance mint (`#7be0ad`) highlights reserved exclusively for the #1 lowest landed PLN offer.
- Strict tabular monospace alignment (`Azeret Mono` with `tabular-nums`) for all prices, exchange rates, ASIN stamps, and percentage deltas.

## Colors

Cool European customs slate-silver surfaces paired with deep carbon-navy structural ink, signal vermilion for primary actions, and clearance mint/green for winning arbitrage states.

### Primary
- **Signal Vermilion** (`#bf4520`): Primary dispatch submit button, shipping share bar segment, focus outlines, and text selection highlight.
- **Signal Vermilion Deep** (`#a33817`): Hover state for primary dispatch actions.

### Secondary
- **Clearance Mint** (`#7be0ad`): Winning landed PLN total and `#1` badge on dark reversed carbon plates.
- **Clearance Forest Green** (`#1b6b45`): Positive savings indicators on light surfaces.

### Neutral
- **Customs Slate Stock** (`#eef2f6`): Root page background.
- **Dispatch Panel Slate** (`#dfe6ee`): Section headers, table headers, and secondary toolbar bands.
- **Ledger Cell White** (`#ffffff`): Primary data table rows and form containers.
- **Carbon Navy Ink** (`#141923`): Primary typography, structural outer borders (`1.5px`), top header bar, and the reversed #1 winner row plate.
- **Slate Ink Secondary** (`#334155`): Supporting descriptions, country names, and rate annotations.
- **Slate Ink Muted** (`#475569`): Input placeholders and secondary hints.

### Named Rules
**The Single Reversed Plate Rule.** Only the #1 lowest landed PLN offer row and the primary winner verdict cell invert to Carbon Navy (`#141923`) with Clearance Mint (`#7be0ad`) numerals. Every other row stays on white ledger stock so the winning storefront is scannable in a split second.

## Typography

**Body Font:** `Public Sans` (with `-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif` fallback)
**Label/Mono Font:** `Azeret Mono` (with `ui-monospace, 'SFMono-Regular', Menlo, Consolas, monospace` fallback)

**Character:** Utilitarian, high-legibility transport grotesk (`Public Sans`) for Polish UI labels and product titles, paired with wide, unmistakable tabular monospace (`Azeret Mono`) for prices, NBP rates, and 10-character `ASIN` codes.

### Hierarchy
- **Headline** (`700`, `1.2rem`, `1.3`): Active product title in the comparison manifest header.
- **Title** (`700`, `1.125rem`, `1.3`): Section bar titles and top brand identity.
- **Body** (`400`, `1rem`, `1.5`): Form inputs, helper copy (max `72ch`), and candidate descriptions.
- **Label** (`600`, `0.78rem`, `1.4`): Tabular currency chips, `ASIN` stamps, country codes, and table column headers.

### Named Rules
**The Tabular Numerals Rule.** Every price, shipping fee, exchange rate, and percentage delta is set in `Azeret Mono` with `font-variant-numeric: tabular-nums` right-aligned in its cell so decimal commas align vertically down all 9 rows.

## Layout

Centered workspace container (`max-width: 1440px`, `padding: 1.25rem 1.5rem 2.5rem`) organized as a vertical stack of exposed-hairline panels (`1.5rem` gap): Command Deck, optional 20-item Keyword Disambiguation Grid, and the 9-country Comparison Manifest. The comparison table sits inside a `container-type: inline-size` wrapper that switches from a 7-column sticky-header table on desktop to a labeled card stack below `720px`.

## Elevation & Depth

Tonal layering and crisp `1.5px` structural borders carry hierarchy. Top-level panels use a single subtle ambient offset shadow (`0 6px 18px rgba(20, 25, 35, 0.07)`) against the `#eef2f6` stock background.

### Shadow Vocabulary
- **Elevated Ledger** (`box-shadow: 0 6px 18px rgba(20, 25, 35, 0.07)`): Applied only to top-level section containers (`.command-deck`, `.candidates-section`, `.comparison-section`).

## Shapes

Tight, utilitarian corners (`4px` on inputs, buttons, and chips; `6px` on outer section frames) reinforced by `1px` cell hairlines (`rgba(20, 25, 35, 0.16)`) and `1.5px` outer carbon frames (`#141923`).

## Components

### Buttons
- **Shape:** Crisp `4px` radius with `1.5px` solid border.
- **Primary:** Signal Vermilion (`#bf4520`) background, white text, `48px` min-height (`52px` on coarse pointers), `0.65rem 1.25rem` padding.
- **Hover / Focus:** Darkens to `#a33817` on `150ms ease-out`; `2.5px` vermilion focus-visible outline at `2px` offset.
- **Secondary:** White (`#ffffff`) or Slate (`#dfe6ee`) surface with `1px` border for sort toggles and outbound store links.

### Chips
- **Style:** `Azeret Mono` `0.76rem` preset chips and FX rate chips with `4px` radius and `1px` cell borders.
- **State:** Hover tints with `rgba(191, 69, 32, 0.10)` and vermilion border.

### Cards / Containers
- **Corner Style:** `6px` outer radius with `overflow: hidden` so internal grid cells meet the frame cleanly.
- **Background:** `#ffffff` data cells under `#dfe6ee` header bands.
- **Shadow Strategy:** Elevated Ledger shadow on outer containers only; zero shadow on internal cells.
- **Border:** `1.5px solid #141923` outer border; `1px solid rgba(20, 25, 35, 0.16)` internal grid hairlines.

### Inputs / Fields
- **Style:** `48px` min-height (`100%` width in form groups) with `1.5px solid #334155` border and `#ffffff` background. Table rows include compact inline decimal inputs (`5.4rem` wide) for live price/shipping overrides.
- **Focus:** `2.5px solid #bf4520` outline with `2px` offset.
- **Error / Disabled:** `:invalid:user-invalid` shifts border to `#a82020` and fill to `rgba(168, 32, 32, 0.10)`.

### Navigation
- **Top Utility Bar:** Full-width `#141923` carbon header with `2px` vermilion bottom rule, housing the brand mark, live editable NBP currency chips (`EUR`, `GBP`, `SEK`), and the architecture diagram link.

## Do's and Don'ts

### Do:
- **Do** set all prices, exchange rates, and `ASIN` identifiers in `Azeret Mono` with `font-variant-numeric: tabular-nums`.
- **Do** keep labels above form controls with tighter label-to-input spacing (`0.35rem`) than group-to-group spacing (`1rem`).
- **Do** preserve inline editable inputs for both item price and shipping quote in every table row so users can override CAPTCHA-blocked or cart-specific postage rates.

### Don't:
- **Don't** place kickers or eyebrows above section headings; let the heading and `ASIN` stamp carry hierarchy directly.
- **Don't** use `type="number"` on postal code or ASIN inputs; use `type="text"` with appropriate `inputmode` and `autocomplete`.
- **Don't** apply the reversed dark carbon plate (`#141923`) to more than the single #1 winning row in the comparison table.
