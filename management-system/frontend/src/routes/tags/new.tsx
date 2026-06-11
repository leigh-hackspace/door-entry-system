import { type TagCreate, TagCreateSchema } from "@door-entry-management-system/common";
import { Button, Card, MagicFields } from "@frontend/components";
import { beginPage } from "@frontend/helper";
import type { RouteSectionProps } from "@solidjs/router";
import { createSignal } from "solid-js";
import * as v from "valibot";

export function TagNew(props: RouteSectionProps) {
  const { navigate, tRPC, toastService, user } = beginPage(["admin", "user"]);

  const [tag, setTag] = createSignal<Partial<TagCreate>>({ userId: null });
  const [submittedCount, setSubmittedCount] = createSignal(0);

  const formSchema = user()?.role === "admin" ? TagCreateSchema : v.omit(TagCreateSchema, ["userId"]);

  const onChange = async (data: Partial<TagCreate>) => {
    const updated = { ...tag()!, ...data };

    if ((updated.description ?? "").length === 0 && updated.userId) {
      const user = await tRPC.User.getOne.query(updated.userId);
      updated.description = `Tag for ${user.name}`;
    }

    setTag(updated);
  };

  const onSave = async () => {
    setSubmittedCount(submittedCount() + 1);
    const res = v.parse(formSchema, tag());

    const id = await tRPC.Tag.create.mutate(res);

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
