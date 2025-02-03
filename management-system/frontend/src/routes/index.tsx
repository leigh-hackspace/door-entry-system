import { Button, Card, Tile } from "@frontend/components";
import { beginPage } from "@frontend/helper";
import { AppService } from "@frontend/lib";
import type { Unsubscribable } from "npm:@trpc/server/observable";
import { createResource, Match, onCleanup, Show, Switch } from "npm:solid-js";
import { createSignal, onMount } from "solid-js";

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
  const [latch, setLatch] = createSignal<boolean>();

  let activitySubscription: Unsubscribable | undefined;

  onMount(() => {
    activitySubscription = AppService.get().tRPC.Stats.DeviceState.subscribe(undefined, {
      onData: (data) => {
        setLatch(data.latch);
      },
    });
  });

  onCleanup(() => {
    if (activitySubscription) activitySubscription.unsubscribe();
  });

  const onClickSetLatch = (latch: boolean) => {
    setLatch(undefined);

    return AppService.get().tRPC.Stats.SetLatch.mutate({ latch });
  };

  return (
    <Card colour="danger">
      <Card.Header text="Admin Controls" />
      <Card.Body>
        <Show when={latch() !== undefined} fallback={<p>Loading...</p>}>
          <p>
            Latch is currently{" "}
            <span class={`badge text-bg-${latch() ? "danger" : "success"}`}>{latch() ? "ON" : "OFF"}</span>
          </p>
        </Show>
        <p>Turning latch ON will disable the mag-lock and allow entry to all.</p>
        <p>Turning latch OFF will re-enable security and a RFID tag will be required for entry.</p>
        <Button colour="danger" on:click={() => onClickSetLatch(true)}>
          Latch On
        </Button>
        &nbsp;
        <Button colour="success" on:click={() => onClickSetLatch(false)}>
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
      <Card.Header text="🖥 Admin Dashboard" />
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
