# ⚡ Quick Deploy to Vercel - 5 Minutes

## 🎯 Prerequisites
- GitHub account
- Vercel account (sign up with GitHub)
- Your `.env` file values handy

---

## 🚀 Deploy in 5 Steps

### 1️⃣ **Push to GitHub** (2 min)

```powershell
cd "d:\New folder\FFF"
git init
git add .
git commit -m "Initial commit"
```

Then use **GitHub Desktop** or create a repo on GitHub and push.

---

### 2️⃣ **Import to Vercel** (1 min)

1. Go to https://vercel.com/new
2. Click **"Import Git Repository"**
3. Select your `fastest-finger-quiz` repo
4. Click **"Import"**

---

### 3️⃣ **Add Environment Variables** (1 min)

In Vercel import screen, add these 7 variables from your `.env` file:

```
FIREBASE_API_KEY=AIzaSyC1PrGOpXlvmLVe4zFPprKIGyML6JwS8k0
FIREBASE_AUTH_DOMAIN=quiz-app-295a4.firebaseapp.com
FIREBASE_PROJECT_ID=quiz-app-295a4
FIREBASE_STORAGE_BUCKET=quiz-app-295a4.firebasestorage.app
FIREBASE_MESSAGING_SENDER_ID=615953975199
FIREBASE_APP_ID=1:615953975199:web:fcc1024709dee6d0e21faa
ADMIN_UID=QaaAbC8pSAcM0xbPtMYWW96l61x1
```

---

### 4️⃣ **Deploy** (1 min)

Click **"Deploy"** button and wait ~1 minute.

---

### 5️⃣ **Add Vercel Domain to Firebase** (30 sec)

1. Go to Firebase Console: https://console.firebase.google.com/project/quiz-app-295a4/authentication/settings
2. Under "Authorized domains", click **"Add domain"**
3. Add: `your-project-name.vercel.app`
4. Click **"Add"**

---

## ✅ Done!

Your app is live at: `https://your-project-name.vercel.app`

---

## 🐛 If Something Breaks:

**"Cannot GET /"**
- Check Vercel logs
- Verify `vercel.json` exists

**Firebase Errors**
- Verify all 7 env variables are set in Vercel
- Check Firebase authorized domains

**Admin Not Working**
- Verify `ADMIN_UID` matches your Firebase user UID

---

**For detailed troubleshooting, see `DEPLOY_TO_VERCEL.md`**
