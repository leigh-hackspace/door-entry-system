import { serveDir } from "jsr:@std/http/file-server";

const portStr = Deno.env.get("BLE_FRONTEND_PORT");
if (!portStr) throw new Error("No port specified!");

const port = parseInt(portStr, 10);

Deno.serve({ port }, async (req: Request) => {
  const url = new URL(req.url);

  if (url.pathname !== "/" && !url.pathname.includes(".")) {
    req = new Request(`${url.protocol}//${url.host}/`, req);
  }

  const res = await serveDir(req, {
    fsRoot: "web",
    urlRoot: "",
  });

  // Nix store always has file date of 1970 so delete this header
  res.headers.delete("Last-Modified");

  res.headers.append("Cache-Control", "max-age=300");
  res.headers.append("Last-Modified", new Date().toUTCString());

  return res;
});
