import { type TagUpdate, TagUpdateSchema } from "@door-entry-management-system/common";
import { Button, Card, DateInfo, MagicFields } from "@frontend/components";
import { beginPage } from "@frontend/helper";
import type { RouteSectionProps } from "npm:@solidjs/router";
import { createResource, createSignal, Show, Suspense } from "npm:solid-js";
import * as v from "npm:valibot";

export function TagEdit(props: RouteSectionProps) {
  const { tRPC, toastService } = beginPage("admin");

  const id = () => props.params.id;

  const [tag, { mutate }] = createResource(() => tRPC.Tag.One.query(props.params.id));
  const [submittedCount, setSubmittedCount] = createSignal(0);

  const onChange = (data: TagUpdate) => mutate({ ...tag()!, ...data });

  const onSave = async () => {
    setSubmittedCount(submittedCount() + 1);
    const res = v.parse(TagUpdateSchema, tag());

    await tRPC.Tag.Update.mutate([id(), res]);

    toastService.addToast({ title: "Save", message: "Save successful", life: 5000 });
  };

  return (
    <main>
      <Card colour="success">
        <Card.Header text="Update Tag" />
        <Card.Body>
          <form>
            <Suspense fallback="Loading...">
              <Show when={tag()}>
                {(tag) => (
                  <div class="d-flex flex-column gap-3">
                    <MagicFields
                      schema={TagUpdateSchema}
                      data={tag()}
                      validation={submittedCount() > 0}
                      onChange={onChange}
                    />
                    <DateInfo record={tag()} />
                  </div>
                )}
              </Show>
            </Suspense>
          </form>
        </Card.Body>
        <Card.Footer>
          <Button colour="primary" type="button" on:click={onSave}>
            Save
          </Button>
        </Card.Footer>
      </Card>
    </main>
  );
}
