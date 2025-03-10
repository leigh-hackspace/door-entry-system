import { denoPlugins } from "jsr:@luca/esbuild-deno-loader@0.11.1";
import path from "node:path";
import * as esbuild from "npm:esbuild";
import { solidPlugin } from "npm:esbuild-plugin-solid";
import * as v from "npm:valibot";

const mode = v.parse(v.picklist(["--watch", "--build"]), Deno.args[0]);

const [denoResolver, denoLoader] = [...denoPlugins({})];

const denoJsonPath = path.resolve("deno.json");
const version = JSON.parse(Deno.readTextFileSync(denoJsonPath)).version;

const ctx = await esbuild.context({
  plugins: [
    denoResolver,

    // Solid handles the JSX, so it needs to be sandwiched between the deno plugins
    solidPlugin({
      solid: {
        moduleName: "npm:solid-js/web",
      },
    }) as esbuild.Plugin,

    denoLoader,
  ],

  define: { "process.env.VERSION": JSON.stringify(version) },

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
}
