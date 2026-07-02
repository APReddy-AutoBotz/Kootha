# M17 Driver App Real Device Build Guide

This guide documents safe build and run choices for the Android driver app. M17 does not add build artifacts, app store configuration, Expo tokens, or real account values.

## Current Build And Run Options

- `pnpm dev:driver` starts the Expo Android workflow from the workspace.
- Expo Go may be enough for a quick real-device smoke test if app dependencies are supported.
- A development build is preferred when AP needs behavior closer to the pilot app.
- An APK can be created only after AP chooses the build route and provides any required account or project setup outside Git.

## Expo Go, Development Build, Or APK

| Option | Use when | Evidence needed | Notes |
| --- | --- | --- | --- |
| Expo Go | Quick physical-device launch and UI check. | App opens on phone and target env behavior is recorded. | May not match final build behavior for all native features. |
| Development build | Real-device native behavior must be closer to pilot. | Build reference and install result. | Requires AP-managed build account/project setup if remote build is used. |
| APK | AP wants a packaged test artifact. | APK build reference kept outside Git and install result. | Do not commit APK files. |

## Placeholder Commands

Run only with real values configured outside Git:

```bash
pnpm install --frozen-lockfile
pnpm dev:driver
```

For a development build or APK, AP must choose the build service and provide setup outside Git. Keep account tokens, credentials, keystores, and build artifacts out of this repository.

## Before Generating A Real-Device Build

- Confirm `.env.example` contains placeholders only.
- Confirm driver app values use public Expo env names only.
- Confirm no privileged Supabase key is present in driver app configuration.
- Confirm Android config does not request background location.
- Confirm no app store release metadata is needed for pilot testing.
- Confirm test data is fake and no customer data is bundled.

## Safe Build Evidence Template

| Field | Value |
| --- | --- |
| Build option | Expo Go / development build / APK |
| Build command reference | Placeholder or private reference only |
| Environment | Local / preview / production-like |
| Device type | Android phone, no device id |
| Result | Pass / Fail / Blocked |
| Evidence reference | Private reference outside Git |
| Remaining issue | Short safe note |

## Known Limitations

- This repository cannot validate a physical Android phone by itself.
- This repository cannot prove Expo account, remote build, or APK install success without AP running the build.
- M17 does not commit build artifacts.
- M17 does not add Expo account tokens, EAS secrets, app signing secrets, or app store release configuration.
- M17 does not certify GPS route coverage, maps, distance, or customer live tracking.
