---
name: research-experiment-tool
description: Build browser-based multi-modal data collection tools for research experiments — dual-role interfaces (subject/experimenter), MediaPipe-based sensing, WebSocket real-time relay, and offline physiological data integration. Use when a researcher needs a zero-friction experiment platform where subjects are unobtrusively monitored and experimenters get real-time dashboards.
---

# Research Experiment Tool

## When to Use

User needs a browser-based experimental data collection platform for educational/psychological/neuroscience research. Triggers include: "monitor student attention during video", "track gaze while watching content", "build experiment app for tablet", "dual-role experiment interface", "real-time subject monitoring dashboard", "unobtrusive data collection", "combine webcam + EEG data", or any research scenario where one group (subjects) interacts with content while another group (experimenters) observes real-time metrics.

## Architecture Pattern

Every tool built with this skill follows the same skeleton:

```
experiment-tool/
├── package.json          # single dependency: ws
├── server.js             # WebSocket relay + static file server (~100 lines)
├── subject.html          # Subject-facing: fullscreen content, silent sensing
├── experimenter.html     # Experimenter dashboard: overlay views, real-time charts
├── shared/
│   ├── sensor.js         # Browser-based sensing (MediaPipe, audio, etc.)
│   ├── sync.js           # Timestamp management, local storage, CSV/JSON export
│   └── offline-loader.js # Import + merge offline data (EEG, etc.)
└── scripts/
    └── analyze.py        # Python post-processing (signal processing, stats)
```

## Core Design Principles

### 1. Subject Sees Nothing
The subject-facing page must look identical to a normal content consumption experience. Camera feeds, metric displays, and data transmission happen in hidden elements or background processes. The subject's browser URL should not reveal the tool's purpose.

### 2. WebSocket Relay, Not Server Logic
The server.js is a dumb message switchboard — register clients, relay messages by role, broadcast student lists. Zero business logic. Zero database. This keeps it under 100 lines and eliminates backend complexity.

### 3. Local Processing, No Cloud Upload
All sensor data (camera frames, audio) is processed locally in the browser. Only extracted numerical features leave the device. This addresses privacy concerns and eliminates bandwidth bottlenecks.

### 4. Timestamps Are the Universal Join Key
Three data streams must align: video timeline, sensor frames, and offline physiological data. Every record gets a wall-clock timestamp (ms). Post-hoc alignment uses nearest-neighbor matching with configurable tolerance.

### 5. Export Everything as Flat CSV/JSON
No proprietary formats. Every data stream exports independently AND as merged datasets. This feeds directly into Python/R/SPSS for statistical analysis.

## Build Steps

### Step 1: Create the server skeleton
Start with `package.json` (dependency: `ws`) and `server.js`. The server does three things:
- Serves static files via Node's `http` module
- Maintains two client registries: `students` (Map) and `experimenters` (Set)
- Relays messages by type: `subject:metrics` → broadcast to experimenters; `video:event` → broadcast; `experimenter:subscribe` → filter by studentId

### Step 2: Build the sensor module (shared/sensor.js)
For camera-based sensing, use **MediaPipe Face Mesh** via CDN (no npm install needed on clients). The class pattern:

```javascript
class Sensor {
  async init()         // Load MediaPipe model, request camera
  async start(videoEl) // Begin frame processing loop
  stop()               // Release camera
  onMetrics(callback)  // Register metric handler
  _processFrame()      // send() to MediaPipe → onResults()
  _computeMetrics(lm)  // Extract features from 468 landmarks
}
```

Key metrics to extract from Face Mesh landmarks:
- **EAR** (Eye Aspect Ratio): blink detection, drowsiness. Landmarks 33/133/159/145/160/144 for left eye.
- **Gaze direction**: Iris landmarks 468-477 relative to eye corners. Map to -1..+1 normalized coordinates.
- **Head pose**: Nose tip (1) vs face center (average of eyes+mf183?mouth) → yaw; nose vs eye line → pitch; eye line angle → roll.
- **Attention score**: Composite 0-100 from gaze, head yaw, blink duration, face detection confidence.

