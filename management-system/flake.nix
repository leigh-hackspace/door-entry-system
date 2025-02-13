{
  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-24.11";
  inputs.flake-utils.url = "github:numtide/flake-utils";

  outputs = { self, nixpkgs, flake-utils, ... }:
    flake-utils.lib.eachDefaultSystem (system:

      let pkgs = import nixpkgs { inherit system; };
      in {
        devShell = pkgs.mkShell {
          buildInputs = with pkgs; [ git deno gnused sass nixpkgs-fmt ];
        };

        packages.default = let
          hashes = {
            aarch64-darwin = "sha256-N4GxH/ItKUSatEq7NiMqgzvIS5bIZ8u9itKoVdhTz6g=";
            x86_64-linux = "sha256-t5xoRlcHgP3kszvDU4BnDnkYTca1NLEFHrr9NGbHw2g=";
          };
        in pkgs.stdenv.mkDerivation {
          pname = "door-entry-management-system";
          version = (builtins.fromJSON (builtins.readFile ./deno.json)).version;

          src = ./.;

          nativeBuildInputs = with pkgs; [ deno ];

          dontFixup = true;
          dontPatchShebangs = true;

          outputHashAlgo = "sha256";
          outputHashMode = "recursive";
          outputHash = hashes.${system};

          installPhase = ''
            shopt -s extglob

            export HOME="$(mktemp -d)"

            ${pkgs.deno}/bin/deno i
            ${pkgs.deno}/bin/deno cache server.ts

            ${pkgs.deno}/bin/deno task build

            mkdir -p $out/bin
            mkdir -p $out/lib/frontend

            cp -a deno.json       $out/lib/frontend/
            cp -a frontend/web    $out/lib/frontend/

            echo "Compiling backend..."
            ${pkgs.deno}/bin/deno compile --cached-only --no-code-cache --allow-read --allow-net --allow-env -o $out/bin/door-entry-management-system-backend   backend/src/index.ts
            echo "Compiling frontend..."
            ${pkgs.deno}/bin/deno compile --cached-only --no-code-cache --allow-read --allow-net --allow-env -o $out/bin/door-entry-management-system-frontend  frontend/server.ts
          '';
        };
      });
}
