import { FieldMetadata, humanise } from "@door-entry-management-system/common";
import { Card, LinkButton, MagicBrowser, refreshAllBrowsers } from "@frontend/components";
import { openConfirm } from "@frontend/dialogs";
import { beginPage } from "@frontend/helper";
import type { FetchParameters, UserSearchRecord } from "@frontend/lib";
import type { RouteSectionProps } from "npm:@solidjs/router";
import * as v from "npm:valibot";

const UserTableSchema = v.object({
  role: v.pipe(v.string(), v.title("Role"), v.metadata(FieldMetadata({ icon: "🏅" }))),
  email: v.pipe(v.string(), v.title("Email"), v.metadata(FieldMetadata({ icon: "📧" }))),
  name: v.pipe(v.string(), v.title("Name"), v.metadata(FieldMetadata({ icon: "👤" }))),
  created: v.pipe(v.date(), v.title("Created"), v.metadata(FieldMetadata({ displayMode: "raw" }))),
  updated: v.pipe(v.date(), v.title("Updated"), v.metadata(FieldMetadata({ displayMode: "raw" }))),
});

export function Users(props: RouteSectionProps) {
  const { navigate, tRPC } = beginPage("admin");

  const onFetch = async (params: FetchParameters) => {
    return tRPC.User.Search.query(params);
  };

  const onDelete = async (row: UserSearchRecord) => {
    const res = await openConfirm("Delete user", `Are you sure you wish to delete "${row.name}"`);

    if (res === "yes") {
      await tRPC.User.Delete.mutate(row.id);
      refreshAllBrowsers();
    }
  };

  return (
    <main>
      <Card colour="success">
        <Card.Header text="👤 Users" />
        <Card.Body>
          <MagicBrowser
            schema={UserTableSchema}
            rowActions={[
              { name: "Edit", colour: "info", onClick: (row) => navigate(`/users/${row.id}`) },
              { name: "Delete", colour: "danger", onClick: onDelete },
            ]}
            onFetch={onFetch}
            renderRole={(row) => humanise(row.role)}
          />
        </Card.Body>
        <Card.Footer>
          <LinkButton colour="info" href="/users/new">
            New
          </LinkButton>
        </Card.Footer>
      </Card>
    </main>
  );
}