### Step 3: Build the subject page (subject.html)
Requirements:
- Fullscreen content player (HTML5 video, image sequence, or web-based task)
- Hidden `<video>` element (positioned off-screen) for camera feed
- Name input modal (de-identified, no real names)
- WebSocket auto-connect with student registration
- Video event tracking: play, pause, seek, ended — all timestamped
- Metrics sent every N frames (batch to reduce WebSocket overhead)
- `beforeunload` handler for graceful disconnect

### Step 4: Build the experimenter page (experimenter.html)
Requirements:
- **Left sidebar**: Real-time student list with attention scores (color-coded: green >70, yellow >40, red <40)
- **Main overlay area**: Semi-transparent content video + virtual face visualization (ellipse for head, dots for eyes/irises, nose for head pose)
- **Bottom panel**: Chart.js attention timeline for selected student
- **EEG panel** (sidebar): Shows α/θ/β power and θ/α ratio when offline data is loaded
- **Class overview mode**: Grid of attention cards for all students simultaneously
- **Data export**: One-click JSON download of all sessions

Chart.js configuration:
```javascript
new Chart(ctx, {
  type: 'line',
  data: { datasets: [{ borderColor: '#00aaff', fill: true, tension: 0.3, pointRadius: 0 }] },
  options: { animation: { duration: 0 }, scales: { y: { min: 0, max: 100 } } }
});
```
Animation disabled for real-time performance. Max 200 data points displayed.

### Step 5: Build the offline data loader (shared/offline-loader.js)
For physiological data collected offline (EEG, ECG, etc.):
- Accept CSV with columns: `timestamp, metric1, metric2, ...`
- `loadFromFile(file)` / `loadFromCSV(text)` methods
- `getAt(ts)` — nearest-neighbor lookup with configurable tolerance
- `getRange(tsStart, tsEnd)` — windowed query for epoch analysis
- `alignToVideo(videoStartWallClock)` — map absolute timestamps to video-relative time
- `mergeWithFace(faceMetrics, toleranceMs)` — join sensor + physiological data
- `summary()` — descriptive statistics
- `mergedToCSV(merged)` — export for downstream analysis

### Step 6: Add an import button to experimenter dashboard
Add a file input + button in the toolbar. On file select:
1. Parse CSV
2. Show summary (sample count, avg metrics, duration)
3. If a student is selected, merge with their face tracking data
4. Update EEG panel with current values

### Step 7: Create post-processing scripts (Python)
For signal processing that can't run in browser (FFT, filtering, artifact rejection):

```python
# scripts/eeg_analyze.py — accepts raw data files, outputs CSV for offline-loader
python scripts/eeg_analyze.py raw_data.edf -o metrics.csv --window 2.0 --plot
```

Dependencies: `mne`, `numpy`, `scipy`, `pandas`, `matplotlib` (all standard for EEG research).

**Device-specific handling**: When the user's EEG device is known (e.g., 诺诚 NCC 16-channel saline electrodes), hardcode the channel layout into the script. NCC's standard 10-20 layout: Fp1/Fp2/F3/F4/C3/C4/P3/P4/O1/O2/F7/F8/T3/T4/T5/T6. Auto-detect 16-channel data with generic CH names and remap to standard names. Default sampling rate 256 Hz. Frontal channels (Fp1/Fp2/F3/F4) are the primary analysis channels for cognitive load (θ/α ratio).

**Band power pipeline**: Welch PSD → integrate within θ(4-8Hz)/α(8-13Hz)/β(13-30Hz) bands → output per-window CSV with columns: `timestamp, alpha, theta, beta, theta_alpha_ratio, quality`. The quality column flags artifact-contaminated windows (amplitude > 500µV or NaN). Add `--baseline-start` / `--baseline-end` flags to compute individual baselines from eyes-closed resting state.

## Communication Protocol

All WebSocket messages are JSON with a `type` field:

| Message | Direction | Purpose |
|---------|-----------|---------|
| `student:register` | S→Svr | { studentId, name, hasEEG } |
| `student:metrics` | S→Svr | { studentId, data: { ear, gaze_x, ... } } |
| `video:event` | S→Svr | { studentId, event: { type, videoTime } } |
| `eeg:data` | S→Svr | { studentId, data: { alpha, theta, ... } } |
| `student:offline` | Svr→Exp | { studentId } |
| `students:list` | Svr→Exp | { students: [{ id, name, hasEEG, online }] } |
| `teacher:register` | Exp→Svr | {} |
| `teacher:subscribe` | Exp→Svr | { studentId } |

