import { formatDateTime } from "@door-entry-management-system/common";
import { Button, Card, Tile } from "@frontend/components";
import { beginPage } from "@frontend/helper";
import { AppService } from "@frontend/services";
import type { Unsubscribable } from "@trpc/server/observable";
import { createResource, For, Match, onCleanup, onMount, Show, Switch } from "solid-js";
import { createStore } from "solid-js/store";

export function Home() {
  const { user } = beginPage(["admin", "user"]);

  return (
    <main class="grid gap-3" style={{ "--grid-rows": "2" }}>
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
  const [deviceState, setDeviceState] = createStore<Record<string, boolean>>();

  const [tasks] = createResource(() => AppService.get().tRPC.Task.List.query({}));

  let activitySubscription: Unsubscribable | undefined;

  onMount(() => {
    activitySubscription = AppService.get().tRPC.Stats.DeviceState.subscribe(undefined, {
      onData: (data) => {
        setDeviceState(data.name, data.latch);
      },
    });
  });

  onCleanup(() => {
    if (activitySubscription) activitySubscription.unsubscribe();
  });

  const onClickSetLatch = (latch: boolean) => {
    return AppService.get().tRPC.Stats.SetLatch.mutate({ latch });
  };

  const onSyncAuthentik = async () => {
    const result = await AppService.get().tRPC.Stats.SyncAuthentik.mutate({});

    alert(JSON.stringify(result));
  };

  const onRunTask = async (task: { name: string }) => {
    await AppService.get().tRPC.Task.Run.mutate({ name: task.name });
  };

  return (
    <Card colour="danger">
      <Card.Header text="Admin Controls" />
      <Card.Body>
        <div class="d-flex gap-3 flex-column">
          <div>
            <For each={Object.entries(deviceState)}>
              {([name, latch]) => (
                <p class="d-flex gap-2 align-items-center">
                  <span>
                    <b>{name}</b> Latch is currently
                  </span>
                  <span class={`badge text-bg-${latch ? "danger" : "success"}`}>{latch ? "ON" : "OFF"}</span>
                </p>
              )}
            </For>
            <p>Turning latch ON will disable the mag-lock and allow entry to all.</p>
            <p>Turning latch OFF will re-enable security and a RFID tag will be required for entry.</p>
            <Button colour="danger" on:click={() => onClickSetLatch(true)}>
              Latch On
            </Button>
            &nbsp;
            <Button colour="success" on:click={() => onClickSetLatch(false)}>
              Latch Off
            </Button>
          </div>

          <hr />

          <div>
            <p>Manually sync users from Authentik to this system.</p>
            <Button colour="warning" on:click={() => onSyncAuthentik()}>
              Sync Authentik
            </Button>
          </div>

          <hr />

          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Next Run Time</th>
              </tr>
            </thead>
            <tbody>
              <For each={tasks()}>
                {(task) => (
                  <tr>
                    <td>{task.name}</td>
                    <td>{formatDateTime(task.nextRunTime)}</td>
                    <td>
                      <Button colour="warning" on:click={() => onRunTask(task)}>
                        Run
                      </Button>
                    </td>
                  </tr>
                )}
              </For>
            </tbody>
          </table>
        </div>
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
