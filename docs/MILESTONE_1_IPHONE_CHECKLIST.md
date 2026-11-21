# Milestone 1 iPhone acceptance checklist

Development preview: [ccheng.github.io/talus-scree-mark/](https://ccheng.github.io/talus-scree-mark/).

Use a sheet you make for this test. Write “MOCK SHEET” and mark four different corners so rotation and mirroring are visible. Have a JPEG or PNG of the mock sheet available offline in Photos or Files. Record the iPhone model, iOS version, visible app build and browser mode. Repeat camera and offline checks independently in Safari and as a Home Screen web app.

## Safari

1. Open the preview in Safari while online. Wait for **Offline ready** before going offline. Record the visible build.
2. Start the camera and allow access. Point the rear camera at the mock sheet and capture. Check that the preview is upright, shows the full camera framing, and stops the live camera. Retake with the phone rotated and verify the new preview. Clear and verify the image disappears.
3. Import the local mock JPEG or PNG. Verify its orientation and clear it. Try a corrupt or unsupported file if available and check that the error leaves the controls usable. Note whether Photos supplied a converted image or an unsupported HEIC file if you use a HEIC source.
4. Turn on airplane mode and verify both Wi-Fi and cellular service are off. Close Safari, reopen it and load the preview URL while still offline. Confirm the shell opens and the previous image is gone. Capture, import the local mock file, preview, retake and clear before restoring connectivity.
5. While online again, test camera denial and recovery. Deny camera permission, verify import stays usable, then re-allow camera access through Safari’s website settings and retry. Background the app while the camera is open and verify it returns without restarting the camera.

## Home Screen web app

1. While online, open the preview in Safari, tap **Share** and **Add to Home Screen**. Enable **Open as Web App** where shown, then tap **Add**.
2. Open **Scree Mark** from the Home Screen and wait for **Offline ready** in that mode. Repeat the capture, import, retake, clear, camera denial/recovery and backgrounding checks.
3. Turn on airplane mode with Wi-Fi and cellular off. Quit the Home Screen app from the app switcher, then launch it again from its icon. Check that it starts with an empty preview. Capture, import, retake and clear a mock image while offline before restoring connectivity.

## Evidence

For each result record the mode, build, action, expected and actual result. Include any error text and whether the camera indicator went away when leaving capture. Record update and cache fault tests separately. The controlled two-release update check needs a staged development build and is coordinated independently of this first-use walkthrough.

- [Apple Home Screen web app instructions](https://support.apple.com/guide/iphone/open-as-web-app-iphea86e5236/27/ios/27)
