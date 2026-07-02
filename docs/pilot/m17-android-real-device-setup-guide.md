# M17 Android Real Device Setup Guide

This guide prepares the Android driver app for manual real-device testing. It does not prove the driver app works on a phone until AP runs the steps on a physical Android device.

## Required Phone

- Android phone capable of running the Expo driver app or an APK/dev build.
- Stable internet connection for online checks.
- Ability to temporarily disable network access for offline buffer testing.
- No personal phone number, device id, account email, or private screenshot should be committed.

## Developer Options And USB Debugging

Use USB debugging only if the selected run path needs it. AP should enable Developer Options and USB debugging on the phone according to Android device instructions, then disable USB debugging after testing if it is not normally needed.

Do not record device serial numbers or personal device names in this repository.

## Driver App Run Options

- Expo Go for quick manual validation if compatible with the current app dependencies.
- Development build if native dependency behavior must match the pilot app more closely.
- APK only if AP explicitly decides to create a packaged test build.

The chosen option must use public Supabase URL and anon key values configured outside Git. No privileged key belongs in the driver app.

## Run The Driver App On A Real Phone

1. Confirm local dependencies are installed with `pnpm install --frozen-lockfile`.
2. Confirm the target public driver app env values are available outside Git:
   - `EXPO_PUBLIC_PRODUCT_NAME`
   - `EXPO_PUBLIC_SUPABASE_URL`
   - `EXPO_PUBLIC_SUPABASE_ANON_KEY`
3. Run the driver app through the selected Expo or build path.
4. Open the app on the Android phone.
5. Confirm the driver registration or assigned work access screen appears.
6. Record only a safe evidence reference in the M17 evidence template.

## Verify The App Opens

Pass criteria:

- App opens without crashing.
- Product name appears as expected.
- Driver registration or Work Code access screen is reachable.
- Missing or placeholder environment values produce safe not-configured messaging.

Fail criteria:

- App crashes on launch.
- App cannot connect to the target project when target values are configured.
- App exposes private values or logs sensitive data.

## Verify Foreground Location Permission Timing

1. Use fake assigned work released to a test driver.
2. Open the assigned work using mobile number and Work Code in the app.
3. Confirm location permission is not requested at app launch.
4. Start work for the assigned day.
5. Read the Location Proof notice.
6. Choose Start Location Proof.
7. Confirm foreground location permission appears at this point only.
8. Deny once and record that the app handles denial with safe Permission Missing wording.
9. Allow once and confirm points are attempted only during active assigned work.

Do not record raw latitude or longitude in committed docs.

## Verify No Background Location Request Appears

Pass criteria:

- Android does not ask for background location.
- App configuration does not include `ACCESS_BACKGROUND_LOCATION`.
- Location Proof stops after work ends, break/admin stop/revoke/closure stops access, or the active work window ends.

Fail criteria:

- Android asks for background location.
- Location continues after work ends.
- Location starts before assigned work is active.

## Safe Evidence Capture

Use the evidence template with references such as:

- Private evidence folder reference.
- Internal ticket id.
- Manual checklist row id.
- Screenshot reference stored outside Git.

Do not commit:

- Private screenshots.
- Device serial numbers.
- Phone numbers.
- Work Codes.
- Raw GPS coordinates.
- Proof file paths.
- Supabase project URLs or keys.
