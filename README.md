# Mapping Cemetery App

A React Native Expo Go app for mapping locations in Agnipa, Romblon, Philippines.

## Features

- Interactive map centered on Agnipa
- Real-time user location display
- Markers for local places of interest
- Search bar to filter locations
- Navigation to places using Google Maps

## Setup Instructions

### Prerequisites

1. Install Node.js (version 14 or later) from [nodejs.org](https://nodejs.org/).
2. Install Expo CLI globally: `npm install -g @expo/cli`
3. Install the Expo Go app on your mobile device from the App Store (iOS) or Google Play Store (Android).

### Installation

1. Clone or download this project to your local machine.
2. Open a terminal and navigate to the project directory.
3. Install dependencies: `npm install`

### Running the App

1. Start the Expo development server: `npx expo start`
2. Scan the QR code with the Expo Go app on your phone, or press 'a' for Android emulator, 'i' for iOS simulator (requires macOS).

### Permissions

The app requires location permissions to show your current position on the map. Grant permissions when prompted.

### Notes

- The map uses default map tiles. For production, consider adding a Google Maps API key for better performance.
- Navigation opens Google Maps in your device's browser or app.
- Coordinates are approximate; adjust as needed for accuracy.

## Technologies Used

- React Native
- Expo
- react-native-maps
- expo-location

## Run in Chrome (not localhost)

1. Install dependencies (if you haven't):

	```bash
	npm install
	```

2. Build the web bundle (outputs to `web-build`):

	```bash
	npm run build:web
	```

3. Serve the static build bound to all interfaces (0.0.0.0) on port 5000:

	```bash
	npm run serve:web
	```

4. Find your machine's local IP (Windows): run `ipconfig` and look for the `IPv4 Address`.

5. Open Chrome and visit `http://<YOUR_LOCAL_IP>:5000` (for example `http://192.168.1.42:5000`).

Notes:
- Binding to `0.0.0.0` makes the site reachable via your LAN IP (not `localhost`).
- For a public URL, use a tunneling tool such as `ngrok` or `localtunnel`.

## Progressive Web App (PWA)

This project includes basic PWA support: a `manifest.json` and a simple `service-worker.js`.

1. Build the web bundle (this runs a post-build script that installs PWA files):

	```bash
	npm run build:web
	```

2. Serve the output and open it in Chrome (or another browser):

	```bash
	npm run serve:web
	```

3. To test PWA behavior, open DevTools > Application and check the Service Worker and Manifest. Install prompt appears in supported browsers.

Notes:
- The postbuild script copies `web/manifest.json` and `web/service-worker.js` into `web-build/` and injects a small SW registration snippet into `web-build/index.html`.
- The service worker here is a minimal cache-first example. For production, consider using Workbox and a stricter caching strategy.

## Deploying the PWA (Vercel or Netlify)

Both Vercel and Netlify provide automatic HTTPS for deployed sites. Choose one of the options below.

Vercel (recommended for quick Git-based deploys):

1. Commit your repo and push to GitHub.
2. Install the Vercel CLI locally (optional) and login:

	```bash
	npm install -g vercel    # optional, or use the devDependency script
	vercel login
	```

3. Deploy (from project root):

	```bash
	npm run build:web
	npm run deploy:vercel
	```

Netlify:

1. Commit and push to GitHub.
2. In Netlify UI, connect your repository and set the build command to `npm run build:web` and publish directory to `web-build`.
3. Or deploy using the CLI:

	```bash
	npm install -g netlify-cli   # optional
	npm run build:web
	npm run deploy:netlify
	```

Notes:
- After deployment, both platforms provide HTTPS by default (no extra configuration needed).
- For custom domains, add the domain in the platform dashboard and follow their DNS instructions (they will provision TLS automatically).