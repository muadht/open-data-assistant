# Visual identity: what we use, and what we may use

The app follows Canada.ca's look so it feels like a Canadian public-sector tool, but it's a
prototype, not a Government of Canada or Statistics Canada service. It must not look like
one. This page records what the UI uses, the rules behind each choice, and what changes if
the app ever becomes an official StatCan product.

This isn't legal advice. Before showing the app publicly, run the name and the disclaimer
past Statistics Canada's communications team.

## What the UI uses

| Element | Where | Source and licence |
|---|---|---|
| **Name: "Open Data Assistant"** | Sidebar, page title | Our own. Not "StatCan …" or "Statistics Canada …", which would read as StatCan's own tool. |
| **Logo:** a line-chart symbol in the primary colour (navy; pale navy in dark mode) | Sidebar | Lucide's `chart-spline` icon (ISC licence), in `components/brand/Brand.tsx`. |
| **Maple leaf** (the stylized 11-point leaf) | Above the start screen's heading, and on the "Answers use Statistics Canada data only" note | Canadian Heritage's official artwork, traced from `MapleLeaf.eps` in [Commercial use of symbols of Canada](https://www.canada.ca/en/canadian-heritage/services/commercial-use-symbols-canada.html). Filled in our red. Decoration only, never the logo. See the conditions below. |
| **Colours:** navy `#26374a` (primary buttons), red `#af3c43` (the heading bar and the leaf) | `index.css` (`--primary`, `--gc-accent`) | Canada.ca's palette. Colours aren't protected. |
| **Red bar under the main heading** | Start screen | A Canada.ca convention. |
| **Fonts:** Lato (headings), Noto Sans (text) | `index.css` | Canada.ca's typefaces, free under the SIL Open Font Licence. Self-hosted through `@fontsource`. |
| **Province/territory map outlines** | Charts (#82) | [Natural Earth](https://www.naturalearthdata.com/) 1:50m admin-1 boundaries, public domain, built into `chat/charts/provinceShapes.ts` by `frontend/scripts/build-province-map.mjs`. Statistics Canada's boundary files (Open Licence) would also do; the script takes either after small changes. |
| **"Français" link** | Top right | A placeholder where Canada.ca puts its language toggle. GC public tools must be available in both official languages. |

## What the UI must not use

- **The Government of Canada signature** (the flag symbol with "Government of Canada /
  Gouvernement du Canada") and **the "Canada" wordmark.** These are official marks under the
  Federal Identity Program, for federal institutions only. Don't use redrawn versions either.
- **The National Flag as a logo.** The Trademarks Act (s. 9) protects the flag from being
  adopted as a mark, and Canadian Heritage asks that it not be used to imply government
  endorsement.
- **Anything that implies endorsement by Statistics Canada,** which the Open Licence forbids.

## Conditions to keep

- **The maple leaf is protected against unauthorized *commercial* use** (Trademarks Act,
  s. 9): use with goods or services that generate revenue. The prototype is free, so it
  doesn't need permission. **If the app ever generates revenue, ask Canadian Heritage first:**
  email [uds-uos@pch.gc.ca](mailto:uds-uos@pch.gc.ca) with a final mockup and the context of
  use (purpose, duration, audience). It takes about 10 business days. The leaf may be adapted
  more freely than the flag, as the recolouring here does, but the flag itself must keep its
  official proportions and colours.
- **Credit the data as the [Statistics Canada Open Licence](https://www.statcan.gc.ca/en/reference/licence) requires.**
  Settings › Help & about says: "Source: Statistics Canada. Reproduced and distributed on an
  'as is' basis with the permission of Statistics Canada. This does not constitute an
  endorsement by Statistics Canada of this product." Each answer also cites its tables. Check
  the wording against the licence when it changes.
- **Keep the prototype disclaimer,** also in Help & about: "This is not a Government of
  Canada or Statistics Canada service."

## If it becomes an official Statistics Canada product

The department's communications team provides the official signature and wordmark files,
and the [Canada.ca design rules](https://design.canada.ca/) apply. In the code:

1. Replace `Logo` in `components/brand/Brand.tsx` with the official signature, and put the
   wordmark at the bottom right.
2. Change `PRODUCT_NAME` (same file and `index.html`'s title).
3. Replace the prototype disclaimer in `components/settings/SettingsDialog.tsx`.
4. Make "Français" work: the app has to be fully bilingual.
