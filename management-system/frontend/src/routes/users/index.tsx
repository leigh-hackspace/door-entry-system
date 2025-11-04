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
  role: v.pipe(v.string(), v.title("Role"), v.metadata(FieldMetadata({ icon: "🏅", width: "60px" }))),
  email: v.pipe(v.string(), v.title("Email"), v.metadata(FieldMetadata({ icon: "📧" }))),
  name: v.pipe(v.string(), v.title("Name"), v.metadata(FieldMetadata({ icon: "👤" }))),
  paidUp: v.pipe(v.boolean(), v.title("Paid"), v.metadata(FieldMetadata({ icon: "£", width: "60px" }))),
  created: v.pipe(v.date(), v.title("Created"), v.metadata(FieldMetadata({ width: "140px" }))),
  updated: v.pipe(v.date(), v.title("Updated"), v.metadata(FieldMetadata({ width: "140px" }))),
});

export function Users(props: RouteSectionProps) {
  const { navigate, tRPC } = beginPage("admin");

  // Start with created date descending (most useful)
  const initialCursor: Cursor = { ...CursorDefault, sort: { sort: "created", dir: "desc" } };

  const [rows, setRows] = createSignal<RowData<UserSearchRecord>>(RowDataDefault);
  const [cursor, setCursor] = createSignal(initialCursor);
  const [search, setSearch] = createSignal("");
  const [selection, setSelection] = createSignal(RowSelectionDefault);

  const fetchRows = async () => {
    const params = fetchParamsFromCursor(cursor());

    try {
      setRows(await tRPC.User.Search.query({ ...params, search: search() }));
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
    const { ids } = selection();

    if (ids.length === 0) return;

    const res = await openConfirm("Delete user", `Are you sure you wish to delete ${ids.length} users`);

    if (res === "yes") {
      await tRPC.User.Delete.mutate({ ids });

      setSelection(RowSelectionDefault);

      await fetchRows();
    }
  };

  const renderPaidUp = (row: UserSearchRecord) => (
    <div style={{ "font-weight": "bold", color: row.paidUp ? "green" : "red" }}>{row.paidUp ? "Yes" : "No"}</div>
  );

  return (
    <main>
      <Card colour="success">
        <Card.Header text="👤 Users" />
        <Card.Body pad={0}>
          <div class="p-2">
            <SearchBar search={[search, setSearch]} />
          </div>
          <MagicBrowser
            schema={UserTableSchema}
            rowData={rows()}
            cursor={[cursor, setCursor]}
            selection={[selection, setSelection]}
            acquireImage={(row) => row.image_url}
            renderRole={(row) => humanise(row.role)}
            renderPaidUp={renderPaidUp}
            onRowClick={onRowClick}
          />
        </Card.Body>
        <Card.Footer>
          <Show when={selection().ids.length > 0}>
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
