package main

import (
	"image"
	"image/color"
	"os"
	"strings"
	"testing"

	"github.com/charmbracelet/x/ansi"
)

func TestBlockImagePreservesQuadrantDetail(t *testing.T) {
	img := image.NewRGBA(image.Rect(0, 0, 2, 2))
	img.SetRGBA(0, 0, color.RGBA{R: 255, G: 255, B: 255, A: 255})
	lines := blockImage(img, 1, 1)
	if len(lines) != 1 || !strings.Contains(lines[0], "▘") || ansi.StringWidth(lines[0]) != 1 {
		t.Fatalf("quadrant was not rendered in one cell: %q", lines)
	}
}

func TestCoverRendererStaysInTextProtocol(t *testing.T) {
	t.Setenv("TERM", "xterm-kitty")
	t.Setenv("NO_COLOR", "")
	if err := os.Unsetenv("NO_COLOR"); err != nil {
		t.Fatal(err)
	}
	t.Setenv("MELODY_IMAGES", "kitty")
	if got := detectRenderer(); got != rendererBlocks {
		t.Fatalf("kitty override must use clip-safe blocks, got %v", got)
	}
	cover := []byte(`<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10" fill="#ff0000"/></svg>`)
	lines, err := renderCover(cover, 2, detectRenderer())
	if err != nil || len(lines) != 2 {
		t.Fatalf("renderCover: lines=%q err=%v", lines, err)
	}
	for _, line := range lines {
		if strings.Contains(line, "\x1b_G") || ansi.StringWidth(line) != 4 {
			t.Fatalf("line is not clip-safe text of width 4: %q", line)
		}
	}
	t.Setenv("MELODY_IMAGES", "none")
	if detectRenderer() != rendererNone {
		t.Fatal("none override did not disable images")
	}
}

func TestMonochromeCoverHonorsEnvironment(t *testing.T) {
	cover := []byte(`<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10" fill="#ffffff"/></svg>`)
	t.Setenv("TERM", "xterm")
	t.Setenv("MELODY_IMAGES", "kitty")
	t.Setenv("NO_COLOR", "1")
	if detectRenderer() != rendererMono {
		t.Fatal("NO_COLOR must select monochrome rendering")
	}
	lines, err := renderCover(cover, 2, detectRenderer())
	if err != nil || len(lines) != 2 || lines[0] != "@@@@" || lines[1] != "@@@@" {
		t.Fatalf("unexpected monochrome cover: lines=%q err=%v", lines, err)
	}
	t.Setenv("NO_COLOR", "")
	if detectRenderer() != rendererMono {
		t.Fatal("empty NO_COLOR must select monochrome rendering")
	}
	if err := os.Unsetenv("NO_COLOR"); err != nil {
		t.Fatal(err)
	}
	t.Setenv("TERM", "dumb")
	if detectRenderer() != rendererMono {
		t.Fatal("dumb terminal must select monochrome rendering")
	}
	t.Setenv("MELODY_IMAGES", "none")
	if detectRenderer() != rendererNone {
		t.Fatal("none must take precedence over monochrome rendering")
	}
}
