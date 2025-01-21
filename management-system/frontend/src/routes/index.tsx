import { Card, Tile } from "@frontend/components";
import { beginPage } from "@frontend/helper";
import { AppService } from "@frontend/lib";
import { useNavigate } from "npm:@solidjs/router";
import { createResource, Match, Show, Switch } from "npm:solid-js";

export function Home() {
  const { user } = beginPage(["admin", "user"]);

  return (
    <main class="grid gap-3">
      <div class="g-col-12 g-col-xl-6">
        <Switch>
          <Match when={user()?.role === "admin"}>
            <AdminDashboard />
          </Match>
        </Switch>
      </div>

      {/* <div class="g-col-12 g-col-xl-6">
        <UserDashboard />
      </div> */}
    </main>
  );
}

function AdminDashboard() {
  const navigate = useNavigate();

  const [stats] = createResource(() => AppService.get().tRPC.Stats.Stats.query({}));

  return (
    <Card colour="warning">
      <Card.Header text="Admin Dashboard" />
      <Card.Body>
        <div class="d-flex gap-3 flex-column">
          <Show when={stats()}>
            {(stats) => (
              <div class="grid">
                <Tile
                  href="/users"
                  number={stats().userCount}
                  text="Users registered"
                  colour="green"
                  class="g-col-6 g-col-md-3 g-col-xl-6"
                />
                <Tile
                  href="/users"
                  number={stats().scanCount}
                  text="Tags scanned"
                  colour="blue"
                  class="g-col-6 g-col-md-3 g-col-xl-6"
                />
              </div>
            )}
          </Show>
        </div>
      </Card.Body>
    </Card>
  );
}

function UserDashboard() {
  const navigate = useNavigate();

  return (
    <Card colour="primary">
      <Card.Header text="User Dashboard" />
      <Card.Body>
        <div class="d-flex gap-3 flex-column"></div>
      </Card.Body>
    </Card>
  );
}
