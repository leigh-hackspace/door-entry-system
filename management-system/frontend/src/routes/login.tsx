import { assertUnreachable, LoginDataSchema, type LoginData } from "@door-entry-management-system/common";
import { Button, Card, MagicFields } from "@frontend/components";
import { AlertDialog, openDialog } from "@frontend/dialogs";
import { getLogoutReason } from "@frontend/helper";
import { AppService, getAuthReturnUrl } from "@frontend/lib";
import { useNavigate, type RouteSectionProps } from "npm:@solidjs/router";
import { createSignal, onMount, Show } from "npm:solid-js";

export function Login(props: RouteSectionProps) {
  const navigate = useNavigate();
  const { toastService } = AppService.get();

  onMount(() => {
    const reason = getLogoutReason();

    if (reason === "expired") {
      toastService.addToast({
        life: 10_000,
        title: "Logged out",
        message: "You have been logged out because your session has expired.",
      });
    } else if (reason === "permissions") {
      toastService.addToast({
        life: 10_000,
        title: "Invalid permissions",
        message: "You do not have access to this area.",
      });
    } else if (reason === undefined) {
      // Do nothing
    } else {
      assertUnreachable(reason);
    }
  });

  const [login, setLogin] = createSignal<LoginData>({ email: "", password: "" });

  const [submittedCount, setSubmittedCount] = createSignal(0);

  const onLogin = async (e: SubmitEvent) => {
    e.preventDefault();

    try {
      setSubmittedCount(submittedCount() + 1);

      await AppService.get().login(login().email, login().password);

      navigate("/");
    } catch (err) {
      if (err instanceof Error) {
        await openDialog(AlertDialog, {
          title: "An error occurred",
          message: err.message,
        });
      }
    }
  };

  const onLoginWithAuthentik = async () => {
    const { url } = await AppService.get().tRPC.Auth.BeginOAuth.query({
      return_auth: getAuthReturnUrl(),
    });

    globalThis.location.href = url;
  };

  return (
    <main>
      <div class="grid">
        <div class="g-col-12 g-col-md-6 g-start-md-4">
          <Card colour="danger">
            <Card.Header text="Login with Authentik" />
            <Card.Body>Use your Leigh Hackspace account to login</Card.Body>
            <Card.Footer>
              <Button colour="primary" on:click={() => onLoginWithAuthentik()}>
                Login with Authentik
              </Button>
            </Card.Footer>
          </Card>
        </div>

        <form on:submit={onLogin} class="g-col-12 g-col-md-6 g-start-md-4">
          <Card colour="primary">
            <Card.Header text="Login" />
            <Card.Body>
              <MagicFields
                schema={LoginDataSchema}
                data={login()}
                validation={submittedCount() > 0}
                onChange={setLogin}
              />
            </Card.Body>
            <Card.Footer>
              <Show when={globalThis.location.hostname === "localhost"}>
                <Button colour="info" on:click={() => setLogin({ email: "admin@example.com", password: "password" })}>
                  Admin Demo
                </Button>
                <Button colour="info" on:click={() => setLogin({ email: "user@example.com", password: "password" })}>
                  User Demo
                </Button>
              </Show>
              <button class="btn btn-primary" type="submit">
                Login
              </button>
            </Card.Footer>
          </Card>
        </form>
      </div>
    </main>
  );
}
