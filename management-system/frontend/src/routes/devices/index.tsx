import { assertError, FieldMetadata } from "@door-entry-management-system/common";
import {
  Button,
  Card,
  CursorDefault,
  fetchParamsFromCursor,
  LinkButton,
  MagicBrowser,
  type RowData,
  RowDataDefault,
  RowSelectionDefault,
} from "@frontend/components";
import { openAlert, openConfirm } from "@frontend/dialogs";
import { beginPage } from "@frontend/helper";
import type { DeviceSearchRecord } from "@frontend/services";
import type { RouteSectionProps } from "@solidjs/router";
import { createEffect, createSignal, Show } from "solid-js";
import * as v from "valibot";

const DeviceTableSchema = v.object({
  name: v.pipe(v.string(), v.title("Name"), v.metadata(FieldMetadata({ icon: "N" }))),
  ip_address: v.pipe(v.string(), v.title("IP Address"), v.metadata(FieldMetadata({ icon: "IP" }))),
  created: v.pipe(v.date(), v.title("Created"), v.metadata(FieldMetadata({ width: "140px" }))),
  updated: v.pipe(v.date(), v.title("Updated"), v.metadata(FieldMetadata({ width: "140px" }))),
});

export function Devices(props: RouteSectionProps) {
  const { navigate, tRPC } = beginPage(["admin", "user"]);

  const [rows, setRows] = createSignal<RowData<DeviceSearchRecord>>(RowDataDefault);
  const [cursor, setCursor] = createSignal(CursorDefault);
  const [search, setSearch] = createSignal("");
  const [selection, setSelection] = createSignal(RowSelectionDefault);

  const fetchRows = async () => {
    const params = fetchParamsFromCursor(cursor());

    try {
      setRows(await tRPC.Device.Search.query({ ...params, search: search() }));
    } catch (err) {
      assertError(err);
      await openAlert(`Fetch Error: ${err.name}`, err.message);
    }
  };

  const onRowClick = async (row: DeviceSearchRecord) => {
    navigate(`/devices/${row.id}`);
  };

  const onDelete = async () => {
    const { ids } = selection();

    if (ids.length === 0) return;

    const res = await openConfirm("Delete user", `Are you sure you wish to delete ${ids.length} devices`);

    if (res === "yes") {
      await tRPC.User.delete.mutate({ ids });

      setSelection(RowSelectionDefault);

      await fetchRows();
    }
  };

  createEffect(fetchRows);

  return (
    <main>
      <Card colour="info">
        <Card.Header text="📟 Devices" />
        <Card.Body pad={0}>
          <MagicBrowser
            schema={DeviceTableSchema}
            rowData={rows()}
            cursor={[cursor, setCursor]}
            selection={[selection, setSelection]}
            onRowClick={onRowClick}
          />
        </Card.Body>
        <Card.Footer>
          <Show when={selection().ids.length > 0}>
            <Button colour="danger" on:click={() => onDelete()}>
              Delete
            </Button>
          </Show>
          <LinkButton colour="info" href="/devices/new">
            New
          </LinkButton>
        </Card.Footer>
      </Card>
    </main>
  );
}
