import { NavBar, ToastContainer } from "@frontend/components";
import { beginPageNoRole } from "@frontend/helper";
import { Route, Router, type RouteSectionProps } from "npm:@solidjs/router";
import { type Component, Suspense } from "npm:solid-js";
import { render } from "npm:solid-js/web";
import { ActivityLogs } from "./routes/activity-log/index.tsx";
import { AuthReturn } from "./routes/auth-return.tsx";
import { Home } from "./routes/index.tsx";
import { Login } from "./routes/login.tsx";
import { TagEdit } from "./routes/tags/edit.tsx";
import { Tags } from "./routes/tags/index.tsx";
import { TagNew } from "./routes/tags/new.tsx";
import { UserEdit } from "./routes/users/edit.tsx";
import { Users } from "./routes/users/index.tsx";
import { UserNew } from "./routes/users/new.tsx";

function App() {
  const { toastService } = beginPageNoRole();

  const root: Component<RouteSectionProps> = (props) => (
    <div class="container">
      <NavBar />
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

      <Route path="/tags/" component={Tags} />
      <Route path="/tags/new" component={TagNew} />
      <Route path="/tags/:id" component={TagEdit} />

      <Route path="/activity-log/" component={ActivityLogs} />
    </Router>
  );
}

render(App, document.getElementById("app")!);
