# Example: Recording Browser Video with Playwriter + Shipyard

Record browser interactions as video by capturing frames via Playwriter's CDP access and encoding with Shipyard's bundled FFmpeg.

## Overview

**Workflow:**
1. Playwriter captures frames via Chrome DevTools Protocol
2. Playwriter saves frames to temp directory
3. Shipyard encode + upload in single execute_code call (uses bundled FFmpeg)

**No setup required** - FFmpeg is bundled with Shipyard via @ffmpeg-installer (auto-downloaded on pnpm install).

## Why This Approach

Video recording requires FFmpeg for encoding. Shipyard bundles FFmpeg via `@ffmpeg-installer/ffmpeg` (auto-downloaded on install) so agents don't need manual setup. The execute_code sandbox allows `child_process.spawnSync` because Shipyard runs locally and agents already have Bash access - there's no additional security risk.

## Prerequisites

- Playwriter MCP connected to active Chrome tab
- Shipyard task with video deliverable created

## Complete Example

### Step 1: Capture Frames with Playwriter

Use Playwriter to start CDP screencast and save frames to disk:

```typescript
// Start recording (call via mcp__playwriter__execute)
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const MAX_FRAMES = 2000;  // ~5 min at 6fps, prevents memory issues

// Initialize recording state that persists between Playwriter calls
state.videoRecording = {
  frames: [],
  fps: 6,  // 4-8 recommended for demos
  framesDir: path.join(os.tmpdir(), `shipyard-frames-${crypto.randomUUID()}`),
  stopped: false
};

fs.mkdirSync(state.videoRecording.framesDir, { recursive: true });

// Start CDP screencast
const cdp = await getCDPSession({ page });
await cdp.send('Page.startScreencast', {
  format: 'jpeg',
  quality: 80,  // 60-90 range, 80 balances quality vs size
  maxWidth: 1280,
  maxHeight: 720
});

// Capture frames - CDP requires acknowledgment to send next frame
cdp.on('Page.screencastFrame', async (frame) => {
  if (state.videoRecording.stopped || state.videoRecording.frames.length >= MAX_FRAMES) {
    return;
  }

  // Save frame to disk immediately (avoids memory buildup)
  const frameNum = state.videoRecording.frames.length;
  const framePath = path.join(
    state.videoRecording.framesDir,
    `frame-${String(frameNum).padStart(6, '0')}.jpg`
  );

  fs.writeFileSync(framePath, Buffer.from(frame.data, 'base64'));
  state.videoRecording.frames.push(frameNum);

  await cdp.send('Page.screencastFrameAck', { sessionId: frame.sessionId });
});

console.log('Recording started. Frames will be saved to:', state.videoRecording.framesDir);
```

### Step 2: Perform Actions

Do your browser interactions - frames are captured automatically:

```typescript
// Navigate and interact (call via mcp__playwriter__execute)
await page.goto('https://example.com', { waitUntil: 'domcontentloaded' });
await waitForPageLoad({ page, timeout: 5000 });

// Use accessibility snapshot to find elements
await screenshotWithAccessibilityLabels({ page });

await page.locator('aria-ref=e5').click();
await page.locator('input[name="search"]').fill('test query');
await page.locator('button[type="submit"]').click();
await waitForPageLoad({ page, timeout: 5000 });

console.log(`Captured ${state.videoRecording.frames.length} frames`);
```

### Step 3: Stop Recording

Stop screencast and prepare for encoding:

```typescript
// Stop recording (call via mcp__playwriter__execute)
if (!state.videoRecording || state.videoRecording.stopped) {
  throw new Error('Recording not active');
}

state.videoRecording.stopped = true;

const cdp = await getCDPSession({ page });
cdp.removeAllListeners('Page.screencastFrame');
await cdp.send('Page.stopScreencast');

console.log(`Recording stopped. ${state.videoRecording.frames.length} frames saved to ${state.videoRecording.framesDir}`);

// Return frames directory for Shipyard encoding
const result = {
  framesDir: state.videoRecording.framesDir,
  frameCount: state.videoRecording.frames.length,
  fps: state.videoRecording.fps
};

state.videoRecording.framesDir;  // Return framesDir
```

### Step 4: Encode and Upload (Shipyard execute_code)

Shipyard's execute_code sandbox has bundled FFmpeg - encode and upload in one call:

