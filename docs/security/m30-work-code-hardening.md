# M30 Work Code Hardening

The driver app has no login. A driver opens assigned work with a mobile number and a Work Code through anonymous database functions, so the Work Code is the only secret protecting that work.

## What changed

| Area | Before | After |
| --- | --- | --- |
| Generated code | 8 hexadecimal characters (32 bits) | 10 characters from a 31-symbol alphabet (about 49 bits) |
| Alphabet | 0-9, A-F | A-Z and 2-9 without I, L, O, 0 and 1, so codes read aloud or handwritten are not confused |
| Stored digest | Unsalted MD5 | Versioned SHA-256 (`v2:` prefix) |
| Typing tolerance | Leading and trailing spaces, letter case | Any spaces or dashes, letter case |
| Admin-supplied code | At least 4 letters or numbers | 8 to 20 letters or numbers |
| Retained M6 release function | Issued its own 8-hex codes | Delegates to the governed release function |

Migration: `supabase/migrations/20261113180000_m30_work_code_hardening.sql`.
Database test: `supabase/tests/m30_work_code_hardening.test.sql`.

## Effect on existing data

Every driver function compares the stored digest with `m6_hash_work_code(code)`. Replacing that one function moves all of them to SHA-256. A Work Code issued before this migration is stored as MD5 and stops working. For any work that was already released, an admin must choose **Regenerate Work Code** and share the new code with the driver.

## Sharing codes

A generated code such as `K7MPQ2XW9D` can be read out or written as two groups, `K7MPQ 2XW9D` or `K7MPQ-2XW9D`. The driver may type it with or without the space or dash, in either letter case.

## Empty and short codes

`m6_hash_work_code` never returns NULL. Several driver functions refuse a caller with `stored_digest <> m6_hash_work_code(code)`; a NULL digest would make that comparison NULL and let an empty code through. Empty, missing and short input therefore still produce a digest, which cannot match a stored one.

## Not covered

- There is no per-driver limit on wrong attempts in the database. A failed attempt raises an error, which rolls back any counter written in the same call. With about 49 bits of code space, guessing through the public API is not practical, but an attempt limit at the API edge is still planned before an open public launch.
- Codes do not expire on a timer. Access ends when an admin revokes the code, regenerates it, or the work is cancelled.
