{
  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-24.11";
  inputs.flake-utils.url = "github:numtide/flake-utils";

  outputs = { self, nixpkgs, flake-utils, ... }:
    flake-utils.lib.eachDefaultSystem (system:

      let pkgs = import nixpkgs { inherit system; };
      in {
        packages.default = let
          hashes = {
            aarch64-darwin = "sha256-NzvIoWv+Q1NETXNC6SUzv2HOAwKafVpXuurM6+WOpG0=";
            x86_64-linux = "sha256-abdO/ckhxkc5JJqdOt14jInQfopdhMplha1Z7kSbYfA=";
          };
        in pkgs.stdenv.mkDerivation {
          pname = "door-entry-bluetooth-web-app";
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

            cp -a deno.json $out/lib/frontend/
            cp -a web       $out/lib/frontend/

            echo "Compiling frontend..."
            ${pkgs.deno}/bin/deno compile --cached-only --no-code-cache --allow-read --allow-net --allow-env -o $out/bin/door-entry-bluetooth-web-app server.ts
          '';
        };
      });
}
