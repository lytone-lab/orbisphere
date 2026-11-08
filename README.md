# PROJECT ORBI — Desktop AI Companion

## 1. The Vision
Project Orbi is a full-screen, procedurally generated, interactive digital character inspired by the Las Vegas Sphere. However, instead of a physical building, **the PC monitor is the display surface.** 

The ultimate goal is not just a visual render, but an **autonomous AI companion**. Orbi will eventually decide its own expressions, track the user, react to stimuli (camera/mic), display dynamic elements (like pity faces or dynamic highlights), and feel genuinely "alive" on the desktop.

## 2. Technical Stack & Constraints
*   **Environment:** Windows PowerShell (Vibecoded via AI).
*   **Core:** HTML, CSS, Vanilla JavaScript.
*   **Rendering:** Three.js (loaded via CDN import maps).
*   **Post-Processing:** `EffectComposer`, `UnrealBloomPass`, `SMAAPass`.
*   **Camera:** Orthographic (No 3D perspective distortion; flat screen composition).
*   **Constraints:** No React, no heavy frameworks, no Blender/external 3D modeling. All geometry is procedural.

## 3. Current Architecture (Phase 1-3 Complete)
*   **The Base:** A massive plane with a procedurally generated radial gradient (Canvas API) to simulate the glowing LED dome.
*   **The Face Rig:** 
    *   Eyes: Blue sclera, dark navy pupils, overlapping pill-shaped eyebrows.
    *   Mouths: Procedural Torus/Circle geometries for Neutral, Happy, Surprised, and Sad.
*   **Gaze & Parallax:** Pupils track the mouse using `MathUtils.damp` with a smooth inertial return to center. 
*   **Blink Engine:** Eyebrows act as eyelids, dropping to crush the eyes seamlessly.
*   **Expressions:** Press `1` (Neutral), `2` (Happy), `3` (Surprised), `4` (Sad), `Space` (Blink).

## 4. How to Run
1. Open terminal in the project folder.
2. Run `python -m http.server 8000` (or `npx serve`).
3. Open Chrome and navigate to `http://localhost:8000`.
