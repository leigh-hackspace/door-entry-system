{
  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = { self, nixpkgs, flake-utils, ... }:
    flake-utils.lib.eachDefaultSystem (system:

      let pkgs = import nixpkgs { inherit system; };
      in {
        devShell = pkgs.mkShell {
          buildInputs = with pkgs; [ git deno gnused sass nixpkgs-fmt ];
        };

        packages.default = pkgs.stdenv.mkDerivation {
          pname = "door-entry-management-system";
          version = (builtins.fromJSON (builtins.readFile ./deno.json)).version;

          src = ./.;

          nativeBuildInputs = with pkgs; [ deno ];

          dontFixup = true;
          dontPatchShebangs = true;

          __noChroot = true;

          installPhase = ''
            shopt -s extglob

            export HOME="$(mktemp -d)"

            ${pkgs.deno}/bin/deno i
            ${pkgs.deno}/bin/deno cache frontend/bundle.ts
            ${pkgs.deno}/bin/deno cache frontend/server.ts

            ${pkgs.deno}/bin/deno task build

            mkdir -p $out/bin
            mkdir -p $out/lib/frontend

            cp -a deno.json       $out/lib/
            cp -a frontend/web    $out/lib/frontend/

            echo "Compiling backend..."
            ${pkgs.deno}/bin/deno compile --cached-only --no-code-cache --allow-read --allow-net --allow-env --allow-sys -o $out/bin/door-entry-management-system-backend   backend/src/index.ts
            echo "Compiling frontend..."
            ${pkgs.deno}/bin/deno compile --cached-only --no-code-cache --allow-read --allow-net --allow-env -o $out/bin/door-entry-management-system-frontend  frontend/server.ts
          '';
        };
      });
}
