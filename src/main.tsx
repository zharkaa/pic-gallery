import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter } from "react-router";
import { RouterProvider } from "react-router/dom";
import App from "./App.tsx";
import Layout from "./layout.tsx";
import "./index.css";
import LoginPage from "./pages/LoginPage.tsx"; // changed: was LoginForm (bare form, no max-width)
import PhotoPage from "./pages/PhotoPage.tsx";
import DashboardPage from "./pages/DashboardPage.tsx";

const router = createBrowserRouter([
  {
    path: "/",
    Component: Layout,
    children: [
      {
        path: "/",
        Component: App,
      },
      {
        path: "login",
        Component: LoginPage, // changed: was LoginForm, which stretched to full width
      },
      {
        path: "photo/:id", // new: photo detail page (image left, title/description right)
        Component: PhotoPage,
      },
      {
        path: "dashboard", // new: upload a photo and add its details
        Component: DashboardPage,
      },
    ],
  },
]);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