```typescript
// Encode + upload (call via mcp__shipyard__execute_code or within execute_code)
// Assume framesDir, taskId, sessionToken, deliverableId are available

const { spawnSync } = child_process;
const outputPath = path.join(os.tmpdir(), `shipyard-video-${Date.now()}.mp4`);

try {
  // Encode with bundled FFmpeg (no installation needed)
  const result = spawnSync(ffmpegPath, [
    '-y',
    '-framerate', '6',
    '-i', path.join(framesDir, 'frame-%06d.jpg'),
    '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2',  // Ensure even dimensions for H.264
    '-c:v', 'libx264',
    '-pix_fmt', 'yuv420p',
    '-preset', 'fast',
    outputPath
  ], { encoding: 'utf-8', timeout: 60000 });

  if (result.status !== 0) {
    throw new Error(`FFmpeg encoding failed (exit ${result.status}): ${result.stderr?.slice(-300)}`);
  }

  console.log(`Video encoded: ${outputPath}`);

  // Upload to Shipyard
  const uploadResult = await addArtifact({
    taskId,
    sessionToken,
    type: 'video',
    filename: 'interaction-demo.mp4',
    source: 'file',
    filePath: outputPath,
    deliverableId,
    description: 'Video showing search functionality'
  });

  console.log('Video uploaded:', uploadResult.url);

  return uploadResult;

} finally {
  // Always cleanup temp files
  if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
  if (fs.existsSync(framesDir)) fs.rmSync(framesDir, { recursive: true });
}
```

## Configuration Options

| Option | Range | Default | Description |
|--------|-------|---------|-------------|
| fps | 4-8 | 6 | Playback framerate (lower = smaller file) |
| quality | 60-90 | 80 | JPEG quality for CDP capture |
| maxWidth | - | 1280 | Video width in pixels |
| maxHeight | - | 720 | Video height in pixels |
| preset | ultrafast, fast, medium, slow | fast | Encoding speed vs compression |

**File sizes:** 6 fps at quality 80 produces ~1-2 MB per minute.

## Full Workflow Example

```typescript
// 1. Create task with video deliverable
const task = await createTask({
  title: "Demo search feature",
  content: `# Search Feature Demo\n\n## Deliverables\n- [ ] Video showing search flow {#deliverable}`
});

const { taskId, sessionToken, deliverables } = task;
const deliverableId = deliverables[0].id;

// 2. Start recording (Playwriter)
// ... CDP setup code from Step 1 ...

// 3. Perform actions (Playwriter)
// ... interaction code from Step 2 ...

// 4. Stop recording (Playwriter)
const framesDir = /* ... code from Step 3 ... returns framesDir */;

// 5. Encode + upload (Shipyard execute_code)
await execute_code(`
  const { spawnSync } = child_process;
  const outputPath = path.join(os.tmpdir(), 'demo-${Date.now()}.mp4');

  try {
    const result = spawnSync(ffmpegPath, [
      '-y', '-framerate', '6',
      '-i', path.join('${framesDir}', 'frame-%06d.jpg'),
      '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2',
      '-c:v', 'libx264', '-pix_fmt', 'yuv420p',
      outputPath
    ], { timeout: 60000 });

    if (result.status !== 0) throw new Error('Encoding failed');

    await addArtifact({
      taskId: '${taskId}',
      sessionToken: '${sessionToken}',
      type: 'video',
      source: 'file',
      filePath: outputPath,
      deliverableId: '${deliverableId}'
    });

  } finally {
    if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
    fs.rmSync('${framesDir}', { recursive: true });
  }
`);
```

## Notes

- **FFmpeg bundled**: No manual installation - included with Shipyard via @ffmpeg-installer
- **Frame padding**: Use 6 digits (%06d) for frame filenames to match FFmpeg pattern
- **Cleanup**: Always remove temp files (frames + encoded video) after upload
- **Even dimensions**: H.264 requires even width/height - scale filter handles this
- **Cross-platform**: Works on macOS (ARM + Intel), Linux, Windows

## Troubleshooting

**"No such file" error:**
- Verify frame filenames match pattern (frame-000000.jpg, frame-000001.jpg, etc.)
- Use correct padding in FFmpeg input pattern (%06d for 6 digits)

**"width not divisible by 2" error:**
- Add scale filter: `-vf 'scale=trunc(iw/2)*2:trunc(ih/2)*2'`

**Encoding timeout:**
- Reduce frame count or increase timeout parameter
- Use faster preset: `-preset ultrafast`

**Large file sizes:**
- Lower fps (4 instead of 6)
- Reduce quality in CDP capture (60 instead of 80)
- Reduce maxWidth/maxHeight
