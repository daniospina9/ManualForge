import { px96 } from "./measure.ts";

/**
 * An image, ready to embed.
 *
 * The renderer is handed bytes and intrinsic dimensions rather than a path,
 * because Word cannot reference a file the way an `<img src>` can — the picture
 * lives inside the .docx. The CLI resolves and reads it, exactly as it already
 * resolves URLs for the HTML renderer, so this package still touches no
 * filesystem.
 *
 * `type` is narrowed to what OOXML actually embeds. WebP and SVG are not on that
 * list; the caller rasterises them before they reach here, which is why this
 * type cannot express them.
 */
export interface DocxAsset {
  readonly data: Uint8Array;
  readonly type: "png" | "jpg" | "gif" | "bmp";
  /** Intrinsic width in CSS pixels — the same 96-DPI unit the layout maths uses. */
  readonly widthPx: number;
  readonly heightPx: number;
  /** True while the placeholder stands in for an undelivered image. */
  readonly pending: boolean;
}

/** Turns an image slot into bytes, or `undefined` if the slot has no image. */
export type DocxAssetResolver = (slot: string) => DocxAsset | undefined;

/** A size in the 96-DPI pixels `docx` takes for `transformation`. */
export interface Box {
  readonly width: number;
  readonly height: number;
}

/** A CSS pixel is 1/96 inch and a point is 1/72, so a pixel is 3/4 of a point. */
const toPt = (px: number): number => (px * 3) / 4;

const scaled = (asset: DocxAsset, widthPt: number): Box => {
  if (asset.widthPx <= 0 || asset.heightPx <= 0) {
    throw new Error(`image has no intrinsic size (${asset.widthPx}x${asset.heightPx})`);
  }
  return {
    width: px96(widthPt),
    height: px96(widthPt * (asset.heightPx / asset.widthPx)),
  };
};

/**
 * A figure's size, reproducing what the stylesheet does to it.
 *
 * Two CSS rules, and they do NOT behave alike — this is the whole reason this
 * function exists rather than one multiplication at each call site:
 *
 *  - A block that declares a width renders `style="width:N%"`, which SETS the
 *    width. A small image is scaled UP to it.
 *  - A block that declares none gets `figure.figure--item img { max-width: 70% }`,
 *    which only CAPS. An image narrower than the cap keeps its own size, and
 *    that is deliberate: it is how a 40pt control screenshot stays smaller than
 *    the paragraph explaining it instead of stretching across the column.
 *
 * Treating the second like the first inflates every icon in the manual to 70% of
 * the column, which looks like a resolution problem and is not one.
 *
 * AND IT MUST FIT ON THE PAGE. Both rules above speak only about width, and the
 * height then followed the image's own proportions with nothing bounding it —
 * so a tall screenshot scaled to the column came out taller than the sheet it
 * was printed on. `maxHeightPt` is the last word: whichever edge binds first
 * wins, and the aspect ratio survives either way, exactly as `fitIcon` already
 * does for a table icon.
 *
 * The browser never needed this because a figure there is bounded by CSS — the
 * beacon theme pins every one to a 320:200 box. Word has no equivalent, which
 * is why the same content is correct in the PDF and oversized in the .docx.
 */
export function fitFigure(
  asset: DocxAsset,
  containerPt: number,
  widthPercent: number | undefined,
  itemCap: number,
  maxHeightPt: number,
): Box {
  const widthPt =
    widthPercent !== undefined
      ? containerPt * (widthPercent / 100)
      : Math.min(toPt(asset.widthPx), containerPt * itemCap);
  return capHeight(scaled(asset, widthPt), maxHeightPt);
}

/**
 * Shrink a box, proportionally, until it is no taller than the page allows.
 *
 * Never enlarges: a figure that already fits is left exactly as the width rules
 * sized it, so this changes nothing for the images that were always fine.
 */
function capHeight(box: Box, maxHeightPt: number): Box {
  // A `Box` is already in 96-DPI pixels — `scaled` put it there. The cap
  // arrives in points, so it is the cap that converts; scaling the box must NOT
  // run through `px96` again, or every figure grows by a third and the numbers
  // still look plausible.
  const maxHeightPx = px96(maxHeightPt);
  if (maxHeightPx <= 0 || box.height <= maxHeightPx) return box;
  const scale = maxHeightPx / box.height;
  return { width: box.width * scale, height: box.height * scale };
}

/**
 * An icon inside a table cell: `max-width` and `max-height` together.
 *
 * Both cap, neither sets, so an icon already smaller than the box is left alone
 * and the aspect ratio survives whichever edge binds.
 */
export function fitIcon(asset: DocxAsset, maxPt: number): Box {
  if (asset.widthPx <= 0 || asset.heightPx <= 0) {
    throw new Error(`icon has no intrinsic size (${asset.widthPx}x${asset.heightPx})`);
  }
  const widthPt = toPt(asset.widthPx);
  const heightPt = toPt(asset.heightPx);
  const scale = Math.min(1, maxPt / widthPt, maxPt / heightPt);
  return { width: px96(widthPt * scale), height: px96(heightPt * scale) };
}
