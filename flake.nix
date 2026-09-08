{
  description = "MelodyManager development environment";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";

  outputs = { self, nixpkgs }:
    let
      system = "x86_64-linux";
      pkgs = nixpkgs.legacyPackages.${system};
      # nixpkgs lags upstream yt-dlp, and YouTube breaks older versions
      # (bot detection). Pin a recent release. To bump: set version, then
      # `nix store prefetch-file <pypi-sdist-url>` for the hash.
      yt-dlp-latest = pkgs.yt-dlp.overrideAttrs (old: rec {
        version = "2026.8.19";
        src = pkgs.fetchPypi {
          pname = "yt_dlp";
          inherit version;
          hash = "sha256-niE+SM6jXGazeOREeQPxGPY5Kl+jgKK21wcOyG9OCvE=";
        };
        # nixpkgs' postPatch rewrites version.py (UPDATE_HINT) which moved in
        # newer upstream; drop it for the bump.
        postPatch = "";
        doCheck = false;
        doInstallCheck = false;
      });
    in
    {
      devShells.${system}.default = pkgs.mkShell {
        packages = with pkgs; [
          bun
          go
          gopls
          go-task
          pocketbase
          mailpit
          ffmpeg
          yt-dlp-latest
          nodejs
          jdk21
          gradle
          lefthook
        ];

        shellHook = ''
          if [ ! -d "$PWD/node_modules" ]; then
            echo "→ Dependencies missing. Run: bun install"
          fi
          lefthook install
        '';
      };
    };
}
