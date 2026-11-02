package main

import (
	"bytes"
	"fmt"
	"image"
	"image/draw"
	_ "image/gif"
	_ "image/jpeg"
	_ "image/png"
	"os"
	"strings"

	"github.com/srwiley/oksvg"
	"github.com/srwiley/rasterx"
	xdraw "golang.org/x/image/draw"
	_ "golang.org/x/image/webp"
)

// Covers use terminal text cells so they can be safely clipped and redrawn.
type renderer int

const (
	rendererNone renderer = iota
	rendererBlocks
	rendererMono
)

// Kitty graphics escapes cannot safely pass through the TUI's text clipping.
// Explicit kitty and blocks requests use text, respecting NO_COLOR and dumb terminals.
func detectRenderer() renderer {
	if strings.EqualFold(os.Getenv("MELODY_IMAGES"), "none") {
		return rendererNone
	}
	_, noColor := os.LookupEnv("NO_COLOR")
	if noColor || strings.EqualFold(os.Getenv("TERM"), "dumb") {
		return rendererMono
	}

	return rendererBlocks
}

// renderCover turns image bytes into the lines that draw them, each line one
// terminal row, so the caller can lay a track list out beside it.
func renderCover(data []byte, rows int, how renderer) ([]string, error) {
	if how == rendererNone || len(data) == 0 || rows <= 0 {
		return nil, nil
	}

	source, _, err := image.Decode(bytes.NewReader(data))
	if err != nil {
		icon, svgErr := oksvg.ReadIconStream(bytes.NewReader(data))
		if svgErr != nil {
			return nil, err
		}
		size := rows * 4
		if size < 256 {
			size = 256
		}
		canvas := image.NewRGBA(image.Rect(0, 0, size, size))
		icon.SetTarget(0, 0, float64(size), float64(size))
		icon.Draw(rasterx.NewDasher(size, size, rasterx.NewScannerGV(size, size, canvas, canvas.Bounds())), 1)
		source = canvas
	}

	// A cell is about twice as tall as it is wide, so a square cover needs twice
	// as many columns as rows to come out square.
	cols := rows * 2
	if how == rendererMono {
		return monochromeImage(source, cols, rows), nil
	}

	return blockImage(source, cols, rows), nil
}

// Use ASCII density rather than terminal colour or Unicode graphics so even a
// dumb terminal can display a recognizable, clip-safe approximation.
func monochromeImage(source image.Image, cols, rows int) []string {
	pixels := image.NewRGBA(image.Rect(0, 0, cols, rows))
	xdraw.CatmullRom.Scale(pixels, pixels.Bounds(), source, source.Bounds(), draw.Src, nil)
	const shades = " .:-=+*#%@"
	lines := make([]string, rows)
	for row := range rows {
		var line strings.Builder
		line.Grow(cols)
		for col := range cols {
			p := pixels.RGBAAt(col, row)
			luminance := 299*int(p.R) + 587*int(p.G) + 114*int(p.B)
			line.WriteByte(shades[luminance*(len(shades)-1)/255000])
		}
		lines[row] = line.String()
	}
	return lines
}

// Each cell approximates four image pixels with two colours and a quadrant
// glyph. Choose the partition with the least squared RGB error. Resampling
// before quantization avoids the aliasing of point-sampled cover art.
func blockImage(source image.Image, cols, rows int) []string {
	pixels := image.NewRGBA(image.Rect(0, 0, cols*2, rows*2))
	xdraw.CatmullRom.Scale(pixels, pixels.Bounds(), source, source.Bounds(), draw.Src, nil)
	glyphs := [...]rune{' ', '▘', '▝', '▀', '▖', '▌', '▞', '▛'}
	lines := make([]string, rows)
	for row := range rows {
		var line strings.Builder
		for col := range cols {
			var colors [4][3]int
			for i := range colors {
				p := pixels.RGBAAt(col*2+i%2, row*2+i/2)
				colors[i] = [3]int{int(p.R), int(p.G), int(p.B)}
			}
			bestError := int(^uint(0) >> 1)
			var bestFG, bestBG [3]int
			bestMask := 0
			// The fourth quadrant is always background; complementary
			// partitions describe the same image with the colours swapped.
			for mask := range 8 {
				var sums [2][3]int
				var counts [2]int
				for i, c := range colors {
					group := (mask >> i) & 1
					counts[group]++
					for channel := range c {
						sums[group][channel] += c[channel]
					}
				}
				var means [2][3]int
				for group := range means {
					if counts[group] != 0 {
						for channel := range means[group] {
							means[group][channel] = (sums[group][channel] + counts[group]/2) / counts[group]
						}
					}
				}
				errorSum := 0
				for i, c := range colors {
					group := (mask >> i) & 1
					for channel := range c {
						delta := c[channel] - means[group][channel]
						errorSum += delta * delta
					}
				}
				if errorSum < bestError {
					bestError, bestMask = errorSum, mask
					bestBG, bestFG = means[0], means[1]
				}
			}
			fmt.Fprintf(&line, "\x1b[38;2;%d;%d;%dm\x1b[48;2;%d;%d;%dm%c",
				bestFG[0], bestFG[1], bestFG[2], bestBG[0], bestBG[1], bestBG[2], glyphs[bestMask])
		}
		line.WriteString("\x1b[0m")
		lines[row] = line.String()
	}
	return lines
}
