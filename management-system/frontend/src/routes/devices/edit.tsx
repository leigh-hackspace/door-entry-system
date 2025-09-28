import { type DeviceUpdate, DeviceUpdateSchema } from "@door-entry-management-system/common";
import { Button, Card, DateInfo, MagicFields } from "@frontend/components";
import { beginPage } from "@frontend/helper";
import type { RouteSectionProps } from "@solidjs/router";
import { createResource, For, onCleanup, Show, Suspense } from "solid-js";
import { downloadFile, uploadFile } from "@frontend/utils";

export function DeviceEdit(props: RouteSectionProps) {
  const { tRPC, toastService } = beginPage(["admin"]);

  const id = () => props.params.id;

  const [device, { mutate }] = createResource(() => tRPC.Device.One.query(props.params.id));
  const [stats, { refetch }] = createResource(() => tRPC.Device.Stats.query(props.params.id));

  const progressSubscription = tRPC.Device.Progress.subscribe(undefined, {
    onData: (progress) => {
      toastService.addToast({
        title: "Progress",
        message: `${progress}`,
        life: 5000,
      });
    },
  });

  onCleanup(() => progressSubscription.unsubscribe());

  const formSchema = DeviceUpdateSchema;

  const onChange = (data: DeviceUpdate) => mutate({ ...device()!, ...data });

  const onRefresh = async () => {
    refetch();
  };

  async function onClickUpload() {
    const [file_name, file_data] = await uploadFile();
    await tRPC.Device.UploadFile.mutate({ device_id: id(), file_name, file_data });
    refetch();
  }

  async function onClickDownload(file_name: string) {
    const data = await tRPC.Device.DownloadFile.query({ device_id: id(), file_name });
    if (!data) return;
    downloadFile(file_name, data.file_data);
  }

  async function onClickDelete(file_name: string) {
    await tRPC.Device.DeleteFile.mutate({ device_id: id(), file_name });
    refetch();
  }

  async function onClickPlay(file_name: string) {
    await tRPC.Device.PlayFile.query({ device_id: id(), file_name });
  }

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
          <Card.Header text="Files" />
          <Card.Body>
            <Show when={stats()}>
              {(stats) => (
                <table class="table" style={{ "margin-bottom": 0 }}>
                  <tbody>
                    <For each={stats().file_list}>
                      {({ name, size }) => (
                        <tr>
                          <th>{name}</th>
                          <td>{String(size)} bytes</td>
                          <td>
                            <Button colour="info" on:click={() => onClickDownload(name)}>Download</Button>
                            <Button colour="danger" on:click={() => onClickDelete(name)}>Delete</Button>
                            <Show when={name.toLowerCase().includes(".mp3")}>
                              <Button colour="success" on:click={() => onClickPlay(name)}>Play</Button>
                            </Show>
                          </td>
                        </tr>
                      )}
                    </For>
                  </tbody>
                </table>
              )}
            </Show>
          </Card.Body>
          <Card.Footer>
            <Button colour="warning" type="button" on:click={onClickUpload}>
              Upload
            </Button>
          </Card.Footer>
        </Card>
      </div>
    </main>
  );
}
