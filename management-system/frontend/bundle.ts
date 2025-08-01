import { assertUnreachable } from "@door-entry-management-system/common";
import * as esbuild from "esbuild";
import { solidPlugin } from "esbuild-plugin-solid";
import { denoLoader, denoResolver } from "jsr:@duesabati/esbuild-deno-plugin@0.2.6";
import path from "node:path";
import * as v from "valibot";

const mode = v.parse(v.picklist(["--watch", "--build"]), Deno.args[0]);

const denoJsonPath = path.resolve("../deno.json");
const version = JSON.parse(Deno.readTextFileSync(denoJsonPath)).version;

const ctx = await esbuild.context({
  plugins: [
    denoResolver({
      configPath: denoJsonPath,
    }),

    // Solid handles the JSX, so it needs to be sandwiched between the deno plugins
    solidPlugin({
      solid: {
        moduleName: "npm:solid-js/web",
      },
    }),

    denoLoader({
      configPath: denoJsonPath,
    }),
  ],

  define: { "process.env.VERSION": JSON.stringify(version) },

  absWorkingDir: import.meta.dirname,
  entryPoints: ["src/app.tsx"],
  outdir: "web/js/",
  bundle: true,
  platform: "browser",
  target: "esnext",
  minify: false,
  sourcemap: false,
  treeShaking: true,
  jsx: "automatic",
  jsxImportSource: "npm:solid-js",
});

if (mode === "--watch") {
  await ctx.watch();
} else if (mode === "--build") {
  await ctx.rebuild();
  console.log("==== Built Frontend ====");
  await ctx.dispose();
} else {
  assertUnreachable(mode);
}
