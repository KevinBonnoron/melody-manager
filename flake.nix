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

          # Desktop client (Wails): it builds against the system webview rather
          # than shipping one, so the headers have to be here.
          pkg-config
          gtk4
          webkitgtk_6_0
        ];

        # Playwright downloads browsers that a Nix system cannot run: they are
        # dynamically linked against paths that do not exist here. The store has
        # patched ones, and the npm package must be pinned to the same version
        # as this driver or it refuses to use them.
        PLAYWRIGHT_BROWSERS_PATH = "${pkgs.playwright-driver.browsers}";
        PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD = "1";
        PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS = "true";

        shellHook = ''
          if [ ! -d "$PWD/node_modules" ]; then
            echo "→ Dependencies missing. Run: bun install"
          fi
          lefthook install
        '';
      };
    };
}
