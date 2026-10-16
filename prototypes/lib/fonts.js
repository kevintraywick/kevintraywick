// Every candidate font, served as WOFF from Fontsource on jsdelivr (opentype.js
// reads WOFF but not WOFF2). Shared by the font picker and the prototypes so the
// picker shows exactly the glyphs the animation will draw.
window.SIG_FONTS = [
  // Formal scripts
  { name: 'Great Vibes',          slug: 'great-vibes',          style: 'normal', kind: 'Script' },
  { name: 'Pinyon Script',        slug: 'pinyon-script',        style: 'normal', kind: 'Script' },
  { name: 'Allura',               slug: 'allura',               style: 'normal', kind: 'Script' },
  { name: 'Alex Brush',           slug: 'alex-brush',           style: 'normal', kind: 'Script' },
  { name: 'Parisienne',           slug: 'parisienne',           style: 'normal', kind: 'Script' },
  { name: 'Italianno',            slug: 'italianno',            style: 'normal', kind: 'Script' },
  { name: 'Petit Formal Script',  slug: 'petit-formal-script',  style: 'normal', kind: 'Script' },
  { name: 'Rouge Script',         slug: 'rouge-script',         style: 'normal', kind: 'Script' },
  { name: 'Tangerine',            slug: 'tangerine',            style: 'normal', kind: 'Script' },
  { name: 'Corinthia',            slug: 'corinthia',            style: 'normal', kind: 'Script' },
  { name: 'Ephesis',              slug: 'ephesis',              style: 'normal', kind: 'Script' },
  // Signature / handwritten
  { name: 'Mrs Saint Delafield',  slug: 'mrs-saint-delafield',  style: 'normal', kind: 'Signature' },
  { name: 'Monsieur La Doulaise', slug: 'monsieur-la-doulaise', style: 'normal', kind: 'Signature' },
  { name: 'Herr Von Muellerhoff', slug: 'herr-von-muellerhoff', style: 'normal', kind: 'Signature' },
  { name: 'Mr De Haviland',       slug: 'mr-de-haviland',       style: 'normal', kind: 'Signature' },
  { name: 'La Belle Aurore',      slug: 'la-belle-aurore',      style: 'normal', kind: 'Signature' },
  { name: 'Homemade Apple',       slug: 'homemade-apple',       style: 'normal', kind: 'Signature' },
  { name: 'Sacramento',           slug: 'sacramento',           style: 'normal', kind: 'Signature' },
  { name: 'Dancing Script',       slug: 'dancing-script',       style: 'normal', kind: 'Signature' },
  // Italic serifs (not cursive, for contrast)
  { name: 'Cormorant Garamond',   slug: 'cormorant-garamond',   style: 'italic', kind: 'Italic serif' },
  { name: 'Playfair Display',     slug: 'playfair-display',     style: 'italic', kind: 'Italic serif' },
  { name: 'Instrument Serif',     slug: 'instrument-serif',     style: 'italic', kind: 'Italic serif' },
  { name: 'EB Garamond',          slug: 'eb-garamond',          style: 'italic', kind: 'Italic serif' },
  { name: 'Libre Baskerville',    slug: 'libre-baskerville',    style: 'italic', kind: 'Italic serif' },
  { name: 'Bodoni Moda',          slug: 'bodoni-moda',          style: 'italic', kind: 'Italic serif' },
  { name: 'Fraunces',             slug: 'fraunces',             style: 'italic', kind: 'Italic serif' },
  { name: 'DM Serif Display',     slug: 'dm-serif-display',     style: 'italic', kind: 'Italic serif' },
  { name: 'Lora',                 slug: 'lora',                 style: 'italic', kind: 'Italic serif' },
];

window.sigFontUrl = f =>
  `https://cdn.jsdelivr.net/npm/@fontsource/${f.slug}/files/${f.slug}-latin-400-${f.style}.woff`;

window.sigFontBySlug = slug => window.SIG_FONTS.find(f => f.slug === slug);
