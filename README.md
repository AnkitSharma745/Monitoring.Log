# Monitoring.Log

A robust, production-ready Electron application template built with [electron-vite](https://electron-vite.org/), React, and TypeScript. This repository is configured with advanced logging, strict code quality checks, and a scalable, modular architecture.

## 🚀 Features

- **Modern Stack**: Built with Electron, Vite, React, and TypeScript.
- **Advanced Logging Engine**: Pre-configured `winston` logging with daily rotation, separating human-readable application logs (`appLogger`) and structured JSON logs (`jsonLogger`).
- **Type-Safe IPC**: Secure and strongly-typed Inter-Process Communication between the Main and Renderer processes via Electron Context Bridge.
- **Strict Code Quality**: Integrated ESLint, Prettier, and comprehensive TypeScript compiler checks.
- **Git Hooks**: Pre-commit hooks managed via Husky and `lint-staged` to enforce formatting and linting automatically.
- **Custom Build Configurations**: Optimized build pipelines with customized entry points (e.g., `mainProcess.ts`).

---

## 📋 Prerequisites

Before you begin, ensure you have the following installed:

- **Node.js** (v18 or higher recommended)
- **npm** or **pnpm** (both are supported, but `pnpm` is highly recommended for faster dependency resolution)

---

## 🛠️ Installation & Setup

1. **Clone the repository**

   ```bash
   git clone https://github.com/ankitsharma745/Monitoring.Log.git
   cd Monitoring.Log
   ```

2. **Install dependencies**

   ```bash
   npm install
   # or
   pnpm install
   ```

3. **Start the development server**
   ```bash
   npm run dev
   ```
   This command starts the Vite development server for the React renderer, compiles the main and preload scripts, and launches the Electron shell with Hot Module Replacement (HMR).

---

## 💻 Available Commands

| Command             | Description                                                               |
| :------------------ | :------------------------------------------------------------------------ |
| `npm run dev`       | Starts the app in development mode with live reloading and HMR.           |
| `npm run build`     | Compiles the TypeScript code and builds the app for production.           |
| `npm run start`     | Previews the built production application locally.                        |
| `npm run lint`      | Runs ESLint across the codebase to catch potential errors.                |
| `npm run format`    | Runs Prettier to format all supported files automatically.                |
| `npm run typecheck` | Validates TypeScript definitions for both Node (main) and Web (renderer). |
| `npm run build:win` | Builds the standalone executable application for Windows.                 |

---

## 🏗️ Project Structure

```text
├── build/                  # Application icons and electron-builder resources
├── src/
│   ├── main/               # Electron main process (Entry: mainProcess.ts)
│   │   ├── logging/        # Winston logger configurations and manager
│   │   └── utils/          # Main process utilities and constants
│   ├── preload/            # Context Bridge exposure scripts (preload.ts)
│   └── renderer/           # React application source code
├── electron.vite.config.ts # Vite build configuration for all three processes
├── eslint.config.mjs       # Strict ESLint configuration
├── .prettierrc.yaml        # Prettier code formatting rules
└── tsconfig.*.json         # Segregated TypeScript configs (Node & Web)
```

---

## 🛡️ Coding Guidelines & Rules

To maintain high code quality and consistency in this public repository, please adhere to the following rules:

1. **Linting and Formatting**:
   - All code must pass `eslint` and `prettier` checks.
   - It is recommended to configure your IDE to "Format on Save" using Prettier.
   - Run `npm run lint` and `npm run format` before pushing changes.

2. **Pre-Commit Hooks (Husky)**:
   - Husky is configured to execute `lint-staged`.
   - Whenever you commit code, it will automatically be linted and formatted. Your commit will be blocked if there are unresolvable linting or syntax errors.

3. **Type Safety**:
   - Explicit types or interfaces should be used across all components. Avoid using `any` wherever possible.
   - Always run `npm run typecheck` to ensure no TypeScript compilation errors exist before creating a Pull Request.

4. **Imports and Architecture**:
   - We utilize the "Barrel Pattern" (`index.ts` re-exports) within internal modules (like `src/main/logging/`) for clean encapsulation and single-point-of-entry imports.
   - Ensure imports are clean and leverage alias resolutions (`@main/`, `@renderer/`, `@preload/`) when configuring deep directory references.

---

## 📄 License

This project is licensed under the MIT License.
