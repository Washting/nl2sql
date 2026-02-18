
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

import { ThemeProvider } from "./components/ThemeProvider.tsx";
import { MetadataStoreProvider } from "./stores/metadata-store.tsx";

createRoot(document.getElementById("root")!).render(
  <ThemeProvider defaultTheme="dark" storageKey="nl2sql-ui-theme">
    <MetadataStoreProvider>
      <App />
    </MetadataStoreProvider>
  </ThemeProvider>
);
