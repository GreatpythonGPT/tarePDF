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

