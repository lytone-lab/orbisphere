# Project Orbi - Development Roadmap

## Phase 1: Visual Foundation (✅ Complete)
- [x] Orthographic camera setup.
- [x] Procedural radial gradient background (LED dome effect).
- [x] Smooth bloom and SMAA anti-aliasing.

## Phase 2: Facial Rig & Mechanics (✅ Mostly Complete)
- [x] Layered eye geometry (Sclera, Pupil, Eyebrows).
- [x] Seamless blink mechanic (Eyebrows crush the eyes).
- [x] Expression switching (Neutral, Happy, Surprised, Sad).
- [ ] **Fine-Tuning Expressions:** Perfect the exact curves and behaviors of individual expressions.
- [ ] **Dynamic Highlights:** Re-introduce moving white highlights in pupils for specific states (Pity, Begging, Crying).
- [ ] **Complex States:** Add "Judging", "Grumpy", "Pity", and "Begging" faces based on Orbi reference images.

## Phase 3: Interactivity & Depth (✅ Complete)
- [x] Mouse tracking (Pupils follow cursor).
- [x] Inertial return to center.
- [x] Background light shift based on gaze.
- [ ] **Refine Blink:** Minor timing and easing tweaks for absolute perfection.

## Phase 4: Autonomous AI Integration (⏳ Upcoming)
- [ ] **The Brain:** Implement an AI state machine that decides which expression to use based on time, user activity, or random chance.
- [ ] **Dynamic Highlights:** AI triggers highlights for emotional intensity.

## Phase 5: Hardware Interaction (⏳ Upcoming)
- [ ] **Camera Input:** MediaPipe Face Landmarker to mirror user expressions (smile, blink, head tilt).
- [ ] **Voice Interaction:** Web Speech API for voice commands and TTS responses.
- [ ] **Gesture Recognition:** Hand waves or thumbs up via MediaPipe.
