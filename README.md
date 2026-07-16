# Ausgegeben

**Ausgegeben** (*German for “spent”*) is a personal finance app for Android and the web, with shared Firebase Auth + Firestore sync.

**Live Web App:** [aus01.web.app](https://aus01.web.app)

---

## Technical Philosophy & Architecture

This project serves as a showcase of modern software engineering practices, moving beyond basic CRUD to implement robust architectural patterns:

### Android: Modern Native Development
*   **Architecture:** Adheres to **Clean Architecture** principles using **MVVM (Model-View-ViewModel)**. Data flow is managed via **Kotlin Coroutines** and **Flow**, ensuring a reactive and lifecycle-aware UI.
*   **UI Framework:** 100% **Jetpack Compose** with a custom design system based on **Material 3**, featuring dynamic theming (10+ modes) and optimized layouts.
*   **Data Strategy:** An **Offline-First** approach using **Room SQLite** for local persistence and **DataStore** for preferences. Data synchronization with **Firebase Firestore** is handled gracefully, managing optimistic updates and conflict resolution.
*   **Efficiency:** Utilizes **Paging 3** for handling large transaction histories with zero UI jank and **WorkManager** for reliable background scheduling of daily reminders.

### Web: High-Performance PWA
*   **Framework:** Built with **React 19** and **TypeScript**, leveraging **Vite** for an optimized build pipeline.
*   **State & Persistence:** In-memory **Zustand** for UI state; expenses and preferences live in **Cloud Firestore** (online). Auth session is handled by the Firebase SDK.
*   **PWA:** Installable Progressive Web App (static shell caching only — not an offline data store).

---

## Features at a Glance

| Pillar | Implementation Details |
|------|---------|
| **Core Accounting** | Multi-type transactions (Expense, Income, Transfer) with metadata and categories. |
| **Financial Intelligence** | Real-time balance tracking, budget monitoring, and trend analysis for varied time periods. |
| **User Agency** | Full CRUD capabilities for custom categories with a curated icon/color library. |
| **Cloud Ecosystem** | Secure **Firebase Auth** integration. Data is encrypted in transit and isolated per user via Firestore Security Rules. |
| **Data Portability** | Native CSV export functionality implemented on both platforms to prevent vendor lock-in. |

---

## Project Structure

The repository is organized to maintain a clear separation of concerns across the stack:

```
ausgegeben/
├── app/                    # Android: Kotlin, Compose, WorkManager
├── web/                    # Web PWA: React, TS, Vite
├── firebase.json           # Cloud Configuration: Hosting & Firestore Rules
├── firestore.rules         # Security: Fine-grained access control
└── scripts/                # DevOps: CI/CD and maintenance utilities
```

---

## Development Environment

### Android
*   **Tooling:** Android Studio Ladybug+
*   **Stack:** Kotlin 2.2, AGP 9.2, KSP, Compose BOM 2024.09
*   **Setup:** Requires `google-services.json` in the `app/` directory and JDK 17.

### Web
*   **Stack:** Node.js 20+, React 19, TypeScript
*   **Deployment:** Automated via Firebase CLI.

---

## Quality Assurance

The project maintains stability through:
*   **Static Analysis:** Strict Kotlin and TypeScript configurations.
*   **Automated Testing:** JUnit for Android business logic and build-time type checking for the web frontend.
*   **Privacy:** No third-party analytics. User data ownership is absolute.

---

## Author

**[Shareef](https://github.com/shareef01)** — Full Stack Android Developer
[Portfolio / GitHub](https://github.com/shareef01)
