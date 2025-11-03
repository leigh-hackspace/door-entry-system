import {
  assertError,
  FieldMetadata,
  type TaskLogFilter,
  TaskLogLevelSchema,
} from "@door-entry-management-system/common";
import {
  Card,
  type Cursor,
  CursorDefault,
  fetchParamsFromCursor,
  MagicBrowser,
  type RowData,
  RowDataDefault,
  SearchBar,
} from "@frontend/components";
import { openAlert, openOptions } from "@frontend/dialogs";
import { beginPage } from "@frontend/helper";
import type { TaskLogSearchRecord } from "@frontend/services";
import type { RouteSectionProps } from "@solidjs/router";
import { createEffect, createSignal } from "solid-js";
import * as v from "valibot";

const TaskLogTableSchema = v.object({
  level: v.pipe(v.string(), v.title("Level"), v.metadata(FieldMetadata({ icon: "L", width: "80px", filter: true }))),
  type: v.pipe(v.string(), v.title("Type"), v.metadata(FieldMetadata({ icon: "T", filter: true }))),
  notes: v.nullable(v.pipe(v.string(), v.title("Notes"), v.metadata(FieldMetadata({ icon: "N", width: "2fr" })))),
  job_started: v.pipe(v.date(), v.title("Started"), v.metadata(FieldMetadata({ width: "140px", filter: true }))),
  created: v.pipe(v.date(), v.title("Created"), v.metadata(FieldMetadata({ width: "140px" }))),
});

export function TaskLogs(props: RouteSectionProps) {
  const { tRPC } = beginPage(["admin", "user"]);

  // Start with created date descending (most useful)
  const initialCursor: Cursor = { ...CursorDefault, sort: { sort: "created", dir: "desc" } };

  const [rows, setRows] = createSignal<RowData<TaskLogSearchRecord>>(RowDataDefault);
  const [cursor, setCursor] = createSignal(initialCursor);
  const [search, setSearch] = createSignal("");
  const [filter, setFilter] = createSignal<TaskLogFilter>({});

  const fetchRows = async () => {
    const params = fetchParamsFromCursor(cursor());

    try {
      setRows(await tRPC.TaskLog.Search.query({ ...params, search: search(), filter: filter() }));
    } catch (err) {
      assertError(err);
      await openAlert(`Fetch Error: ${err.name}`, err.message);
    }
  };

  createEffect(fetchRows);

  const onFilter = async (colName: keyof TaskLogSearchRecord) => {
    const options = await tRPC.TaskLog.GetFilterOptions.query({ search: search(), filter: filter(), colName });

    const selectedOptions = await openOptions(
      "Filter",
      options.map((r) => ({ id: String(r.value), text: String(r.value) }))
    );

    if (selectedOptions === undefined) return;

    if (colName === "level") {
      setFilter({
        ...filter(),
        level: selectedOptions ? selectedOptions.map((o) => v.parse(TaskLogLevelSchema, o.id)) : undefined,
      });
    }

    if (colName === "type") {
      setFilter({ ...filter(), type: selectedOptions ? selectedOptions.map((o) => o.id) : undefined });
    }
  };

  const onRowClick = async (row: TaskLogSearchRecord) => {};

  return (
    <main>
      <Card colour="primary">
        <Card.Header text="🪵 Task Logs" />
        <Card.Body pad={0}>
          <div class="p-2">
            <SearchBar search={[search, setSearch]} />
          </div>
          <MagicBrowser schema={TaskLogTableSchema} rowData={rows()} cursor={[cursor, setCursor]} onFilter={onFilter} />
        </Card.Body>
      </Card>
    </main>
  );
}
