# Firebase Setup Guide - Fastest Finger First Quiz

## Current Status
✅ Firebase config is present in `.env`  
✅ Authentication is configured  
❌ **Firestore needs to be enabled and configured**

## Step-by-Step Setup

### 1. Enable Firestore Database
1. Go to https://console.firebase.google.com
2. Select your project: **quiz-app-295a4**
3. In left menu → **Firestore Database**
4. If not already enabled, click **Create database**
5. Choose:
   - **Start in test mode** (for development - expires in 30 days)
   - Select a location (e.g., us-central)
   - Click **Enable**

### 2. Configure Firestore Security Rules (CRITICAL!)

Go to **Firestore Database → Rules** tab and replace with:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    
    // Helper function to check if user is admin
    function isAdmin() {
      return request.auth != null && request.auth.uid == 'QaaAbC8pSAcM0xbPtMYWW96l61x1';
    }
    
    // Helper to check if user is authenticated
    function isSignedIn() {
      return request.auth != null;
    }
    
    // Quizzes collection - only admin can write
    match /quizzes/{quizId} {
      allow read: if true;
      allow create, update, delete: if isAdmin();
    }
    
    // Live sessions - admin controls, participants can submit answers
    match /liveSession/{sessionId} {
      allow read: if true;
      allow create: if isAdmin();
      
      // Admin can update anything
      allow update: if isAdmin();
      
      // Participants can only update their own response
      allow update: if isSignedIn() && 
        request.resource.data.diff(resource.data).affectedKeys()
          .hasOnly(['responses']) &&
        request.resource.data.responses.diff(resource.data.responses)
          .affectedKeys().hasOnly([request.auth.uid]);
    }
    
    // Users collection (if you create it)
    match /users/{userId} {
      allow read: if true;
      allow write: if isSignedIn() && request.auth.uid == userId;
    }
  }
}
```

Click **Publish** to save the rules.

### 3. Test Firestore Connection

After setting up rules:

1. Open http://localhost:3000 in your browser
2. Open DevTools Console (F12)
3. Run this command:

```javascript
// Test write
firebase.firestore().collection('test').add({ timestamp: new Date(), test: true })
  .then(doc => console.log('✅ Firestore WRITE works! Doc ID:', doc.id))
  .catch(err => console.error('❌ Firestore WRITE failed:', err.message));

// Test read
firebase.firestore().collection('test').limit(1).get()
  .then(snap => console.log('✅ Firestore READ works! Docs:', snap.size))
  .catch(err => console.error('❌ Firestore READ failed:', err.message));
