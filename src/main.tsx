import { createRoot } from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import {
  loadThemeBeforeReveal,
  revealAppRoot,
  waitForClientStoresHydrated,
} from "@/lib/appBootstrap";
import App from "./App.tsx";
import "./index.css";

async function bootstrap() {
  await waitForClientStoresHydrated();
  await loadThemeBeforeReveal(queryClient);

  const rootEl = document.getElementById("root");
  if (!rootEl) return;

  createRoot(rootEl).render(
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>,
  );

  requestAnimationFrame(() => {
    revealAppRoot();
  });
}

void bootstrap();
