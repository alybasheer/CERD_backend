# Firebase Setup Guide

## Step 1: Create Firebase Project
1. Go to https://console.firebase.google.com/
2. Click "Create Project" or select existing project
3. Enable Google Sign-In:
   - Authentication → Sign-in method → Enable Google → Save

## Step 2: Download Service Account Key
1. Project Settings → Service Accounts → "Generate New Private Key"
2. File download hota hai `serviceAccountKey.json`
3. **Place it in project root:** `backendForWeHelp-main/serviceAccountKey.json`
4. Ye file already `.gitignore` me hai — kabhi commit mat karna

## Step 3: Start the Backend
```bash
npm run start:dev
```
Firebase automatically initialize hoga jab server start hoga.

Agar `serviceAccountKey.json` nahi milega to server warning dega lekin crash nahi karega — Google login kaam nahi karega but normal email/password login chalega.

## API Endpoint

**`POST /authentication/google-login`**

Body:
```json
{
  "idToken": "firebase-id-token-from-google-sign-in",
  "username": "optional_username"
}
```

Response:
```json
{
  "success": true,
  "access_token": "jwt-token",
  "user": { "_id": "...", "username": "...", "email": "...", "role": "user" }
}
```

## How It Works
```
Flutter App
  → Google Sign-In SDK → idToken
  → POST /authentication/google-login { idToken, username }
  → Backend Firebase Admin SDK se idToken verify karta hai
  → User DB me hai to direct login, nahi to naya user create (googleId save hota hai)
  → Normal JWT return (same as email/password wala token)
```

---

# FLUTTER PROMPT — Google Sign-In with Backend

> Yeh prompt Flutter AI Agent (ya Flutter developer) ko do — yeh unhe bataega ke kya implement karna hai.

```
FLUTTER FRONTEND — GOOGLE SIGN-IN IMPLEMENTATION
=================================================

You are a Flutter AI Agent tasked with implementing Google Sign-In for a volunteer coordination app called "WeHelp". The backend already has Firebase Admin SDK integration ready.

BACKEND ENDPOINT AVAILABLE:
===========================

POST /authentication/google-login
  - Body: { idToken: String, username: String? }
  - Headers: Content-Type: application/json
  - Returns: { success: Boolean, access_token: String, user: { _id, username, email, role } }
  - Note: username is optional (nullable)

WHAT TO IMPLEMENT:
===================

1. Add these packages to pubspec.yaml:
   - firebase_core (latest)
   - firebase_auth (latest)
   - google_sign_in (latest)
   - http (for REST API calls)

2. Firebase Project Setup:
   - Flutter app ko Firebase Console mein register karo (Android + iOS)
   - google-services.json android/app/ mein daalo
   - GoogleService-Info.plist iOS project mein add karo
   - Android: google-services plugin apply karo in build.gradle

3. Create AuthService class with:
   - signInWithGoogle() method:
     a. Google Sign-In SDK se sign in karo
     b. authentication.idToken le lo
     c. POST /authentication/google-login pe idToken + username bhejo
     d. Response se access_token save karo (SharedPreferences ya flutter_secure_storage)
     e. Return success status
   - signOut() method:
     a. Google sign out
     b. Firebase auth sign out
     c. Clear saved token

4. Important Configuration:
   - Android emulator me base URL: http://10.0.2.2:3000
   - iOS simulator me: http://localhost:3000
   - Real device pe same WiFi wala IP: http://192.168.x.x:3000
   - Android manifest me INTERNET permission aur usesCleartextTraffic="true" daalna
     agar HTTP use kar rahe ho

5. UI Integration:
   - Login page pe "Sign in with Google" button lagao
   - Button press pe AuthService.signInWithGoogle() call karo
   - Success pe access_token save karke home page navigate karo
   - Failure pe error message dikhao

FLOW:
User clicks "Sign in with Google"
  → Google Sign-In SDK opens account picker
  → User selects account → Google returns idToken
  → App sends idToken to POST /authentication/google-login
  → Backend verifies idToken with Firebase Admin SDK
  → Backend creates/logs in user → returns JWT access_token
  → App saves token → user is logged in

TIPS:
- Username optional hai — agar user pehle se exist karta hai to backend update nahi karega
- Wohi access_token baaki sab endpoints (chat, help-requests, etc.) ke liye use hoga
- Normal email/password login wala JWT aur Google login wala JWT same format me hai
```

--- 

# Troubleshooting

| Error | Solution |
|-------|----------|
| `serviceAccountKey.json not found` | Firebase console se download karo, project root mein rakho |
| `Invalid Firebase token` | Frontend se real Firebase idToken bhejo (test mat karo random string se) |
| `Firebase is not configured` | serviceAccountKey.json missing hai |
