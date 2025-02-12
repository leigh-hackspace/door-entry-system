import { type DeviceUpdate, DeviceUpdateSchema, humanise } from "@door-entry-management-system/common";
import { Button, Card, DateInfo, MagicFields } from "@frontend/components";
import { beginPage } from "@frontend/helper";
import type { RouteSectionProps } from "npm:@solidjs/router";
import { createResource, For, Show, Suspense } from "npm:solid-js";

export function DeviceEdit(props: RouteSectionProps) {
  const { tRPC, toastService, user } = beginPage(["admin", "user"]);

  const id = () => props.params.id;

  const [device, { mutate }] = createResource(() => tRPC.Device.One.query(props.params.id));
  const [stats, { refetch }] = createResource(() => tRPC.Device.Stats.query(props.params.id));

  const formSchema = DeviceUpdateSchema;

  const onChange = (data: DeviceUpdate) => mutate({ ...device()!, ...data });

  const onRefresh = async () => {
    refetch();
  };

  return (
    <main class="grid gap-3">
      <div class="g-col-12 g-col-xl-6">
        <Card colour="warning">
          <Card.Header text="Device Info" />
          <Card.Body>
            <form>
              <Suspense fallback="Loading...">
                <Show when={device()}>
                  {(device) => (
                    <div class="d-flex flex-column gap-3">
                      <MagicFields schema={formSchema} data={device()} validation={false} onChange={onChange} />
                      <DateInfo record={device()} />
                    </div>
                  )}
                </Show>
              </Suspense>
            </form>
          </Card.Body>
          <Card.Footer>
            <Button colour="primary" type="button" on:click={onRefresh}>
              Refresh
            </Button>
          </Card.Footer>
        </Card>
      </div>

      <div class="g-col-12 g-col-xl-6">
        <Card colour="warning">
          <Card.Header text="Stats" />
          <Card.Body>
            {/* <pre style={{ "margin-bottom": 0 }}>{JSON.stringify(stats())}</pre> */}
            <Show when={stats()}>
              {(stats) => (
                <table class="table" style={{ "margin-bottom": 0 }}>
                  <For each={Object.entries(stats())}>
                    {([key, value]) => (
                      <tr>
                        <th>{humanise(key)}</th>
                        <td>{String(value)}</td>
                      </tr>
                    )}
                  </For>
                </table>
              )}
            </Show>
          </Card.Body>
        </Card>
      </div>
    </main>
  );
}
