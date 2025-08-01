import { assertError, FieldMetadata } from "@door-entry-management-system/common";
import {
  Card,
  CursorDefault,
  fetchParamsFromCursor,
  MagicBrowser,
  type RowData,
  RowDataDefault,
  RowSelectionDefault,
  SearchBar,
} from "@frontend/components";
import { openAlert } from "@frontend/dialogs";
import { beginPage } from "@frontend/helper";
import type { ActivityLogSearchRecord } from "@frontend/lib";
import type { RouteSectionProps } from "@solidjs/router";
import { createEffect, createSignal } from "solid-js";
import * as v from "valibot";

const ActivityLogTableSchema = v.object({
  code: v.pipe(v.string(), v.title("Code"), v.metadata(FieldMetadata({ icon: "🔑" }))),
  action: v.pipe(v.string(), v.title("Action"), v.metadata(FieldMetadata({ icon: "🔘" }))),
  user_name: v.nullable(v.pipe(v.string(), v.title("User Name"), v.metadata(FieldMetadata({ icon: "👤" })))),
  created: v.pipe(v.date(), v.title("Created"), v.metadata(FieldMetadata({ displayMode: "raw" }))),
});

export function ActivityLogs(props: RouteSectionProps) {
  const { tRPC } = beginPage(["admin", "user"]);

  const [rows, setRows] = createSignal<RowData<ActivityLogSearchRecord>>(RowDataDefault);

  const cursorSignal = createSignal(CursorDefault);
  const searchSignal = createSignal("");
  const selectionSignal = createSignal(RowSelectionDefault);

  const fetchRows = async () => {
    const cursor = cursorSignal[0]();
    const params = fetchParamsFromCursor(cursor);

    try {
      setRows(await tRPC.ActivityLog.Search.query({ ...params, search: searchSignal[0]() }));
    } catch (err) {
      assertError(err);
      await openAlert(`Fetch Error: ${err.name}`, err.message);
    }
  };

  createEffect(fetchRows);

  const onRowClick = async (row: ActivityLogSearchRecord) => {
  };

  return (
    <main>
      <Card colour="primary">
        <Card.Header text="🪵 Activity Logs" />
        <Card.Body pad={0}>
          <div class="p-2">
            <SearchBar search={searchSignal} />
          </div>
          <MagicBrowser
            schema={ActivityLogTableSchema}
            rowData={rows()}
            cursor={cursorSignal}
            selection={selectionSignal}
          />
        </Card.Body>
      </Card>
    </main>
  );
}
