import { assertError, FieldMetadata } from "@door-entry-management-system/common";
import {
  Card,
  type Cursor,
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
import type { TaskLogSearchRecord } from "@frontend/services";
import type { RouteSectionProps } from "@solidjs/router";
import { createEffect, createSignal } from "solid-js";
import * as v from "valibot";

const TaskLogTableSchema = v.object({
  level: v.pipe(v.string(), v.title("Level"), v.metadata(FieldMetadata({ icon: "L" }))),
  type: v.pipe(v.string(), v.title("Type"), v.metadata(FieldMetadata({ icon: "T" }))),
  notes: v.nullable(v.pipe(v.string(), v.title("Notes"), v.metadata(FieldMetadata({ icon: "N" })))),
  created: v.pipe(v.date(), v.title("Created"), v.metadata(FieldMetadata({ displayMode: "raw" }))),
});

export function TaskLogs(props: RouteSectionProps) {
  const { tRPC } = beginPage(["admin", "user"]);

  const [rows, setRows] = createSignal<RowData<TaskLogSearchRecord>>(RowDataDefault);

  // Start with created date descending (most useful)
  const initialCursor: Cursor = { ...CursorDefault, sort: { sort: "created", dir: "desc" } };

  const cursorSignal = createSignal(initialCursor);
  const searchSignal = createSignal("");
  const selectionSignal = createSignal(RowSelectionDefault);

  const fetchRows = async () => {
    const cursor = cursorSignal[0]();
    const params = fetchParamsFromCursor(cursor);

    try {
      setRows(await tRPC.TaskLog.Search.query({ ...params, search: searchSignal[0]() }));
    } catch (err) {
      assertError(err);
      await openAlert(`Fetch Error: ${err.name}`, err.message);
    }
  };

  createEffect(fetchRows);

  const onRowClick = async (row: TaskLogSearchRecord) => {};

  return (
    <main>
      <Card colour="primary">
        <Card.Header text="🪵 Task Logs" />
        <Card.Body pad={0}>
          <div class="p-2">
            <SearchBar search={searchSignal} />
          </div>
          <MagicBrowser
            schema={TaskLogTableSchema}
            rowData={rows()}
            cursor={cursorSignal}
            selection={selectionSignal}
          />
        </Card.Body>
      </Card>
    </main>
  );
}
