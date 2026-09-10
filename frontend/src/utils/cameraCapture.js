/**
 * Waits until the video element has valid dimensions so canvas drawImage is not blank.
 */
export async function waitForVideoReady(video, maxMs = 15000) {
  if (!video) throw new Error("No video element");
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    if (video.videoWidth > 0 && video.videoHeight > 0) {
      await new Promise((r) => requestAnimationFrame(r));
      return;
    }
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error("Camera preview not ready. Try again.");
}
