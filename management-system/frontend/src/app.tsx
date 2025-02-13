import { NavBar, ToastContainer } from "@frontend/components";
import { beginPageNoRole } from "@frontend/helper";
import { Route, Router, type RouteSectionProps } from "npm:@solidjs/router";
import { type Component, Suspense } from "npm:solid-js";
import { render } from "npm:solid-js/web";
import { ActivityLogs } from "./routes/activity-log/index.tsx";
import { AuthReturn } from "./routes/auth-return.tsx";
import { DeviceEdit } from "./routes/devices/edit.tsx";
import { Devices } from "./routes/devices/index.tsx";
import { Home } from "./routes/index.tsx";
import { Login } from "./routes/login.tsx";
import { TagEdit } from "./routes/tags/edit.tsx";
import { Tags } from "./routes/tags/index.tsx";
import { TagNew } from "./routes/tags/new.tsx";
import { UserEdit } from "./routes/users/edit.tsx";
import { Users } from "./routes/users/index.tsx";
import { UserNew } from "./routes/users/new.tsx";

// deno-lint-ignore no-process-globals
const VERSION = process.env.VERSION;

function App() {
  const { toastService } = beginPageNoRole();

  const root: Component<RouteSectionProps> = (props) => (
    <div class="container">
      <NavBar version={VERSION ?? "unknown"} />
      <Suspense>{props.children}</Suspense>
      <ToastContainer onListen={toastService.setToastListener} onRemoveToast={toastService.removeToast} />
    </div>
  );

  return (
    <Router root={root}>
      <Route path="/" component={Home} />
      <Route path="/login" component={Login} />
      <Route path="/auth-return" component={AuthReturn} />

      <Route path="/users/" component={Users} />
      <Route path="/users/new" component={UserNew} />
      <Route path="/users/:id" component={UserEdit} />

      <Route path="/devices/" component={Devices} />
      <Route path="/devices/:id" component={DeviceEdit} />

      <Route path="/tags/" component={Tags} />
      <Route path="/tags/new" component={TagNew} />
      <Route path="/tags/:id" component={TagEdit} />

      <Route path="/activity-log/" component={ActivityLogs} />
    </Router>
  );
}

function main() {
  function invokeServiceWorkerUpdateFlow(registration: ServiceWorkerRegistration) {
    // TODO implement your own UI notification element
    if (confirm("New version of the app is available. Refresh now?")) {
      if (registration.waiting) {
        // let waiting Service Worker know it should became active
        registration.waiting.postMessage("SKIP_WAITING");
      }
    }
  }

  // check if the browser supports serviceWorker at all
  if ("serviceWorker" in navigator && globalThis.location.hostname !== "localhost") {
    // wait for the page to load
    globalThis.addEventListener("load", async () => {
      // register the service worker from the file specified
      const registration = await navigator.serviceWorker.register("/service-worker.js");

      // ensure the case when the updatefound event was missed is also handled
      // by re-invoking the prompt when there's a waiting Service Worker
      if (registration.waiting) {
        invokeServiceWorkerUpdateFlow(registration);
      }

      // detect Service Worker update available and wait for it to become installed
      registration.addEventListener("updatefound", () => {
        if (registration.installing) {
          // wait until the new Service worker is actually installed (ready to take over)
          registration.installing.addEventListener("statechange", () => {
            if (registration.waiting) {
              // if there's an existing controller (previous Service Worker), show the prompt
              if (navigator.serviceWorker.controller) {
                invokeServiceWorkerUpdateFlow(registration);
              } else {
                // otherwise it's the first install, nothing to do
                console.log("Service Worker initialized for the first time");
              }
            }
          });
        }
      });

      let refreshing = false;

      // detect controller change and refresh the page
      navigator.serviceWorker.addEventListener("controllerchange", () => {
        if (!refreshing) {
          globalThis.location.reload();
          refreshing = true;
        }
      });
    });
  }

  render(App, document.getElementById("app")!);
}

main();
