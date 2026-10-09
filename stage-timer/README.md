# Stage Timer

Electron desktop app (Windows `.exe` installer + macOS `.dmg`) and a small backend for sign-up e-mails.

## 1. Backend (needed for Sign Up / Sign In / Feedback / Update notices)
The app itself runs fully offline. Only sign-up, sign-in, feedback and update checks need internet.
Passwords/SMTP credentials must never be inside the app, so they live on this tiny server.
```
cd server && npm install
cp .env.example .env     # fill in GMAIL_APP_PASSWORD (Google Account > Security > App passwords), ADMIN_KEY
npm start                # deploy anywhere that runs Node: Render, Railway, Fly.io, a VPS...
```
* Sign-up flow: Full name + Email -> 6-digit code e-mailed to the user (proves the e-mail is real; works with Gmail, iCloud, Outlook, any provider) -> verified.
* On every new verified sign-up an e-mail is sent to **mystagetimer@gmail.com** (name, email, language, OS, version).
* Full customer list: `https://YOUR-SERVER/admin/users.csv?key=ADMIN_KEY`
* Feedback from the app arrives at mystagetimer@gmail.com (reply goes straight to the user).
* Announce an update: edit `LATEST_VERSION`, `DOWNLOAD_URL`, `RELEASE_NOTES` in `.env`, restart. Users see it in the Updates tab.
* Gmail limits ~500 mails/day; switch `nodemailer` to Resend / SendGrid / Brevo if you grow.

## 2. Build the installers
Requires Node 18+ (https://nodejs.org).
```
npm install
npm run fonts            # downloads Poppins, Montserrat, Bebas Neue, Outfit, Figtree (all SIL OFL, free to bundle)
# edit config.js -> API_BASE = your deployed server URL
# put a 1024x1024 build/icon.png (electron-builder makes .ico/.icns from it)
npm start                # test
npm run dist:win         # on Windows  -> dist/Stage Timer Setup 1.0.0.exe
npm run dist:mac         # on a Mac    -> dist/Stage Timer-1.0.0.dmg   (a Mac build can only be made on a Mac)
```
Unsigned apps trigger Windows SmartScreen / macOS Gatekeeper warnings. For public release buy a code-signing certificate
(Windows) and an Apple Developer ID + notarization (macOS).

## 3. Output (HDMI / NDI / OBS)
* **HDMI**: Timer tab -> choose the display -> Open output. One display = window, two displays = fullscreen on the chosen one (Esc closes).
* **NDI / OBS / vMix**: add a Browser Source at `http://127.0.0.1:4777/output.html` (1920x1080), or capture the output window with NDI Screen Capture.
  Native NDI needs NewTek's licensed SDK, so it is not bundled.

## Notes
* "Stage Timer" and "TIME UP" are never translated. Translations were machine-written: have native speakers review.
* Fonts: interface = Poppins. Output default list = Poppins, Montserrat, Bebas Neue, Outfit (Nexa-style), Figtree (Gotham-style).
  Gotham and Nexa are commercial/personal-use fonts and cannot be bundled; if you own them they appear in the installed-fonts list and can be added (up to 20).
