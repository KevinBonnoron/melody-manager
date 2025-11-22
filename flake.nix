{
  description = "MelodyManager development environment";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";

  outputs = { self, nixpkgs }:
    let
      system = "x86_64-linux";
      pkgs = nixpkgs.legacyPackages.${system};
    in
    {
      devShells.${system}.default = pkgs.mkShell {
        packages = with pkgs; [
          bun
          pocketbase
          mailpit
          ffmpeg
          yt-dlp
          nodejs
          jdk21
          gradle
        ];

        shellHook = ''
          if [ ! -d "$PWD/node_modules" ]; then
            echo "→ Installing dependencies..."
            bun install
          fi
        '';
      };
    };
}
