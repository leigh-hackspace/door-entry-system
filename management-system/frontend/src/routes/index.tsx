import { Button, Card, Tile } from "@frontend/components";
import { beginPage } from "@frontend/helper";
import { AppService } from "@frontend/lib";
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
          <Match when={user()?.role === "user"}>
            <UserDashboard />
          </Match>
        </Switch>
      </div>

      <div class="g-col-12 g-col-xl-6">
        <Switch>
          <Match when={user()?.role === "admin"}>
            <AdminControls />
          </Match>
        </Switch>
      </div>
    </main>
  );
}

function AdminControls() {
  const setLatch = (latch: boolean) => {
    AppService.get().tRPC.Stats.SetLatch.mutate(latch);
  };

  return (
    <Card colour="danger">
      <Card.Header text="Admin Controls" />
      <Card.Body>
        <p>Turning latch ON will disable the mag-lock and allow entry to all.</p>
        <p>Turning latch OFF will re-enable security and a RFID tag will be required for entry.</p>
        <Button colour="danger" on:click={() => setLatch(true)}>
          Latch On
        </Button>
        &nbsp;
        <Button colour="success" on:click={() => setLatch(false)}>
          Latch Off
        </Button>
      </Card.Body>
    </Card>
  );
}

function AdminDashboard() {
  const [stats] = createResource(() => AppService.get().tRPC.Stats.AdminStats.query({}));

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
                  href="/tags"
                  number={stats().tagCount}
                  text="Tags known"
                  colour="warning"
                  class="g-col-6 g-col-md-3 g-col-xl-6"
                />
                <Tile
                  href="/activity-log"
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
  const [stats] = createResource(() => AppService.get().tRPC.Stats.UserStats.query({}));

  return (
    <Card colour="primary">
      <Card.Header text="User Dashboard" />
      <Card.Body>
        <div class="d-flex gap-3 flex-column">
          <Show when={stats()}>
            {(stats) => (
              <div class="grid">
                <Tile
                  href="/tags"
                  number={stats().tagCount}
                  text="Tags owned"
                  colour="warning"
                  class="g-col-6 g-col-md-3 g-col-xl-6"
                />
                <Tile
                  href="/activity-log"
                  number={stats().scanCount}
                  text="Scans"
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
