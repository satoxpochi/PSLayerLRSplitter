# PSLayerLRSplitter

[日本語版 README](README.ja.md)

An Adobe Photoshop script (ExtendScript / `.jsx`) that splits folders drawn as
a single left-and-right pair into two separate folders, cutting the artwork at
a vertical split line.

Written for [Live2D](https://www.live2d.com/) part preparation, where a symmetric
part such as a pair of ears is often drawn as one image and then has to be
separated before modeling.

## What it does

A folder whose name ends with a left/right suffix is replaced by two copies of
itself, each trimmed to one side of the split line:

```
*earLR                     *earL          (right half of the canvas)
  ear lineart                ear lineart
  ear shadow    ------>      ear shadow
  ear fill                   ear fill
                           *earR          (left half of the canvas)
                             ear lineart
                             ear shadow
                             ear fill
```

Because each output folder is a duplicate, clipping masks, blend modes,
opacity, layer names and stacking order are all carried over unchanged.

### Left and right are mirrored

The suffix follows **the character's own left and right**, not the viewer's.
`L` is the character's left, which appears on the **right** side of the canvas.

| Suffix | Output | Keeps |
|---|---|---|
| `LR` | `L` | right half of the canvas |
| | `R` | left half of the canvas |
| `左右` | `左` | right half of the canvas |
| | `右` | left half of the canvas |

Matching is case-sensitive and applies to **folders only** — a layer named
`earLR` is left alone. Folder names are matched at the end only, so any prefix
you use (`*`, numbering, and so on) is preserved.

## Features

- Recognises both `LR` and `左右` suffixes
- Splits at a **vertical guide** if the document has one, otherwise at the
  canvas centre
- Two split methods, chosen at run time:
  - **Layer mask** — non-destructive, so the boundary can be adjusted afterwards
  - **Delete pixels** — destructive, ready to import into Cubism
- Optional **overlap** in pixels, extending each half past the split line, to
  avoid a visible seam when the parts move
- Combines with an existing layer mask instead of overwriting it
- Rasterizes text, smart object and fill layers when deleting pixels
- Runs as a single history state, so one Undo reverts the whole operation
- Reports what happened: folders split, layers trimmed, layers skipped, and any
  folder that came out empty

## Requirements

Adobe Photoshop with ExtendScript support (CS6 through recent CC releases), on
Windows or macOS. The source is plain ASCII — Japanese text is written as `\u`
escapes — so it does not depend on how Photoshop guesses the file encoding.

## Installation

### Option A: Install into the Scripts menu (recommended)

Copy `PSLayerLRSplitter.jsx` into Photoshop's `Presets/Scripts` folder:

- **Windows:** `C:\Program Files\Adobe\Adobe Photoshop <version>\Presets\Scripts\`
- **macOS:** `/Applications/Adobe Photoshop <version>/Presets/Scripts/`

Restart Photoshop. The script then appears under
**File → Scripts → PSLayerLRSplitter**.

### Option B: Run without installing

In Photoshop, choose **File → Scripts → Browse...** and select
`PSLayerLRSplitter.jsx`.

## Usage

1. Name the folders you want split so they end in `LR` or `左右`.
2. If the character is not centred on the canvas, place a single vertical guide
   on the axis of symmetry.
3. Run the script.
4. Choose a split method and an overlap, then press **Split**.

The original `LR` / `左右` folders are deleted. One Undo restores them.

## Importing into Cubism

**Cubism Editor does not read PSD layer masks.** If you split with the layer
mask method, apply the masks (Layer → Layer Mask → Apply) before importing, or
the split will not be reflected — and a PSD that still carries masks can import
incorrectly.

The **Delete pixels** method produces a PSD that can be imported as-is.

## Notes and limits

- Only the outermost matching folder in any branch is processed. An `LR` folder
  nested inside another `LR` folder is split along with its parent, not twice.
- Adjustment layers are skipped when deleting pixels; they are usually clipped
  to a layer that has already been trimmed. They are masked normally in layer
  mask mode.
- A folder whose artwork does not cross the split line still produces both
  halves; the empty one is listed in the result dialog so you can delete it.

## License

[MIT](LICENSE)
