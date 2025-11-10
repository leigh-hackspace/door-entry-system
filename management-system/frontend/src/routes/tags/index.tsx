import { assertError, FieldMetadata } from "@door-entry-management-system/common";
import {
  Button,
  Card,
  type Cursor,
  CursorDefault,
  fetchParamsFromCursor,
  LinkButton,
  MagicBrowser,
  type RowData,
  RowDataDefault,
  RowSelectionDefault,
  SearchBar,
} from "@frontend/components";
import { openAlert, openConfirm } from "@frontend/dialogs";
import { beginPage } from "@frontend/helper";
import type { TagSearchRecord } from "@frontend/services";
import type { RouteSectionProps } from "@solidjs/router";
import { createEffect, createSignal, Show } from "solid-js";
import * as v from "valibot";

const TagTableSchema = v.object({
  code: v.pipe(v.string(), v.title("Code"), v.metadata(FieldMetadata({ icon: "🔑", width: "140px" }))),
  description: v.pipe(v.string(), v.title("Description"), v.metadata(FieldMetadata({ icon: "✍" }))),
  user_name: v.nullable(
    v.pipe(v.string(), v.title("User Name"), v.metadata(FieldMetadata({ icon: "👤", lookup: "User" })))
  ),
  created: v.pipe(v.date(), v.title("Created"), v.metadata(FieldMetadata({ width: "140px" }))),
  updated: v.pipe(v.date(), v.title("Updated"), v.metadata(FieldMetadata({ width: "140px" }))),
});

export function Tags(props: RouteSectionProps) {
  const { navigate, tRPC } = beginPage(["admin", "user"]);

  // Start with created date descending (most useful)
  const initialCursor: Cursor = { ...CursorDefault, sort: { sort: "created", dir: "desc" } };

  const [rows, setRows] = createSignal<RowData<TagSearchRecord>>(RowDataDefault);
  const [cursor, setCursor] = createSignal(initialCursor);
  const [search, setSearch] = createSignal("");
  const [selection, setSelection] = createSignal(RowSelectionDefault);

  const fetchRows = async () => {
    const params = fetchParamsFromCursor(cursor());

    try {
      setRows(await tRPC.Tag.search.query({ ...params, search: search() }));
    } catch (err) {
      assertError(err);
      await openAlert(`Fetch Error: ${err.name}`, err.message);
    }
  };

  createEffect(fetchRows);

  const onRowClick = async (row: TagSearchRecord) => {
    navigate(`/tags/${row.id}`);
  };

  const onDelete = async () => {
    const { ids } = selection();

    if (ids.length !== 1) return;

    const res = await openConfirm("Delete tag", `Are you sure you wish to delete ${ids.length} tags`);

    if (res === "yes") {
      await tRPC.Tag.Delete.mutate(ids[0]);

      setSelection(RowSelectionDefault);

      await fetchRows();
    }
  };

  return (
    <main>
      <Card colour="warning">
        <Card.Header text="🪪 Tags" />
        <Card.Body pad={0}>
          <div class="p-2">
            <SearchBar search={[search, setSearch]} />
          </div>
          <MagicBrowser
            schema={TagTableSchema}
            rowData={rows()}
            cursor={[cursor, setCursor]}
            selection={[selection, setSelection]}
            onRowClick={onRowClick}
          />
        </Card.Body>
        <Card.Footer>
          <Show when={selection().ids.length === 1}>
            <Button colour="danger" on:click={() => onDelete()}>
              Delete
            </Button>
          </Show>
          <LinkButton colour="info" href="/tags/new">
            New
          </LinkButton>
        </Card.Footer>
      </Card>
    </main>
  );
}
