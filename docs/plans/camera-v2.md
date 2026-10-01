# Camera and offline capture

## Plan

1. Remove catalog-connectivity gating from photo capture. Camera and gallery are local operations; uploading remains an explicit next action.
2. Keep the custom source popup and iOS modal-dismissal ordering. Guard duplicate launches and restore buttons after cancellation or failure.
3. Explain denied camera permission with an actionable settings link when the OS will not ask again.
4. Release native image-processing resources even on rendering failure; handle empty picker results without crashing.
5. Test the actual photo-service module with mocked native adapters for cancellation, permissions, compression and failure. Parent handles phone camera/gallery checks in the rebuilt HTTPS app.

## Documentation

Expo 57 ImagePicker and ImageManipulator docs were fetched and checked. Existing config-plugin camera/photo permission strings are present and microphone permission is disabled.

## Implementation and review

- Removed `connected` from SignPhotos' capture-button gating. Photo capture/gallery selection remain available when the catalog API is unreachable; upload still starts only from Read sign & review.
- Added a synchronous launch guard against repeated taps, kept iOS dismissal ordering, and cancel pending launch if its owning sheet is hidden.
- Permission denial returns a typed error. The picker shows localized advice and, when permission is blocked, a phone-settings action.
- Image rendering now releases its native context even when render fails; empty picker results and oversized processed images fail safely.
- Seven photo tests pass, including the actual SignPhotos render with an offline catalog, camera denial, cancellation, web activation, resizing, render/save failures, and oversized input.
- Full lint and TypeScript checks pass. Physical camera/gallery permissions and iOS presentation still need device checks; mocked native adapters do not prove OS integration.
