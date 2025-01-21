import { type TagCreate, TagCreateSchema } from "@door-entry-management-system/common";
import { Button, Card, MagicFields } from "@frontend/components";
import { beginPage } from "@frontend/helper";
import type { RouteSectionProps } from "npm:@solidjs/router";
import { createSignal } from "npm:solid-js";
import * as v from "npm:valibot";

export function TagNew(props: RouteSectionProps) {
  const { navigate, tRPC, toastService } = beginPage("admin");

  const [tag, setTag] = createSignal<Partial<TagCreate>>({ user_id: null });
  const [submittedCount, setSubmittedCount] = createSignal(0);

  const onChange = (data: Partial<TagCreate>) => {
    setTag({ ...tag(), ...data });
  };

  const onSave = async () => {
    setSubmittedCount(submittedCount() + 1);
    const res = v.parse(TagCreateSchema, tag());

    const id = await tRPC.Tag.Create.mutate(res);

    toastService.addToast({ title: "Save", message: "Save successful", life: 5000 });
    navigate(`/tags/${id}`);
  };

  return (
    <main>
      <Card colour="success">
        <Card.Header text="Create Tag" />
        <Card.Body>
          <form>
            <MagicFields schema={TagCreateSchema} data={tag()} validation={submittedCount() > 0} onChange={onChange} />
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
