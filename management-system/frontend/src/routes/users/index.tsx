import { assertError, FieldMetadata, humanise } from "@door-entry-management-system/common";
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
import type { UserSearchRecord } from "@frontend/services";
import type { RouteSectionProps } from "@solidjs/router";
import { createEffect, createSignal, Show } from "solid-js";
import * as v from "valibot";

const UserTableSchema = v.object({
  role: v.pipe(v.string(), v.title("Role"), v.metadata(FieldMetadata({ icon: "🏅" }))),
  email: v.pipe(v.string(), v.title("Email"), v.metadata(FieldMetadata({ icon: "📧" }))),
  name: v.pipe(v.string(), v.title("Name"), v.metadata(FieldMetadata({ icon: "👤" }))),
  created: v.pipe(v.date(), v.title("Created"), v.metadata(FieldMetadata({ displayMode: "raw" }))),
  updated: v.pipe(v.date(), v.title("Updated"), v.metadata(FieldMetadata({ displayMode: "raw" }))),
});

export function Users(props: RouteSectionProps) {
  const { navigate, tRPC } = beginPage("admin");

  const [rows, setRows] = createSignal<RowData<UserSearchRecord>>(RowDataDefault);

  // Start with created date descending (most useful)
  const initialCursor: Cursor = { ...CursorDefault, sort: { sort: "created", dir: "desc" } };

  const cursorSignal = createSignal(initialCursor);
  const searchSignal = createSignal("");
  const selectionSignal = createSignal(RowSelectionDefault);

  const fetchRows = async () => {
    const cursor = cursorSignal[0]();
    const params = fetchParamsFromCursor(cursor);

    try {
      setRows(await tRPC.User.Search.query({ ...params, search: searchSignal[0]() }));
    } catch (err) {
      assertError(err);
      await openAlert(`Fetch Error: ${err.name}`, err.message);
    }
  };

  createEffect(fetchRows);

  const onRowClick = async (row: UserSearchRecord) => {
    navigate(`/users/${row.id}`);
  };

  const onDelete = async () => {
    const { total } = rows();
    const { ids, mode } = selectionSignal[0]();

    const deleteCount = mode === "noneBut" ? ids.length : total - ids.length;
    if (deleteCount === 0 || mode === "allBut") return;

    const res = await openConfirm("Delete user", `Are you sure you wish to delete ${deleteCount} users`);

    if (res === "yes") {
      await tRPC.User.Delete.mutate({ ids, mode });

      selectionSignal[1](RowSelectionDefault);

      await fetchRows();
    }
  };

  return (
    <main>
      <Card colour="success">
        <Card.Header text="👤 Users" />
        <Card.Body pad={0}>
          <div class="p-2">
            <SearchBar search={searchSignal} />
          </div>
          <MagicBrowser
            schema={UserTableSchema}
            rowData={rows()}
            cursor={cursorSignal}
            selection={selectionSignal}
            acquireImage={(row) => row.image_url}
            renderRole={(row) => humanise(row.role)}
            onRowClick={onRowClick}
          />
        </Card.Body>
        <Card.Footer>
          <Show when={selectionSignal[0]().ids.length > 0}>
            <Button colour="danger" on:click={() => onDelete()}>
              Delete
            </Button>
          </Show>
          <LinkButton colour="info" href="/users/new">
            New
          </LinkButton>
        </Card.Footer>
      </Card>
    </main>
  );
}
