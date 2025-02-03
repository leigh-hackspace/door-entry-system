import { FieldMetadata } from "@door-entry-management-system/common";
import { Card, LinkButton, MagicBrowser, refreshAllBrowsers } from "@frontend/components";
import { openConfirm } from "@frontend/dialogs";
import { beginPage } from "@frontend/helper";
import type { FetchParameters, TagSearchRecord } from "@frontend/lib";
import type { RouteSectionProps } from "npm:@solidjs/router";
import * as v from "npm:valibot";

const TagTableSchema = v.object({
  code: v.pipe(v.string(), v.title("Code"), v.metadata(FieldMetadata({ icon: "🔑" }))),
  description: v.pipe(v.string(), v.title("Description"), v.metadata(FieldMetadata({ icon: "✍" }))),
  user_name: v.nullable(
    v.pipe(v.string(), v.title("User Name"), v.metadata(FieldMetadata({ icon: "👤", lookup: "User" })))
  ),
  created: v.pipe(v.date(), v.title("Created"), v.metadata(FieldMetadata({ displayMode: "raw" }))),
  updated: v.pipe(v.date(), v.title("Updated"), v.metadata(FieldMetadata({ displayMode: "raw" }))),
});

export function Tags(props: RouteSectionProps) {
  const { navigate, tRPC } = beginPage(["admin", "user"]);

  const onFetch = async (params: FetchParameters) => {
    return tRPC.Tag.Search.query(params);
  };

  const onDelete = async (row: TagSearchRecord) => {
    const res = await openConfirm("Delete tag", `Are you sure you wish to delete "${row.code}"`);

    if (res === "yes") {
      await tRPC.Tag.Delete.mutate(row.id);
      refreshAllBrowsers();
    }
  };

  return (
    <main>
      <Card colour="warning">
        <Card.Header text="🪪 Tags" />
        <Card.Body>
          <MagicBrowser
            schema={TagTableSchema}
            rowActions={[
              { name: "Edit", colour: "info", onClick: (row) => navigate(`/tags/${row.id}`) },
              { name: "Delete", colour: "danger", onClick: onDelete },
            ]}
            onFetch={onFetch}
          />
        </Card.Body>
        <Card.Footer>
          <LinkButton colour="info" href="/tags/new">
            New
          </LinkButton>
        </Card.Footer>
      </Card>
    </main>
  );
}
