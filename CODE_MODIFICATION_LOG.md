# Code Understanding and Modification Log

## Overview
This project is an Electron based image management and PDF generation tool designed for designers. It includes modules for image management, parameter settings and a Lightroom‑like image adjustment page. The application uses Electron in the main process with a renderer composed of HTML, CSS and JavaScript.

## Key Components
- **src/renderer/scripts/imageManager.js** – Handles image import, selection and ordering.
- **src/renderer/scripts/settingsManager.js** – Manages export parameters such as output size and watermarks.
- **src/renderer/scripts/imageProcessor.js** – Implements image adjustment features including brightness, contrast, saturation, sharpening and RGB curves.
- **src/renderer/scripts/pdfGenerator.js** – Generates PDFs from selected images using current settings.

## Recent Changes (2024‑04‑xx)
1. **Reset functionality in Image Adjustment**
   - Added a new `restoreOriginalImage()` method to `imageProcessor.js` to rebuild the current image from cached original data and update the thumbnail list.
   - Updated `resetAdjustments()` to accept a `restoreImage` flag. When triggered from the UI reset button, the original picture is restored instead of only clearing parameters.
   - Modified event bindings so the reset button calls `resetAdjustments(true, true)`.
   - Adjusted logic in `applyAdjustments()` to call `resetAdjustments(false)` after applying changes, preventing the original image from being restored.
   - Improved the sharpening algorithm using a simple convolution kernel for more obvious results.

2. **UI Spacing Tweaks**
   - Reduced vertical spacing inside setting cards by adjusting `.form-group` margins and decreasing gaps for `.radio-group`, `.scale-options` and `.preset-options` in `main.css`.

3. **Documentation**
   - Created this `CODE_MODIFICATION_LOG.md` to record project understanding and modifications for future reference.

4. **Image Reset Improvements (2024‑06‑12)**
   - Stored each image's original file and URL in `imageManager` so the original picture is retained after applying adjustments.
   - `imageProcessor` now loads original data from these files and restores them when pressing reset, even after switching images.
   - Improved the RGB curve grid to have evenly spaced lines for a cleaner look.
   - Quick PDF button now calls `pdfGenerator.generatePDF()` directly for faster exporting.


5. **UI Cleanup**
   - Removed the preview placeholder image and caption to keep the canvas uncluttered.

6. **Annotation Tools (2025-06-12)**
   - Added an overlay `annotation-canvas` and toolbar buttons for pencil, arrow, rectangle and text annotations in the processing page.
   - Users can change annotation color, line width and text size.
   - Annotations merge into the image when applying adjustments and clear when switching images or resetting.

7. **Annotation Fixes (2025-06-12)**
   - Moved initialization so annotation canvas events bind correctly.
   - Reordered controls placing text size input next to the text tool.

8. **Interaction Fixes (2025-06-12)**
   - Forwarded wheel events from the preview wrapper so zoom works when annotation canvas is active.
   - Annotation tools now toggle off when clicked again and are cleared after applying or resetting adjustments.

9. **Annotation Alignment (2025-06-12)**
   - Annotation canvas now follows zoom and pan by applying the same transform used for the image preview.
   - Mouse coordinates are scaled by the zoom level so drawings map correctly to the underlying picture.

10. **Annotation Accuracy and Layout Fixes (2025-06-13)**
    - Set the annotation canvas size to match the preview container instead of the original image to keep screen and canvas coordinates in sync.
    - Calculated mouse positions based on the actual canvas-to-screen ratio to prevent drifting annotations.
    - Changed the processing layout to use full available height and disabled overflow on the processing tab to avoid nested scrollbars.

11. **Annotation Interaction Updates (2025-06-13)**
    - Added an in-canvas text input instead of the unsupported `prompt()` call.
    - Prevented zooming and panning while an annotation tool is active to avoid conflicts.
    - Preserved drawings by stopping canvas resize during redraw and set the toolbar above the annotation layer.
    - Matched the thumbnail strip height to the sidebar footer using a dynamic calculation.

12. **Annotation Mode Toggle (2025-06-13)**
    - Introduced a dedicated "标注" toggle button in the preview toolbar.
    - Annotation tools remain hidden until the toggle is active and panning/zooming are disabled while active.
    - Resetting or applying adjustments now exits annotation mode and hides the tools.

13. **Annotation Persistence & History (2025-06-13)**
    - Added undo/redo buttons to the annotation toolbar and an internal history stack.
    - Annotations are automatically merged into the image when leaving annotation mode or switching images.
    - Text annotations commit on blur and all drawings save state for undo.
    - Clearing annotations or loading a new image initializes the history with a blank state.

14. **Remove Annotation Features (2025-06-15)**
    - Removed the annotation canvas, toolbar and related logic to simplify the processing interface.
    - Other image adjustment and PDF generation functions remain unaffected.

15. **Image Reset Fix (2025-06-15)**
    - Added `restoreOriginalImage()` in `imageProcessor.js` to reload the unedited file from `imageManager`.
    - Reset button now calls this method before clearing adjustments so applied edits can be undone.
