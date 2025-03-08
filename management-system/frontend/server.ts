import { DOMParser, type DocumentType, type Element } from "jsr:@b-fuze/deno-dom";
import * as Mime from "jsr:@geacko/deno-mimetypes";
import * as base64 from "jsr:@quentinadam/base64";
import { crypto } from "jsr:@std/crypto";
import path from "node:path";

const portStr = Deno.env.get("DE_FRONTEND_PORT");
if (!portStr) throw new Error("No port specified!");

const port = parseInt(portStr, 10);

const BASE_HEADERS = { "Cache-Control": "no-cache" };

Deno.serve({ port }, async (req: Request) => {
  const url = new URL(req.url);

  const assetDir = path.resolve("web");
  const isAsset = url.pathname.includes(".");
  const isServiceWorker = url.pathname === "/service-worker.js";

  const denoJsonPath = path.resolve("../deno.json");
  const version = JSON.parse(await Deno.readTextFile(denoJsonPath)).version;

  if (isServiceWorker) {
    return serveServiceWorker(assetDir, version);
  } else if (isAsset) {
    return serveAsset(assetDir, version, url);
  } else {
    return serveHtmlFile(assetDir, version, url);
  }
});

async function serveAsset(assetDir: string, version: string, url: URL) {
  const requestVersion = url.searchParams.get("v");

  if (requestVersion && version !== requestVersion) {
    return new Response(`${version} !== ${requestVersion}`, {
      ...BASE_HEADERS,
      headers: { "Content-Type": "text/plain" },
    });
  }

  const assetPath = path.join(assetDir, url.pathname);
  // console.log("assetPath:", assetPath);

  const asset = await Deno.open(assetPath);
  const stats = await asset.stat();

  const body = new ReadableStream({
    async start(controller) {
      for await (const chunk of asset.readable) {
        controller.enqueue(chunk);
      }

      controller.close();
    },
    cancel() {
      asset.close();
    },
  });

  const mimeType = Mime.lookup(path.extname(assetPath).substring(1))?.type ?? "text/plain";

  return new Response(body, {
    headers: { ...BASE_HEADERS, "Content-Type": mimeType, "Content-Length": String(stats.size) },
  });
}

async function serveServiceWorker(assetDir: string, version: string) {
  const assetPath = path.join(assetDir, "service-worker.js");
  console.log("assetPath:", assetPath);

  const asset = await Deno.open(assetPath);
  const stats = await asset.stat();

  const buffer = new Uint8Array(stats.size);
  await asset.read(buffer);

  let js = new TextDecoder().decode(buffer);

  js = js.replaceAll("[VERSION]", version);

  return new Response(js, {
    headers: { ...BASE_HEADERS, "Content-Type": "text/javascript", "Content-Length": String(js.length) },
  });
}

async function serveHtmlFile(assetDir: string, version: string, url: URL) {
  const requestVersion = url.searchParams.get("v");

  if (requestVersion && version !== requestVersion) {
    return new Response(`${version} !== ${requestVersion}`, {
      ...BASE_HEADERS,
      headers: { "Content-Type": "text/plain" },
    });
  }

  const assetPath = path.join(assetDir, "index.html");
  console.log("assetPath:", assetPath);

  const asset = await Deno.open(assetPath);
  const stats = await asset.stat();

  const buffer = new Uint8Array(stats.size);
  await asset.read(buffer);

  let html = new TextDecoder().decode(buffer);

  html = await replaceIntegrity(html, async (url) => {
    const assetPath = path.join(assetDir, url);
    // console.log("replaceIntegrity:", assetPath);
    return await getSha256(assetPath);
  });

  html = html.replaceAll("[VERSION]", version);

  return new Response(html, {
    headers: { ...BASE_HEADERS, "Content-Type": "text/html", "Content-Length": String(html.length) },
  });
}

async function getSha256(assetPath: string) {
  const asset = await Deno.open(assetPath, { read: true });

  const readableStream = asset.readable;
  const fileHashBuffer = new Uint8Array(await crypto.subtle.digest("SHA-256", readableStream));

  return `sha256-${base64.encode(fileHashBuffer)}`;
}

export async function replaceIntegrity(html: string, callback: (path: string) => Promise<string>): Promise<string> {
  const parser = new DOMParser();
  const document = parser.parseFromString(html, "text/html");

  const processNode = async (node: Element) => {
    if (node.tagName === "LINK" || node.tagName === "SCRIPT") {
      const integrity = node.attributes.getNamedItem("integrity");
      const path = node.attributes.getNamedItem("href") || node.attributes.getNamedItem("src");

      if (integrity?.value === "[INTEGRITY]") {
        const newIntegrity = await callback(path?.value!.split("?")[0]!);
        integrity.value = newIntegrity;
      }
    }

    for (const child of node.children) {
      await processNode(child);
    }
  };

  for (const node of document.documentElement!.children) {
    await processNode(node);
  }

  function doctype(node: DocumentType) {
    return (
      `<!DOCTYPE ${node.name}` +
      (node.publicId ? ` PUBLIC "${node.publicId}"` : "") +
      (!node.publicId && node.systemId ? " SYSTEM" : "") +
      (node.systemId ? ` "${node.systemId}"` : "") +
      ">"
    );
  }

  return doctype(document.doctype!) + "\n" + document.documentElement!.outerHTML;
}
