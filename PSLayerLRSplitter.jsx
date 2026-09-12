#target photoshop

/*
 * PSLayerLRSplitter
 *
 * Left/right part separation for Live2D character art.
 *
 * Splits every folder whose name ends with a left/right suffix into two
 * folders, cutting the artwork at a vertical split line, so a symmetric
 * part drawn as one image becomes two Live2D Cubism parts.
 *
 * Two suffix pairs are recognised:
 *
 *     "LR"                     ->  "L" / "R"
 *     "\u5DE6\u53F3"           ->  "\u5DE6" / "\u53F3"
 *                                  (the Japanese characters for left/right)
 *
 * The suffix follows the character's own left and right, which is mirrored
 * on screen:
 *
 *     "*earLR"  ->  "*earL"  keeps the RIGHT half of the canvas
 *                   "*earR"  keeps the LEFT half of the canvas
 *
 * Everything else about the folder is preserved by duplication: clipping
 * masks, blend modes, opacity and stacking order. Photoshop appends a
 * "copy" suffix to the names inside a duplicated group, so the original
 * names are recorded before duplicating and written back afterwards.
 *
 * Non-ASCII text is written as \u escapes so the source stays plain ASCII
 * and does not depend on how Photoshop guesses the file encoding.
 */

(function () {

    if (app.documents.length === 0) {
        alert("No document is open.");
        return;
    }

    var doc = app.activeDocument;

    /*
     * Recognised suffix pairs.
     *
     * "left" is the character's own left, which is the RIGHT half of the
     * canvas, and "right" is the LEFT half.
     */
    var KANJI_LEFT = "\u5DE6";
    var KANJI_RIGHT = "\u53F3";

    var SUFFIX_RULES = [
        {
            suffix: "LR",
            left: "L",
            right: "R"
        },
        {
            suffix: KANJI_LEFT + KANJI_RIGHT,
            left: KANJI_LEFT,
            right: KANJI_RIGHT
        }
    ];

    var cTID = function (s) { return charIDToTypeID(s); };
    var sTID = function (s) { return stringIDToTypeID(s); };

    var docWidth = 0;
    var docHeight = 0;

    /*
     * ----------------------------------------------------------------
     * Target collection.
     * ----------------------------------------------------------------
     */

    /*
     * Return the suffix rule a folder name ends with, or null.
     *
     * Matching is case-sensitive, so an "lr" folder is left alone.
     */
    function matchSuffixRule(name) {

        for (var i = 0; i < SUFFIX_RULES.length; i++) {

            var rule = SUFFIX_RULES[i];

            if (name.length >= rule.suffix.length &&
                name.substring(name.length - rule.suffix.length) ===
                    rule.suffix) {

                return rule;
            }
        }

        return null;
    }

    /*
     * The recognised suffixes, for use in messages.
     */
    function suffixListText() {

        var parts = [];

        for (var i = 0; i < SUFFIX_RULES.length; i++) {
            parts.push("\"" + SUFFIX_RULES[i].suffix + "\"");
        }

        return parts.join(" or ");
    }

    /*
     * Collect the folders to split, each paired with the rule it matched.
     *
     * Only the outermost match in any branch is collected; splitting an
     * outer folder already splits everything nested inside it.
     */
    function collectTargets(container, out) {

        for (var i = 0; i < container.layers.length; i++) {

            var layer = container.layers[i];

            if (layer.typename !== "LayerSet") {
                continue;
            }

            var rule = matchSuffixRule(layer.name);

            if (rule !== null) {
                out.push({ folder: layer, rule: rule });
            }
            else {
                collectTargets(layer, out);
            }
        }
    }

    /*
     * ----------------------------------------------------------------
     * Layer names.
     *
     * A duplicated group comes back with "copy" appended to the names
     * inside it. The copy has the same shape as the original, so the name
     * tree can be recorded up front and replayed onto the duplicate by
     * position.
     * ----------------------------------------------------------------
     */

    function snapshotNames(container) {

        var entries = [];

        for (var i = 0; i < container.layers.length; i++) {

            var layer = container.layers[i];

            entries.push({
                name: layer.name,
                children: layer.typename === "LayerSet"
                    ? snapshotNames(layer)
                    : null
            });
        }

        return entries;
    }

    function restoreNames(container, entries) {

        var count = Math.min(container.layers.length, entries.length);

        for (var i = 0; i < count; i++) {

            var layer = container.layers[i];
            var entry = entries[i];

            if (layer.name !== entry.name) {
                layer.name = entry.name;
            }

            if (layer.typename === "LayerSet" && entry.children !== null) {
                restoreNames(layer, entry.children);
            }
        }
    }

    /*
     * ----------------------------------------------------------------
     * Split line.
     *
     * A single vertical guide wins over the canvas centre, so a character
     * that is not centred on the canvas can still be split correctly.
     * ----------------------------------------------------------------
     */

    function findSplitLine() {

        var verticals = [];

        try {

            for (var i = 0; i < doc.guides.length; i++) {

                if (doc.guides[i].direction === Direction.VERTICAL) {
                    verticals.push(doc.guides[i].coordinate.value);
                }
            }
        }
        catch (e) {
            /*
             * Guides are unavailable on some versions; fall through to the
             * canvas centre.
             */
        }

        if (verticals.length === 1) {

            return {
                x: verticals[0],
                source: "vertical guide"
            };
        }

        if (verticals.length > 1) {

            return {
                x: verticals[0],
                source: "first of " + verticals.length + " vertical guides"
            };
        }

        return {
            x: docWidth / 2,
            source: "canvas centre"
        };
    }

    /*
     * ----------------------------------------------------------------
     * Selection helpers.
     * ----------------------------------------------------------------
     */

    /*
     * Make sure edits land on the pixels and not on a layer mask that
     * happens to be targeted.
     */
    function targetCompositeChannels() {
        doc.activeChannels = doc.componentChannels;
    }

    function selectRect(x0, x1) {

        doc.selection.select(
            [
                [x0, 0],
                [x1, 0],
                [x1, docHeight],
                [x0, docHeight]
            ],
            SelectionType.REPLACE,
            0,
            false
        );
    }

    /*
     * Collapse every group in the document.
     *
     * Photoshop has no scripting command for collapsing a single group;
     * "layerSectionExpanded" can be read but not written, so this is the
     * only way to get the layer panel back to a readable state.
     */
    function collapseAllGroups() {

        try {
            app.runMenuItem(sTID("collapseAllGroupsEvent"));
            return true;
        }
        catch (e) {
            return false;
        }
    }

    /*
     * ----------------------------------------------------------------
     * Trimming.
     * ----------------------------------------------------------------
     */

    function trimLayer(layer, region, report) {

        if (region.removeX1 <= region.removeX0) {
            return;
        }

        doc.activeLayer = layer;

        var kind = layer.kind;

        if (kind === LayerKind.TEXT ||
            kind === LayerKind.SMARTOBJECT ||
            kind === LayerKind.SOLIDFILL ||
            kind === LayerKind.GRADIENTFILL ||
            kind === LayerKind.PATTERNFILL) {

            try {
                layer.rasterize(RasterizeType.ENTIRELAYER);
                report.rasterized++;
            }
            catch (e) {
                report.skipped.push(layer.name + " - could not rasterize");
                return;
            }
        }
        else if (kind !== LayerKind.NORMAL) {

            report.skipped.push(layer.name + " - adjustment layer");
            return;
        }

        try {
            targetCompositeChannels();
            selectRect(region.removeX0, region.removeX1);
            doc.selection.clear();
            doc.selection.deselect();
            report.cleared++;
        }
        catch (e) {
            report.failed.push(layer.name + " - " + e.message);
        }
    }

    function trimContainer(container, region, report) {

        for (var i = 0; i < container.layers.length; i++) {

            var layer = container.layers[i];

            if (layer.typename === "LayerSet") {
                trimContainer(layer, region, report);
                continue;
            }

            trimLayer(layer, region, report);
        }
    }

    function clamp(value, min, max) {

        if (value < min) { return min; }
        if (value > max) { return max; }

        return value;
    }

    function isEmptyFolder(folder) {

        try {

            var bounds = folder.bounds;

            return (bounds[2].value - bounds[0].value) <= 0 ||
                   (bounds[3].value - bounds[1].value) <= 0;
        }
        catch (e) {
            return true;
        }
    }

    /*
     * ----------------------------------------------------------------
     * Folder processing.
     * ----------------------------------------------------------------
     */

    function processFolder(target, splitX, overlap, report) {

        var folder = target.folder;
        var rule = target.rule;

        var base = folder.name.substring(
            0,
            folder.name.length - rule.suffix.length
        );

        /*
         * "L" is the character's left, which is the right half on screen.
         */
        var lCut = clamp(splitX - overlap, 0, docWidth);
        var rCut = clamp(splitX + overlap, 0, docWidth);

        var lRegion = {
            removeX0: 0,
            removeX1: lCut
        };

        var rRegion = {
            removeX0: rCut,
            removeX1: docWidth
        };

        var names = snapshotNames(folder);

        var rCopy = folder.duplicate();
        rCopy.name = base + rule.right;
        restoreNames(rCopy, names);

        var lCopy = folder.duplicate();
        lCopy.name = base + rule.left;
        restoreNames(lCopy, names);

        lCopy.move(rCopy, ElementPlacement.PLACEBEFORE);

        trimContainer(lCopy, lRegion, report);
        trimContainer(rCopy, rRegion, report);

        if (isEmptyFolder(lCopy)) { report.emptyFolders.push(lCopy.name); }
        if (isEmptyFolder(rCopy)) { report.emptyFolders.push(rCopy.name); }

        folder.remove();

        report.folders++;
    }

    /*
     * ----------------------------------------------------------------
     * Run.
     * ----------------------------------------------------------------
     */

    function run(targets, splitX, overlap) {

        var report = {
            folders: 0,
            cleared: 0,
            rasterized: 0,
            skipped: [],
            failed: [],
            emptyFolders: []
        };

        for (var i = 0; i < targets.length; i++) {

            try {
                processFolder(targets[i], splitX, overlap, report);
            }
            catch (e) {
                report.failed.push(targets[i].folder.name + " - " + e.message);
            }
        }

        return report;
    }

    function buildReportText(report, splitX, overlap, collapseResult) {

        var text = "";

        text += "Split complete.\n\n";

        text += "Split line     : x = " + splitX + "\n";
        text += "Overlap        : " + overlap + " px\n\n";

        text += "Folders split  : " + report.folders + "\n";
        text += "Layers trimmed : " + report.cleared + "\n";
        text += "Rasterized     : " + report.rasterized + "\n";

        if (report.emptyFolders.length > 0) {

            text += "\nFolders that came out empty (" +
                    report.emptyFolders.length + "):\n";

            for (var i = 0; i < report.emptyFolders.length; i++) {
                text += "  " + report.emptyFolders[i] + "\n";
            }
        }

        if (report.skipped.length > 0) {

            text += "\nSkipped (" + report.skipped.length + "):\n";

            for (var j = 0; j < report.skipped.length; j++) {
                text += "  " + report.skipped[j] + "\n";
            }
        }

        if (report.failed.length > 0) {

            text += "\nFailed (" + report.failed.length + "):\n";

            for (var k = 0; k < report.failed.length; k++) {
                text += "  " + report.failed[k] + "\n";
            }
        }

        if (collapseResult === false) {
            text += "\nCould not collapse the groups on this version.\n";
        }

        return text;
    }

    /*
     * ----------------------------------------------------------------
     * Dialog.
     * ----------------------------------------------------------------
     */

    /*
     * Draw attention to a piece of text.
     *
     * Styling through ScriptUI graphics is not supported on every version,
     * so a failure here is ignored; the wording still carries on its own.
     */
    function emphasize(control) {

        try {

            var font = control.graphics.font;

            var name = (font && font.name) ? font.name : "dialog";
            var size = (font && font.size) ? font.size + 2 : 14;

            control.graphics.font = ScriptUI.newFont(
                name,
                ScriptUI.FontStyle.BOLD,
                size
            );

            control.graphics.foregroundColor = control.graphics.newPen(
                control.graphics.PenType.SOLID_COLOR,
                [0.93, 0.30, 0.24, 1],
                1
            );
        }
        catch (e) {
            /*
             * Best effort only.
             */
        }
    }

    function showDialog(targets, split) {

        var dialog = new Window("dialog", "Split LR Folders");

        dialog.orientation = "column";
        dialog.alignChildren = ["fill", "top"];
        dialog.spacing = 10;
        dialog.margins = 16;

        var warnPanel = dialog.add("panel", undefined, "Warning");

        warnPanel.orientation = "column";
        warnPanel.alignChildren = ["left", "top"];
        warnPanel.margins = 12;
        warnPanel.spacing = 6;

        var backupText = warnPanel.add(
            "statictext",
            undefined,
            "Back up your file before you run this!"
        );

        emphasize(backupText);
        backupText.preferredSize.width = 400;

        var warnDetail = warnPanel.add(
            "statictext",
            undefined,
            "Pixels are deleted and the original folders are removed."
        );

        warnDetail.preferredSize.width = 400;

        var info = dialog.add("panel", undefined, "Target");

        info.orientation = "column";
        info.alignChildren = ["left", "top"];
        info.margins = 12;

        info.add(
            "statictext",
            undefined,
            "Folders ending in " + suffixListText() + " : " + targets.length
        );

        info.add(
            "statictext",
            undefined,
            "Split line : x = " + split.x + "  (" + split.source + ")"
        );

        var options = dialog.add("panel", undefined, "Options");

        options.orientation = "column";
        options.alignChildren = ["left", "top"];
        options.margins = 12;

        var overlapGroup = options.add("group");

        overlapGroup.orientation = "row";

        overlapGroup.add("statictext", undefined, "Overlap :");

        var overlapField = overlapGroup.add("edittext", undefined, "0");
        overlapField.characters = 5;

        overlapGroup.add(
            "statictext",
            undefined,
            "px past the split line, on each side"
        );

        var collapseCheck = options.add(
            "checkbox",
            undefined,
            "Collapse groups when finished (affects the whole document)"
        );

        collapseCheck.value = true;

        var undoNote = dialog.add(
            "statictext",
            undefined,
            "The " + suffixListText() + " folders are deleted. One Undo " +
                "reverts the whole split."
        );

        undoNote.preferredSize.width = 400;

        var buttonGroup = dialog.add("group");

        buttonGroup.orientation = "row";
        buttonGroup.alignment = "right";

        var cancelButton = buttonGroup.add("button", undefined, "Cancel");
        var okButton = buttonGroup.add("button", undefined, "Split");

        var result = null;

        okButton.onClick = function () {

            var overlap = parseFloat(overlapField.text);

            if (isNaN(overlap) || overlap < 0) {
                alert("Overlap must be a number of 0 or greater.");
                return;
            }

            result = {
                overlap: overlap,
                collapse: collapseCheck.value
            };

            dialog.close();
        };

        cancelButton.onClick = function () {
            result = null;
            dialog.close();
        };

        dialog.defaultElement = okButton;
        dialog.cancelElement = cancelButton;

        dialog.center();
        dialog.show();

        return result;
    }

    /*
     * ----------------------------------------------------------------
     * Entry point.
     * ----------------------------------------------------------------
     */

    var savedUnits = app.preferences.rulerUnits;
    var savedDialogs = app.displayDialogs;

    app.preferences.rulerUnits = Units.PIXELS;
    app.displayDialogs = DialogModes.NO;

    try {

        docWidth = doc.width.value;
        docHeight = doc.height.value;

        var targets = [];
        collectTargets(doc, targets);

        if (targets.length === 0) {

            alert(
                "No folder ending in " + suffixListText() + " was found.\n\n" +
                "Folder names are matched case-sensitively, for example " +
                "\"earLR\"."
            );

            return;
        }

        var split = findSplitLine();
        var choice = showDialog(targets, split);

        if (choice === null) {
            return;
        }

        var report = null;

        $.global.__pslrSplitterRun = function () {
            report = run(targets, split.x, choice.overlap);
        };

        try {
            doc.suspendHistory(
                "Split LR Folders",
                "$.global.__pslrSplitterRun()"
            );
        }
        catch (e) {
            $.global.__pslrSplitterRun();
        }

        var collapseResult = null;

        if (choice.collapse) {
            collapseResult = collapseAllGroups();
        }

        alert(
            buildReportText(report, split.x, choice.overlap, collapseResult)
        );
    }
    finally {

        try { doc.selection.deselect(); } catch (e) {}

        app.preferences.rulerUnits = savedUnits;
        app.displayDialogs = savedDialogs;

        $.global.__pslrSplitterRun = undefined;
    }

})();
