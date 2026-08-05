# Soft Keepsake asset library

These production assets were generated from `mockup.png` with OpenAI's built-in high-quality image generator, then prepared as local Expo assets. Higgsfield was not used because the connected plugin did not expose a callable tool in this workspace.

## Runtime assets

- `stickers/completed/`: 30 illustrated transparent PNG stickers, numbered `01`–`30`.
- `stickers/embossed/`: the same 30 motifs as low-contrast ivory paper embosses.
- `decorations/`: binder clip, taped flowers, journal, wax seal, washi tape, and dried flowers.
- `textures/paper-background.jpg`: warm handmade-paper app background.
- `textures/sticker-board.png`: transparent layered torn-paper board used behind the 30-night grid.

`source-masters/` keeps the generated contact sheets and high-resolution source images. `scripts/extract_sticker_sheet.py` detects each complete alpha silhouette, sorts the 30 stickers into row-major order, and gives every export consistent transparent padding so no motif is clipped or off-center.

## Final prompt set

### Completed sticker sheet

Create one clean 6-by-5 contact sheet of exactly 30 distinct tactile scrapbook stickers, matching the supplied mockup's premium soft-feminine stationery style. Use the numbered motif order from the mockup: celestial moon, starburst seal, flowers, hearts, bows, clouds, envelopes, scalloped seals, leaves, circles, and stars. Give completed stickers real paper thickness, cotton fibers, blush/ivory/dusty-rose/plum color, restrained antique gold foil, subtle ambient occlusion, and soft studio light. Center one isolated motif in every equal cell on a perfectly uniform chroma-key green background. No labels, numbers, grid lines, cast shadows crossing cells, or extra objects.

### Embossed sticker sheet

Recreate the same exact 30 motifs, order, scale, and 6-by-5 geometry as the completed sheet, but as uncolored ivory cotton-paper embosses. Use raised/debossed edges, shallow relief, soft warm edge shadows, and no ink, foil, colored fill, text, numbers, or extra marks. Keep every motif isolated on uniform chroma-key green for transparent extraction.

### Decorative object sheet

Create a 3-by-2 contact sheet of six isolated scrapbook objects matching the mockup: antique brass binder clip, blush-taped dried flowers, dusty-rose linen journal with tiny gold botanical foil, dusty-rose wax seal with botanical imprint, torn blush washi tape, and a small dried-flower cluster. Use editorial product photography, warm diffuse light, tactile paper/fabric/metal/wax detail, restrained color, and uniform chroma-key green outside every object.

### Paper background

Create a seamless-feeling square crop of warm ivory handmade cotton paper for a premium mobile-app background, with very fine visible fibers, low contrast, a faint blush watercolor bloom in the upper-right, a barely visible beige wash in the lower-left, warm diffuse light, and no objects, seams, writing, borders, or directional cast shadows.

### Layered sticker board

Create one empty layered scrapbook board isolated on uniform chroma-key green. Use a continuous blank warm-cream cotton front sheet with irregular hand-torn edges, subtle raised fibers and ambient occlusion, a dusty blush backing sheet visible along the right and bottom, and a gentle warm contact shadow. Keep the interior completely free of creases, stickers, symbols, flowers, clips, tape, writing, borders, and grid lines.
