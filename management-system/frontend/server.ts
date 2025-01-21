import { serveDir } from "jsr:@std/http/file-server";

const portStr = Deno.env.get("DE_FRONTEND_PORT");
if (!portStr) throw new Error("No port specified!");

const port = parseInt(portStr, 10);

Deno.serve({ port }, (req: Request) => {
  const url = new URL(req.url);

  if (url.pathname !== "/" && !url.pathname.includes(".")) {
    req = new Request(`${url.protocol}//${url.host}/`, req);
  }

  return serveDir(req, {
    fsRoot: "web",
    urlRoot: "",
  });
});
