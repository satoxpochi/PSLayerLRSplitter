# PSLayerLRSplitter

[日本語版 README](README.ja.md)

**An Adobe Photoshop script (ExtendScript / `.jsx`) that automates left/right
part separation for [Live2D](https://www.live2d.com/) character art.**

Character illustrations destined for Live2D Cubism are usually drawn with
symmetric parts — ears, eyes, eyebrows, arms, strands of hair — as a single
image. Before the PSD goes into Cubism Editor, each of those has to be split
into a left part and a right part. In Japanese workflows this step is called
パーツ分け / 素材分け (part separation, material separation).

Doing it by hand means repeating the same five steps for every part: duplicate
the group, select half the canvas, delete it, rename the folder, then fix all
the layer names Photoshop mangled with "copy" suffixes. This script does it for
every folder in the document at once, cutting at a vertical split line and
leaving clipping masks, blend modes and layer names intact.

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
opacity and stacking order are all carried over unchanged. Photoshop appends
a "copy" suffix to the names inside a duplicated group, so the script records
the original names beforehand and writes them back.

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
- Deletes the pixels outside each half, so the PSD can be imported into
  Cubism as-is
- Restores the original layer names inside the duplicated folders
- Optional **overlap** in pixels, extending each half past the split line, to
  avoid a visible seam when the parts move
- Optionally collapses the groups afterwards, so the layer panel stays readable
- Rasterizes text, smart object and fill layers before trimming them
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

> **Back up your file before you run this.** The script deletes pixels and
> removes the original folders. One Undo reverts the whole split, but a saved
> copy is safer.

1. Name the folders you want split so they end in `LR` or `左右`.
2. If the character is not centred on the canvas, place a single vertical guide
   on the axis of symmetry.
3. Run the script.
4. Set an overlap if you want one, then press **Split**.

The original `LR` / `左右` folders are deleted. One Undo restores them.

## Importing into Cubism

The split itself is destructive, so the result imports into Cubism as-is.

Note that **Cubism Editor does not read PSD layer masks** at all. If layers in
your source file already carry masks, apply them (Layer → Layer Mask → Apply)
before importing — a PSD that still carries masks can import incorrectly.

## Notes and limits

- **Folder open/closed state cannot be restored.** Photoshop exposes
  `layerSectionExpanded` as a readable property but provides no scripting
  command to set it, so there is no way to reproduce the original arrangement.
  The **Collapse groups when finished** option is the closest thing; it
  collapses every group in the document, not only the ones that were split.
- Only the outermost matching folder in any branch is processed. An `LR` folder
  nested inside another `LR` folder is split along with its parent, not twice.
- Adjustment layers are skipped; they are usually clipped to a layer that has
  already been trimmed.
- A folder whose artwork does not cross the split line still produces both
  halves; the empty one is listed in the result dialog so you can delete it.

## License

[MIT](LICENSE)
