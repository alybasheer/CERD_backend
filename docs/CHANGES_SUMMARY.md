# Changes Summary

> Historical note: the sections below describe the first stats and Google-login slice. For the current cross-repository design and verification record, use `CommunityServiceNetwork_Flutter/docs/ENGINEERING_NOTES.md` and its U01-U20 worklist.

## Current backend scope (3 October 2026)

- Revocable refresh-token sessions with live account/role enforcement for REST and sockets.
- Durable request states, owner cancellation/history hiding, guarded transitions, and request-chat cleanup.
- Per-user direct-chat hiding and request-scoped chat authorization.
- Persisted community start/end lifecycle, joined history, and personal terminal-history hiding.
- Account-owned Android/iOS FCM registrations with targeted request, chat, community, application, and moderation notifications.
- Admin feedback pagination, account blocking, volunteer-role removal, session revocation, socket disconnection, and safe assignment reopening.

Verification: TypeScript passes and Jest passes 10 suites / 26 tests. Live MongoDB migration/race checks and deployed Firebase delivery remain external acceptance work.

## 1. New API Endpoint: `GET /help-requests/my/stats`

**Purpose:** Volunteer apna stats dekh sakta hai — kitne help requests resolve kiye, uski rating average, rating count, aur sab ratings ki list.

**Response example:**
```json
{
  "success": true,
  "data": {
    "totalHelped": 5,          // kitne resolved requests is volunteer ne kiye
    "ratingAverage": 4.2,      // average rating (1-5)
    "ratingCount": 4,          // kitne logon ne rate kiya
    "ratings": [               // sab ratings ki details
      {
        "_id": "...",
        "score": 5,
        "comment": "Great help!",
        "requesterId": { "_id": "...", "username": "xyz" },
        "requestId": { "_id": "...", "title": "..." }
      }
    ]
  }
}
```

**Requires JWT token** in Authorization header.

---

## 2. Files Changed

### `src/help-requests/help-requests.controller.ts`
- Added `RatingsService` injection
- Added `GET /my/stats` route handler
- Route placed before `:id` wildcard to avoid 404

### `src/help-requests/help-requests.service.ts`
- Added `getVolunteerCompletedRequestsCount(volunteerId)` — count of resolved requests where `acceptedBy = volunteerId`

### `src/ratings/ratings.service.ts`
- Added `getVolunteerRatings(volunteerId)` — returns all rating entries for a volunteer with requester & request populated

### `src/app.module.ts`
- Removed dead `UserModule` import (module files didn't exist, was breaking build)

---

## 3. Firebase Google Sign-In Added

### New Files
- **`src/firebase/firebase.service.ts`** — Firebase Admin SDK initialize karta hai, `verifyGoogleToken(idToken)` provide karta hai
- **`src/firebase/firebase.module.ts`** — FirebaseModule

### Modified Files
- **`src/authentication/authentication.module.ts`** — Imported `FirebaseModule`
- **`src/authentication/authentication.service.ts`** — Inject `FirebaseService`, uncommented `loginWithGoogle()` method
- **`src/authentication/authentication.controller.ts`** — Uncommented `POST /authentication/google-login` endpoint
- **`FIREBASE_SETUP.md`** — Updated with accurate setup steps

### How to Use
1. Firebase console se `serviceAccountKey.json` download karo
2. Project root mein daalo
3. Server restart karo — Firebase auto-init hoga
4. Flutter se `POST /authentication/google-login` with `{ idToken, username }` bhejo

---

## 4. Build / Test Status
- `npm run build` ✅ passes
- `npm test` ✅ all 13 tests pass
