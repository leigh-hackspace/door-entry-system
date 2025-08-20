import { type TagCreate, TagCreateSchema } from "@door-entry-management-system/common";
import { Button, Card, MagicFields } from "@frontend/components";
import { beginPage } from "@frontend/helper";
import type { RouteSectionProps } from "@solidjs/router";
import { createSignal } from "solid-js";
import * as v from "valibot";

export function TagNew(props: RouteSectionProps) {
  const { navigate, tRPC, toastService, user } = beginPage(["admin", "user"]);

  const [tag, setTag] = createSignal<Partial<TagCreate>>({ user_id: null });
  const [submittedCount, setSubmittedCount] = createSignal(0);

  const formSchema = user()?.role === "admin" ? TagCreateSchema : v.omit(TagCreateSchema, ["user_id"]);

  const onChange = (data: Partial<TagCreate>) => {
    setTag({ ...tag(), ...data });
  };

  const onSave = async () => {
    setSubmittedCount(submittedCount() + 1);
    const res = v.parse(formSchema, tag());

    const id = await tRPC.Tag.Create.mutate(res);

    toastService.addToast({ title: "Save", message: "Save successful", life: 5000 });
    navigate(`/tags/${id}`);
  };

  return (
    <main>
      <Card colour="warning">
        <Card.Header text="Create Tag" />
        <Card.Body>
          <form>
            <MagicFields schema={formSchema} data={tag()} validation={submittedCount() > 0} onChange={onChange} />
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