## Privacy Requirements

- No raw video or audio leaves the subject's device
- Only numerical features transmitted (coordinates, angles, ratios)
- Student names are nicknames, never real names
- No cloud services — everything runs on local network
- Camera processing is local (MediaPipe runs in browser WebGL)
- All data export is manual, never automatic

## Directory Placement

The experiment tool lives as a subdirectory within the user's existing `research-mgmt` repository:
```
research-mgmt/experiment-tool/
```

This keeps all research infrastructure in one place. The tool's README should reference the broader project context.

## Common Pitfalls

- **MediaPipe CDN loading**: Must include `<script>` tag BEFORE the sensor module. Check `typeof FaceMesh !== 'undefined'` before initializing.
- **Camera permission**: Browser requires HTTPS or localhost. On tablets accessing via LAN IP, use `http://` and ensure the browser doesn't block insecure camera access (some browsers do — test first).
- **WebSocket on LAN**: Student tablets connect via `ws://<server-ip>:8080`. Windows firewall may block — add Node.js exception.
- **Chart.js animation**: Must set `animation: { duration: 0 }` for real-time — otherwise the chart lags behind by animation frames.
- **Timestamp alignment**: EEG timestamps from different devices may use different epochs. Always convert to a common reference (video start wall clock) before merging.
- **Nested tar extraction**: When the user downloads a .tar.gz, Windows may create a nested `research-mgmt/research-mgmt/` structure. Guide them to extract flat or move contents up one level.

## When the experiment uses teaching videos: Cognitive Event Annotation

For educational/psychology experiments where the stimulus is a pre-recorded teaching video, the teacher partner must annotate the video BEFORE the experiment. This produces a **cognitive event annotation table** that maps video timeline segments to expected cognitive states, which the research team uses to set analysis windows for EEG/face-tracking data.

### Annotation Table Template

Provide the teacher partner a markdown table with these columns:

| Column | Description | Example |
|--------|-------------|---------|
| 序号 | Segment number | 1, 2, 3... |
| 时间段 | Start–end timestamp | 0:00–2:30 |
| 时长 | Approximate duration | 2.5分 |
| 教学内容 | One-line description of what's being taught | "展示打车app截图，提开放问题" |
| 认知需求 | 🟢低 / 🟡中 / 🔴高 | 🔴 高 |
| 教学意图 | Why this segment exists | "核心建模步骤：变量抽象" |
| 预期难点 | Where students get stuck (from teacher's experience) | "自变量/因变量容易写反" |
| 预期学生反应 | Observable behavior (expression, gaze, body) | "长时间停顿，注视点在草稿纸和屏幕间切换" |

Key design rules for the template:
- **12-15 min video → 8-12 event segments**, each 1-3 minutes
- **Include a filled-in example row** (e.g., a sample taxi-fare modeling lesson) so the teacher can see the expected level of detail
- **The 🔴高负荷 rows are the most important** — these are where the research team expects to see EEG θ/α spikes, confusion AU patterns, and gaze drift
- **Add post-recording columns** for the research team (actual timestamps, deviations, analysis window adjustments)
- Keep the template self-contained as a single `.md` file that can be sent directly to the teacher

### Collaboration Task List

After the tool is built and the template is delivered, create a **per-person task list** (`协作待办清单.md`) organized by:
- 🔴 近期 (2 weeks): concrete, scoped tasks with expected outputs
- 🟡 中期 (1-3 months): strategy design, material preparation
- Each person gets their own section with role, tasks, outputs, and dependencies
- Include a timeline summary showing key milestones across all members

## Related Skills

- `research-project-management`: Administrative infrastructure (grants, collaborators, timelines) — this skill builds the experimental tools that feed data into those projects.
- `personal-data-tracker`: CSV templates and GitHub Actions for quantified-self — similar data architecture but for personal health, not research experiments.
