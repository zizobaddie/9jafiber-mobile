import React from "react";
import ReactDOM from "react-dom/client";
import { ChakraProvider } from "@chakra-ui/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import App, { handleLogout } from "./App";

const qc = new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: true, networkMode: "always" }, mutations: { networkMode: "always" } } });

if (!handleLogout()) ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ChakraProvider>
      <QueryClientProvider client={qc}>
        <App />
      </QueryClientProvider>
    </ChakraProvider>
  </React.StrictMode>
);
