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
  created: v.pipe(v.date(), v.title("Created"), v.metadata(FieldMetadata({ displayMode: "raw" }))),
  updated: v.pipe(v.date(), v.title("Updated"), v.metadata(FieldMetadata({ displayMode: "raw" }))),
});

export function Devices(props: RouteSectionProps) {
  const { navigate, tRPC } = beginPage(["admin", "user"]);

  const [rows, setRows] = createSignal<RowData<DeviceSearchRecord>>(RowDataDefault);

  const cursorSignal = createSignal(CursorDefault);
  const searchSignal = createSignal("");
  const selectionSignal = createSignal(RowSelectionDefault);

  const fetchRows = async () => {
    const cursor = cursorSignal[0]();
    const params = fetchParamsFromCursor(cursor);

    try {
      setRows(await tRPC.Device.Search.query({ ...params, search: searchSignal[0]() }));
    } catch (err) {
      assertError(err);
      await openAlert(`Fetch Error: ${err.name}`, err.message);
    }
  };

  const onRowClick = async (row: DeviceSearchRecord) => {
    navigate(`/devices/${row.id}`);
  };

  const onDelete = async () => {
    const { total } = rows();
    const { ids, mode } = selectionSignal[0]();

    const deleteCount = mode === "noneBut" ? ids.length : total - ids.length;
    if (deleteCount === 0 || mode === "allBut") return;

    const res = await openConfirm("Delete user", `Are you sure you wish to delete ${deleteCount} devices`);

    if (res === "yes") {
      await tRPC.User.Delete.mutate({ ids, mode });

      selectionSignal[1](RowSelectionDefault);

      await fetchRows();
    }
  };

  createEffect(fetchRows);

  return (
    <main>
      <Card colour="info">
        <Card.Header text="📟 Devices" />
        <Card.Body>
          <MagicBrowser
            schema={DeviceTableSchema}
            rowData={rows()}
            cursor={cursorSignal}
            selection={selectionSignal}
            onRowClick={onRowClick}
          />
        </Card.Body>
        <Card.Footer>
          <Show when={selectionSignal[0]().ids.length > 0}>
            <Button colour="danger" on:click={() => onDelete()}>
              Delete
            </Button>
          </Show>{" "}
          <LinkButton colour="info" href="/devices/new">
            New
          </LinkButton>
        </Card.Footer>
      </Card>
    </main>
  );
}
