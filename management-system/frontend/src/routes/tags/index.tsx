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
  SearchBar,
} from "@frontend/components";
import { openAlert, openConfirm } from "@frontend/dialogs";
import { beginPage } from "@frontend/helper";
import type { TagSearchRecord } from "@frontend/services";
import type { RouteSectionProps } from "@solidjs/router";
import { createEffect, createSignal, Show } from "solid-js";
import * as v from "valibot";

const TagTableSchema = v.object({
  code: v.pipe(v.string(), v.title("Code"), v.metadata(FieldMetadata({ icon: "🔑" }))),
  description: v.pipe(v.string(), v.title("Description"), v.metadata(FieldMetadata({ icon: "✍" }))),
  user_name: v.nullable(
    v.pipe(v.string(), v.title("User Name"), v.metadata(FieldMetadata({ icon: "👤", lookup: "User" }))),
  ),
  created: v.pipe(v.date(), v.title("Created"), v.metadata(FieldMetadata({ displayMode: "raw" }))),
  updated: v.pipe(v.date(), v.title("Updated"), v.metadata(FieldMetadata({ displayMode: "raw" }))),
});

export function Tags(props: RouteSectionProps) {
  const { navigate, tRPC } = beginPage(["admin", "user"]);

  const [rows, setRows] = createSignal<RowData<TagSearchRecord>>(RowDataDefault);

  const cursorSignal = createSignal(CursorDefault);
  const searchSignal = createSignal("");
  const selectionSignal = createSignal(RowSelectionDefault);

  const fetchRows = async () => {
    const cursor = cursorSignal[0]();
    const params = fetchParamsFromCursor(cursor);

    try {
      setRows(await tRPC.Tag.Search.query({ ...params, search: searchSignal[0]() }));
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
    const { total } = rows();
    const { ids, mode } = selectionSignal[0]();

    const deleteCount = mode === "noneBut" ? ids.length : total - ids.length;
    if (deleteCount !== 1) return;

    const res = await openConfirm("Delete tag", `Are you sure you wish to delete ${deleteCount} tags`);

    if (res === "yes") {
      await tRPC.Tag.Delete.mutate(ids[0]);

      await fetchRows();
    }
  };

  return (
    <main>
      <Card colour="warning">
        <Card.Header text="🪪 Tags" />
        <Card.Body pad={0}>
          <div class="p-2">
            <SearchBar search={searchSignal} />
          </div>{" "}
          <MagicBrowser
            schema={TagTableSchema}
            rowData={rows()}
            cursor={cursorSignal}
            selection={selectionSignal}
            onRowClick={onRowClick}
          />
        </Card.Body>
        <Card.Footer>
          <Show when={selectionSignal[0]().ids.length === 1}>
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