```

**Expected Output:**
- ✅ Firestore WRITE works! Doc ID: [some-id]
- ✅ Firestore READ works! Docs: 1

**If you see errors:**
- `Missing or insufficient permissions` → Rules not published correctly
- `Cannot reach Firestore backend` → Network/firewall issue
- `PERMISSION_DENIED` → Rules are blocking (use test mode temporarily)

### 4. Verify Admin UID

In `FastestFingerSingle.jsx`, the admin UID is:
```javascript
const ADMIN_UID = 'REPLACE_WITH_YOUR_ADMIN_UID';
```

**Change this to match your `.env` value:**
```javascript
const ADMIN_UID = 'QaaAbC8pSAcM0xbPtMYWW96l61x1';
```

OR read it from env automatically (already implemented):
```javascript
const ADMIN_UID = (window.__env && window.__env.ADMIN_UID) || 'REPLACE_WITH_YOUR_ADMIN_UID';
```

### 5. Test Live Session Flow

After completing steps 1-4:

**As Admin:**
1. Sign in with `admin@quiz.com` / `admin@qwaszx`
2. Create a quiz
3. Select quiz → Create Live Session
4. Check console for errors
5. Check Firestore console → you should see `liveSession` collection with a new document

**Common Issues:**

| Error | Solution |
|-------|----------|
| "Missing or insufficient permissions" | Update Firestore rules (step 2) |
| "Admin dashboard not showing" | Fix ADMIN_UID constant (step 4) |
| "Quiz save hangs" | Check auth state in console: `firebase.auth().currentUser` |
| "Session created but participant can't join" | Check participant is signed in and auto-discovery is enabled |

### 6. Development vs Production Rules

**Current rules (above) are for DEVELOPMENT.**

For **production**, you should:
1. Remove `allow read: if true;` and add proper read restrictions
2. Add rate limiting
3. Validate data structure in rules
4. Use Cloud Functions to validate admin status server-side

**Production-ready rules example:**
```
match /liveSession/{sessionId} {
  allow read: if isSignedIn();
  allow create: if isAdmin() && validLiveSession(request.resource.data);
  allow update: if isAdmin() || canUpdateResponse();
  
  function validLiveSession(data) {
    return data.keys().hasAll(['quizId', 'status', 'currentQuestionIndex', 'responses', 'questionStartTimes'])
      && data.status in ['waiting', 'active', 'finished']
      && data.currentQuestionIndex is int;
  }
  
  function canUpdateResponse() {
    let affected = request.resource.data.diff(resource.data).affectedKeys();
    return isSignedIn() 
      && affected.hasOnly(['responses'])
      && onlyUpdatingOwnResponse();
  }
  
  function onlyUpdatingOwnResponse() {
    let responseDiff = request.resource.data.responses.diff(resource.data.responses);
    let changedQuestions = responseDiff.affectedKeys();
    return changedQuestions.size() == 1 
      && responseDiff[changedQuestions[0]].affectedKeys().hasOnly([request.auth.uid]);
  }
}
```

## Quick Debug Checklist

- [ ] Firestore enabled in Firebase Console
- [ ] Rules published (not just saved)
- [ ] ADMIN_UID matches your actual admin user UID
- [ ] Signed in as admin (check `firebase.auth().currentUser.uid`)
- [ ] No console errors about permissions
- [ ] Browser cache cleared (Ctrl+Shift+R)
- [ ] Server running (`npm start`)

## Still Getting PERMISSION DENIED After Updating Rules?

### Quick Fixes (Try These First):

**1. Verify Rules Are PUBLISHED (Not Just Saved)**
- Go to Firebase Console → Firestore Database → Rules
- Look for "Last published" timestamp at the top
- If it says "Not published" or is old, click **PUBLISH** button (blue button, top right)
- Wait 2 minutes after publishing

**2. Use Test Mode Temporarily**
If you want to bypass rules temporarily to test:
```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if request.time < timestamp.date(2025, 11, 8);
    }
  }
}
```
⚠️ This allows anyone to read/write until Nov 8, 2025. **Use only for testing!**

**3. Verify Your Admin UID**

Open browser console on http://localhost:3000 and run:
```javascript
// After signing in as admin@quiz.com
firebase.auth().currentUser.uid
```

Compare this with what's in your `.env` file:
```
ADMIN_UID=QaaAbC8pSAcM0xbPtMYWW96l61x1
```

They **MUST** match exactly. If they don't:
1. Copy the UID from Firebase Console → Authentication → Users → admin@quiz.com
2. Update `.env` file
3. Restart server: `taskkill /F /IM node.exe ; npm start`

**4. Clear Browser Cache**
- Press Ctrl+Shift+Delete
- Select "Cached images and files"
- Clear
- Refresh page (Ctrl+F5)

**5. Sign Out and Back In**
- Click "Sign Out" in the app
- Close all tabs with localhost:3000
- Open new tab, go to http://localhost:3000
- Sign in again with admin@quiz.com / admin@qwaszx

### Diagnostic Test Page

I've created a test page that will show you exactly what's failing:

**Open:** http://localhost:3000/test_firebase.html

This will:
- Sign in as admin automatically
- Test write permissions for all collections
- Show you the exact error codes and messages
- Verify your admin UID matches

### Common Root Causes:

| Symptom | Root Cause | Solution |
|---------|------------|----------|
| PERMISSION_DENIED after updating rules | Rules not published | Click PUBLISH in Firebase Console (not just Ctrl+S) |
| Works for some collections but not others | Rules syntax error | Copy exact rules from `firestore.rules` file |
| Admin UID mismatch in console | Wrong UID in .env or rules | Get UID from Firebase Console → Auth → Users |
| Rules published but still denied | Browser cache | Clear cache + hard refresh (Ctrl+Shift+F5) |
| "Missing or insufficient permissions" | Firestore not enabled | Enable Firestore Database in Firebase Console |
| Works in test mode but not with rules | Rules logic error | Use test mode first, then gradually add restrictions |

### Debug Command for Browser Console:

Run this in console to dump all diagnostic info:
```javascript
(async function() {
  console.log('=== FIREBASE DIAGNOSTICS ===');
  console.log('Project ID:', firebase.app().options.projectId);
  console.log('Auth Domain:', firebase.app().options.authDomain);
  console.log('\n=== AUTHENTICATION ===');
  console.log('Current User:', firebase.auth().currentUser);
  console.log('User Email:', firebase.auth().currentUser?.email);
  console.log('User UID:', firebase.auth().currentUser?.uid);
  console.log('Admin UID from env:', window.__env.ADMIN_UID);
  console.log('UIDs Match?', firebase.auth().currentUser?.uid === window.__env.ADMIN_UID);
  
  console.log('\n=== FIRESTORE TEST ===');
  try {
    const testDoc = await firebase.firestore().collection('test').add({
      test: true,
      timestamp: firebase.firestore.FieldValue.serverTimestamp()
    });
    console.log('✅ Write test PASSED. Doc ID:', testDoc.id);
    await firebase.firestore().collection('test').doc(testDoc.id).delete();
    console.log('✅ Delete test PASSED');
  } catch (e) {
    console.error('❌ Firestore test FAILED:', e.code, e.message);
  }
  
  console.log('\n=== POSSIBLE ISSUES ===');
  if (!firebase.auth().currentUser) {
    console.error('❌ Not signed in!');
  }
  if (firebase.auth().currentUser?.uid !== window.__env.ADMIN_UID) {
    console.error('❌ UID mismatch! Expected:', window.__env.ADMIN_UID, 'Got:', firebase.auth().currentUser?.uid);
  }
})();
```

### Contact Firebase Support

If none of the above works, the issue might be with your Firebase project settings:
1. Go to Firebase Console → Project Settings
2. Check "Service Accounts" tab
3. Verify Cloud Firestore is enabled
4. Check "Usage and billing" for any quota issues
