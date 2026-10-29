# 🚀 Biometric Cloud Hub (aaPanel Deployment)

## 📌 aaPanel Setup Steps (2 Minutes)

### Step 1: aaPanel me Node Project Add Karein
1. aaPanel login karein: `http://156.67.111.84:35192/`
2. Left menu me **Website** ➔ **Node project** (ya **Node.js version manager** / **PM2**) me jayein.
3. **Add Node project** par click karein:
   - **Path:** `/www/wwwroot/biometric` (ya koi bhi folder)
   - **Run script:** `server.js`
   - **Port:** `5004`
   - **Project Name:** `biometric-hub`
4. Is folder me `server.js` aur `package.json` upload kar dein.
5. **Start** button dabayein!

---

### Step 2: aaPanel Firewall me Port Kholein
1. aaPanel me Left Menu me **Security** (Firewall) me jayein.
2. Port me daalein: **`5004`** (Protocol: TCP).
3. **Add** / **Accept** par click karein taaki machine connect ho sake.

---

### Step 3: Biometric Machine me Settings Daalein

Machine ke screen par:
* **Server-Client Mode:** `FkWeb`
* **Web Server URL:** `http://156.67.111.84:5004`
* **TCP Port:** `5004`
* **Save (`[M/OK]`)** karke machine restart karein.

---

### Step 4: Live Check
1. Browser me kholein: **`http://156.67.111.84:5004/`**
   - Yahan live status **🟢 ONLINE** dikhega.
2. Machine par finger/face punch karein:
   - Punch turant screen par aayega aur automatically Hostinger (`qunatum.mybhiwani.in`) par chala jayega!
