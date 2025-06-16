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

16. **Original URL Handling (2025-06-15)**
    - Created separate object URLs for each image so the original file URL is preserved after applying adjustments.
    - Avoided revoking the original URL when updating images in `applyAdjustments()`.

17. **Batch Adjustment Removal and Sharpening Update (2025-06-15)**
    - Removed copy/paste/apply controls for batch adjustments from the image adjustment panel and deleted related code and styles.
    - Replaced the simplistic sharpening method with an unsharp mask using a Gaussian blur for more realistic results.

18. **Sharpen Effect Adjustment (2025-06-15)**
    - Increased the unsharp mask strength so the slider visibly changes the image.

19. **Fluent 2 Theme Tokens (2025-06-16)**
    - Added a new `theme.js` module that injects Fluent 2 design tokens as CSS variables.
    - Included the script in `index.html` and applied tokens to sidebar and button styles.
20. **Fluent visual refresh and scroll fix (2025-06-16)**
    - Introduced reusable `glass` class for sidebar and headers.
    - Created `fluentTheme.ts` exporting token values.
    - Updated thumbnail strip to convert wheel scrolling to horizontal and fixed its height.
    - Tweaked thumbnail card hover and selection styles using tokens.

21. **Processing layout cleanup (2025-06-16)**
    - Converted the preview area to flex-grow so it fills remaining space.
    - Added `min-height: 0` to prevent the preview from pushing down the thumbnails.
    - Updated HTML comment and kept the thumbnail strip height at 112px via CSS only.

22. **Thumbnail strip and layout tweaks (2025-06-16)**
    - Raised the thumbnail strip to 160px and centered its items for better alignment with the sidebar.
    - Enlarged processing thumbnails to match the new strip height and adjusted responsive size.
    - Ensured horizontal scrolling always works by forcing overflow on the strip and binding wheel events.
    - Removed the right‑side margin from the main content and set the adjustment panel background to `#1f1f1f` to eliminate the dark gap.

23. **Unified page layout (2025-06-16)**
    - Introduced `--statusBarH` variable and applied it to thumbnail strip height.
    - Converted `.main-content` to a flex column container with full height and created a reusable `.page-body` class.
    - Added the class to all three tab pages so their content aligns with the left status bar.
    - Tweaked the thumbnail strip style to reference the variable.

24. **Thumbnail strip final adjustments (2025-06-16)**
    - Added `--thumbBarH` variable in `components.css` and enforced the thumbnail strip height at 218px with a persistent scrollbar.
    - Updated `main.css` to use the new variable and ensured the processing layout reserves the correct height.
    - Modified `main.js` to apply the height in script and bind wheel events once.

25. **Thumbnail strip width fix (2025-06-16)**
    - Converted `.processing-layout` to a two-column grid so the right adjustment panel occupies its own column.
    - Limited the thumbnail strip to the middle column and inserted a 2px pseudo element to always allow horizontal scrolling.
    - Height of the strip and thumbnails synced to `--thumbBarH` (215px) with JavaScript updated accordingly.
    - Removed leftover flex layout rules and width calculations on preview and thumbnail containers.

26. **UI touch ups (2025-06-16)**
    - Simplified `.slider-input` styles with transparent background and no border to avoid layout overflow.
    - Colored watermark card titles using new variables `--clrA`–`--clrD` and added `wm-a`..`wm-d` classes in HTML.


27. **Slider value color fix (2025-06-16)**
    - Added `--sliderValueColor` variable in `main.css` and applied it to all slider input fields.
    - Updated `components.css` and `watermark-controls.css` to use the variable and support disabled opacity.
    - Assigned new classes `output-size` and `separator-page` in HTML and styled them to ensure white slider values.


28. **Slider value color fix in settings (2025-06-16)**
    - Ensured all `.slider-value` elements inherit white text via `--sliderValueColor` in `components.css` and `main.css`.
