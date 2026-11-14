# M30 Real Device Test Sheet

One complete fake-data job on a physical Android phone, from Work Code entry to proof upload. Record a result for every row. Use fake business data only, and do not copy real coordinates, phone numbers, Work Codes or keys into this file.

## Before the phone

| # | Step | Done |
| --- | --- | --- |
| 1 | Hosted Supabase project is active and its migration list matches `supabase/migrations` | |
| 2 | One admin login exists in Supabase Auth and is marked `admin` in `user_profiles` | |
| 3 | `proof-photos` storage bucket exists and is private | |
| 4 | One fake driver and one fake vehicle are approved | |
| 5 | One fake Ad Work with today's date is assigned, Ready for Execution, with Location Proof Required on | |
| 6 | Driver app environment has the hosted URL and the public anon key only | |
| 7 | Phone has USB debugging on and the driver app installed | |

## On the phone

| # | Action | Expected | Result | Note |
| --- | --- | --- | --- | --- |
| 1 | Open the app with no network | App opens and shows a safe message, no crash | | |
| 2 | Submit the driver registration form | Application appears in admin Driver Applications, once | | |
| 3 | Admin chooses Release to Driver | A 10-character Work Code is shown | | |
| 4 | Enter the mobile number and a wrong Work Code | Access is refused | | |
| 5 | Enter the correct Work Code in lower case with a dash in the middle | Assigned Work opens | | |
| 6 | Start Work | Admin shows the day as Running | | |
| 7 | Choose Start Location Proof | The Android location prompt appears now and not earlier; it offers foreground access only | | |
| 8 | Deny the prompt | App shows Location Permission Needed; admin shows the permission warning | | |
| 9 | Allow location in Android settings, then Start Location Proof again | Location Proof Running; point count rises in admin within about a minute | | |
| 10 | Turn on airplane mode for three minutes with the app open | App shows Location Saved Offline and a pending count | | |
| 11 | Turn airplane mode off and choose Sync Now | Pending count returns to zero; admin point count rises by the same number, with no duplicates | | |
| 12 | Take Break | Location Proof pauses; admin shows On Break | | |
| 13 | Resume Work and start Location Proof again | Capture continues | | |
| 14 | Upload Photo Proof with a gallery photo | App shows Proof Sent | | |
| 15 | Admin opens the proof preview | The actual photo is shown, not an empty or broken image | | |
| 16 | Force-stop the app and reopen it mid-job | After entering the mobile number and Work Code again, the job state is unchanged and buffered points are still there | | |
| 17 | Lock the screen for five minutes during Location Proof | Record what happens. Capture is foreground-only, so a gap is expected | | |
| 18 | Admin chooses Revoke Work Code | The app loses access on its next action | | |
| 19 | Admin regenerates the Work Code; driver enters the new one; End Work with a completion note | Day is Completed; Location Proof stops | | |
| 20 | Check Android app permissions | Location is "only while using the app"; there is no background location permission | | |

## Known limits to observe

- Location is captured only while the app is open on screen. A locked screen or another app in front stops capture until the driver returns.
- The app does not remember the mobile number and Work Code after it is closed. The driver types both again.
- The server decides "today" by the India calendar date, so Start Location Proof and Upload Photo Proof work between midnight and 05:30 India time. If either is refused for today's work in those hours, record it as a failure.
- If the phone cannot get a location within 20 seconds, the app shows a message and tries again on the next interval.

## Outcome

| Field | Value |
| --- | --- |
| Date | |
| Android version | |
| Build type | Expo Go / development build / APK |
| Rows passed | |
| Rows failed | |
| Blocked rows and reason | |
| Decision | Pass / Fix and retest |
