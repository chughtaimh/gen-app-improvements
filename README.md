# UX Evaluation Agent

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Next.js](https://img.shields.io/badge/Next.js-15-black)](https://nextjs.org/)
[![Firebase](https://img.shields.io/badge/Firebase-Auth%20%26%20Firestore-orange)](https://firebase.google.com/)

## 🚀 Project Overview

The **UX Evaluation Agent** is an autonomous AI system designed to act as a virtual "Product Manager". It navigates user-submitted web applications, analyzes the User Experience (UX), and generates actionable, professional-grade product reports.

By combining headless browser automation (**Playwright**) with multimodal AI (**Gemini 1.5 Pro**), the agent can see, interact with, and critique a product just like a human expert would—but in seconds, not weeks.

---

## ✨ Key Features

### 🧠 Autonomous UX Analysis
*   **"Infer then Evaluate" Strategy**: The AI first infers the product's intent and target audience from visual cues, then adopts a specific persona (e.g., "Senior Product Manager") to evaluate the journey.
*   **Multimodal Logic**: Analyzes full-session video recordings and screenshots to understand flow, visual hierarchy, and aesthetics.

### 🕵️‍♂️ The Browser Agent
*   **Smart Navigation**: Intelligently clicks links, interacts with menus, and explores the site.
*   **Smart Scroll**: Simulates natural reading behavior to trigger lazy-loaded content.
*   **Robustness**: Handles 404s, timeouts, and captures network errors and console logs.
*   **Accessibility Audit**: Integrated `axe-core` testing to automatically flag WCAG violations.

### 💎 Premium SaaS Architecture
*   **Identity-First**: Secure authentication via Firebase (Google/Email).
*   **Project Management**: Dashboard to track run history and status.
*   **Credit System**: Built-in infrastructure for freemium/subscription models (User credits & plan limits).
*   **Modern UI**: Aurora-style dark mode design with glassmorphism effects, built with lightweight **Vanilla CSS**.

---

## 🛠️ Technology Stack

*   **Frontend**: Next.js (App Router), React 19
*   **Styling**: Pure Semantic CSS (No frameworks, high performance)
*   **Backend / Database**: Firebase Firestore (Realtime), Firebase Authentication
*   **Agent Automation**: Playwright (Headless Chromium)
*   **AI Model**: Google Gemini 1.5 Pro
*   **Worker Service**: Node.js background worker (Decoupled architecture)

---

## 🏁 Getting Started

### Prerequisites
*   Node.js 18+
*   A Firebase Project (Firestore & Auth enabled)
*   A Google Cloud Project with Gemini API enabled

### 1. Installation
Clone the repo and install dependencies:
```bash
git clone https://github.com/your-username/ux-agent.git
cd ux-agent
npm install
```

### 2. Environment Setup
Create a `.env.local` file in the root directory:
```env
# Firebase Configuration
NEXT_PUBLIC_FIREBASE_API_KEY=your_api_key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_project_id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your_bucket.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
NEXT_PUBLIC_FIREBASE_APP_ID=your_app_id

# AI Configuration
GEMINI_API_KEY=your_gemini_api_key
```

### 3. Running the Application
You need two terminal processes running simultaneously:

**Terminal 1: Frontend**
```bash
npm run dev
# Opens http://localhost:3000
```

**Terminal 2: Worker Service** (Process the queue)
```bash
npm run worker
```

### 4. Running an Evaluation
1.  Go to `localhost:3000` and sign in.
2.  Click **"New Evaluation"**.
3.  Enter a URL (e.g., `https://example.com`).
4.  Watch the status update in real-time as the agent navigates and analyzes!

---

## 📂 Project Structure

```
├── src
│   ├── app              # Next.js App Router (Frontend Pages)
│   ├── agent            # The Core Brains
│   │   ├── browser.js   # Playwright automation logic
│   │   └── analyst.js   # Gemini AI integration
│   ├── workers          # Background Service
│   │   └── run-worker.js # Main worker entry point
│   ├── components       # React UI Components
│   └── lib              # Firebase & Utils
├── public
│   └── artifacts        # Stored screenshots/videos (Local dev)
└── requirements.md      # Detailed PRD
```

## 📜 License
MIT License
