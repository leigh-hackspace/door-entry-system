import { AppService } from "@frontend/services";
import { useNavigate } from "@solidjs/router";
import { createSignal, Show } from "solid-js";
import { onCleanup, onMount } from "solid-js";
import { Button } from "../Button/index.tsx";

interface Props {
  version: string;
}

export function NavBar(props: Props) {
  const user = () => AppService.get().getCurrentUser();

  const navigate = useNavigate();

  const [expanded, setExpanded] = createSignal(false);

  const linkClick = (e: MouseEvent) => {
    if (e.target instanceof HTMLElement && e.target.tagName === "A") {
      setExpanded(false);
    }
  };

  onMount(() => {
    document.querySelector("nav")?.addEventListener("click", linkClick);
  });
  onCleanup(() => {
    document.querySelector("nav")?.removeEventListener("click", linkClick);
  });

  const onToggle = () => {
    setExpanded(!expanded());
  };

  const onLogout = () => {
    AppService.get().logout();
    navigate("/login");
  };

  return (
    <nav class="navbar navbar-expand-lg">
      <div class="container-fluid">
        <a class="navbar-brand" href="/">
          Doors (v{props.version})
        </a>

        <button class="navbar-toggler" type="button" aria-label="Toggle navigation" on:click={onToggle}>
          <span class="navbar-toggler-icon"></span>
        </button>

        <div classList={{ collapse: true, "navbar-collapse": true, show: expanded() }}>
          <ul class="navbar-nav me-auto mb-2 mb-lg-0">
            <li class="nav-item">
              <a class="nav-link active" href="/">
                🖥 Dashboard
              </a>
            </li>

            <Show when={user()?.role === "admin"}>
              <li class="nav-item">
                <a class="nav-link active" href="/users">
                  👤 Users
                </a>
              </li>

              <li class="nav-item">
                <a class="nav-link active" href="/devices">
                  📟 Devices
                </a>
              </li>
            </Show>

            <li class="nav-item">
              <a class="nav-link active" href="/tags">
                🪪 Tags
              </a>
            </li>

            <li class="nav-item">
              <a class="nav-link active" href="/activity-log">
                🪵 Logs
              </a>
            </li>
          </ul>

          <Show when={user()}>
            {(user) => (
              <div class="d-flex gap-1 align-items-center">
                <Show when={user().role === "admin"}>
                  <div class="badge text-bg-warning">{user().role}</div>
                </Show>

                <div>Welcome {user().name}!</div>

                <Button colour="secondary" on:click={onLogout}>
                  Logout
                </Button>
              </div>
            )}
          </Show>
        </div>
      </div>
    </nav>
  );
}
