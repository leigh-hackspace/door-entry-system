{
  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-24.11";
  inputs.flake-utils.url = "github:numtide/flake-utils";

  outputs = { self, nixpkgs, flake-utils, ... }:
    flake-utils.lib.eachDefaultSystem (system:

      let pkgs = import nixpkgs { inherit system; };
      in {
        packages.default = let
          hashes = {
            aarch64-darwin =
              "sha256-Lzu8tpfgUp06Oc6NF96YOgKYxQO7PiapabjO0kO+PZ0=";
            x86_64-linux =
              "sha256-oNMycMnE4nFlbNEQgw+K9DoPyPSvLJ7IcM3pCvz0TL0=";
          };
        in pkgs.stdenv.mkDerivation {
          pname = "door-entry-bluetooth-web-app";
          version = "0.1.0";

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

            mkdir -p /tmp/build-inner
            mv * /tmp/build-inner/
            cd /tmp/build-inner

            ${pkgs.deno}/bin/deno i

            ${pkgs.deno}/bin/deno task build

            mkdir -p $out/bin
            mkdir -p $out/lib/frontend

            cp -a web $out/lib/frontend/

            echo "Compiling frontend..."
            ${pkgs.deno}/bin/deno compile --cached-only --no-code-cache --allow-read --allow-net --allow-env -o $out/bin/door-entry-bluetooth-web-app server.ts

            rm -rf /tmp/build-inner
          '';
        };
      });
}
