package main

import (
	"fmt"
	"math"
	"strings"

	"github.com/charmbracelet/lipgloss"
	"github.com/charmbracelet/x/ansi"
)

type uiPalette struct {
	enabled                       bool
	accent, purple, green, yellow lipgloss.Color
	text, muted, border, onAccent lipgloss.Color
}

func newUIPalette() uiPalette {
	return uiPalette{
		enabled: terminalColorEnabled(),
		accent:  lipgloss.Color("#89B4FA"), purple: lipgloss.Color("#CBA6F7"),
		green: lipgloss.Color("#A6E3A1"), yellow: lipgloss.Color("#F9E2AF"),
		text: lipgloss.Color("#CDD6F4"), muted: lipgloss.Color("#A6ADC8"),
		border: lipgloss.Color("#585B70"), onAccent: lipgloss.Color("#11111B"),
	}
}

func (p uiPalette) foreground(color lipgloss.Color) lipgloss.Style {
	style := lipgloss.NewStyle()
	if p.enabled {
		style = style.Foreground(color)
	}
	return style
}

func (p uiPalette) badge(text string, background lipgloss.Color) string {
	style := lipgloss.NewStyle().Bold(true).Padding(0, 1)
	if p.enabled {
		style = style.Foreground(p.onAccent).Background(background)
	}
	return style.Render(text)
}

func (p uiPalette) panel(body string, width int) string {
	if width < 8 {
		return body
	}
	style := lipgloss.NewStyle().Border(lipgloss.RoundedBorder()).Width(width - 2)
	if p.enabled {
		style = style.BorderForeground(p.border)
	}
	return style.Render(body)
}

func fitLine(text string, width int) string {
	if width <= 0 {
		return ""
	}
	return lipgloss.NewStyle().Width(width).MaxWidth(width).Render(ansi.Truncate(text, width, "…"))
}

func leftRight(left, right string, width int) string {
	if width <= 0 {
		return ""
	}
	rightWidth := ansi.StringWidth(right)
	leftWidth := width - rightWidth - 1
	if leftWidth < 1 {
		return fitLine(left, width)
	}
	return fitLine(left, leftWidth) + " " + fitLine(right, rightWidth)
}

type playerItem struct {
	kind, title, meta string
	rating            string
	playing           bool
}

func (m *playerModel) visibleItems() []playerItem {
	if m.library == nil {
		return nil
	}
	if m.detail {
		tracks := m.selectedTracks()
		items := make([]playerItem, 0, len(tracks))
		for i, track := range tracks {
			items = append(items, playerItem{
				kind: fmt.Sprintf("%02d", i+1), title: cleanText(track.Title), meta: cleanText(track.artist),
				rating: m.ratings[track.ID].Value, playing: m.isCurrentTrack(track.ID),
			})
		}
		return items
	}
	items := make([]playerItem, 0, len(m.filtered))
	for _, index := range m.filtered {
		switch {
		case index == -1:
			items = append(items, playerItem{kind: "QUEUE", title: "All tracks", meta: fmt.Sprintf("%d tracks", len(m.filteredTracks))})
		case index < -1:
			track := m.filteredTracks[-index-2]
			meta := cleanText(track.artist)
			if track.album != "" {
				meta += " · " + cleanText(track.album)
			}
			items = append(items, playerItem{kind: "TRACK", title: cleanText(track.Title), meta: meta, rating: m.ratings[track.ID].Value, playing: m.isCurrentTrack(track.ID)})
		default:
			album := m.library.Albums[index]
			items = append(items, playerItem{kind: "ALBUM", title: cleanText(album.Album.Name), meta: cleanText(album.Artist), playing: m.isCurrentAlbum(album.Album.ID)})
		}
	}
	return items
}

func (m *playerModel) isCurrentTrack(id string) bool {
	return m.playing && m.playingIndex >= 0 && m.playingIndex < len(m.queue) && m.queue[m.playingIndex].ID == id
}

func (m *playerModel) isCurrentAlbum(id string) bool {
	return id != "" && m.playing && m.playingIndex >= 0 && m.playingIndex < len(m.queue) && m.queue[m.playingIndex].Album == id
}

func renderPlayerItem(item playerItem, selected bool, width int, palette uiPalette) string {
	if width <= 0 {
		return ""
	}
	prefix := "  "
	if selected {
		prefix = palette.foreground(palette.accent).Bold(true).Render("› ")
	}
	badgeColor := palette.accent
	if item.kind == "TRACK" || item.playing {
		badgeColor = palette.purple
	}
	if item.playing {
		badgeColor = palette.green
	}
	badge := lipgloss.NewStyle().Width(7).Render(palette.badge(item.kind, badgeColor))
	titleStyle := palette.foreground(palette.text)
	if item.playing {
		titleStyle = palette.foreground(palette.green).Bold(true)
	}
	rating := "  "
	if item.rating == "like" {
		rating = palette.foreground(palette.green).Render("♥ ")
	} else if item.rating == "dislike" {
		rating = palette.foreground(palette.yellow).Render("× ")
	}
	contentWidth := max(width-12, 1) // Selection, badge, rating and their spacing.
	titleWidth := max(contentWidth/2, 1)
	metaWidth := contentWidth - titleWidth
	title := lipgloss.NewStyle().Width(titleWidth).MaxWidth(titleWidth).Render(
		titleStyle.Render(ansi.Truncate(item.title, titleWidth, "…")),
	)
	meta := ""
	if item.meta != "" && metaWidth > 0 {
		meta = palette.foreground(palette.muted).Render(ansi.Truncate("  "+item.meta, metaWidth, "…"))
	}
	row := prefix + badge + " " + rating + title + meta
	style := lipgloss.NewStyle().Width(width).MaxWidth(width)
	if selected {
		style = style.Bold(true)
	}
	return style.Render(ansi.Truncate(row, width, "…"))
}

func (m *playerModel) headerView(width int, palette uiPalette) []string {
	logoText := "♪ MELODY MANAGER"
	if !palette.enabled {
		logoText = "MELODY MANAGER"
	}
	logo := palette.badge(logoText, palette.purple)
	header := leftRight(logo, palette.foreground(palette.muted).Render("? HELP"), width)

	var title, subtitle string
	switch {
	case m.searching || m.searchResults:
		title = "Search results"
		subtitle = fmt.Sprintf("%d albums and tracks", len(m.filtered))
	case m.detail:
		title = "All tracks"
		if album := m.selectedAlbum(); album != nil {
			title = cleanText(album.Album.Name)
			subtitle = cleanText(album.Artist)
			if album.Album.Year > 0 {
				subtitle += fmt.Sprintf(" · %d", album.Album.Year)
			}
		}
	default:
		title = "Your library"
		if m.library != nil {
			subtitle = fmt.Sprintf("%d albums · %d tracks", len(m.library.Albums), len(m.library.Tracks))
		}
	}
	return []string{header, leftRight(palette.foreground(palette.text).Bold(true).Render(title), palette.foreground(palette.muted).Render(subtitle), width)}
}

func (m *playerModel) libraryView(height, width int, palette uiPalette) string {
	items := m.visibleItems()
	selected, offset := m.albumIndex, m.albumOffset
	if m.detail {
		selected, offset = m.trackIndex, m.trackOffset
	}
	if len(items) == 0 {
		selected = -1
	}
	offset = scrollOffset(offset, selected, len(items), height)
	if m.detail {
		m.trackOffset = offset
	} else {
		m.albumOffset = offset
	}

	listWidth := width
	lines := make([]string, height)
	for row := range height {
		index := offset + row
		item := ""
		switch {
		case m.loading && row == 0:
			item = m.spinner.View() + " Loading your library…"
		case index >= 0 && index < len(items):
			item = renderPlayerItem(items[index], index == selected, listWidth, palette)
		case len(items) == 0 && row == 0:
			item = palette.foreground(palette.muted).Render("No matching albums or tracks.")
		}
		lines[row] = fitLine(item, listWidth)
	}
	return strings.Join(lines, "\n")
}

func (m *playerModel) playbackDuration() float64 {
	if !m.playing || m.playingIndex < 0 || m.playingIndex >= len(m.queue) {
		return 0
	}
	duration := m.queue[m.playingIndex].Duration
	if math.IsNaN(duration) || math.IsInf(duration, 0) || duration < 0 {
		return 0
	}
	return duration
}

func (m *playerModel) playerView(width int, palette uiPalette) string {
	artworkWidth := 0
	if len(m.cover) > 0 && width >= 24 {
		artworkWidth = m.coverRows*2 + 2
	}
	contentWidth := max(width-artworkWidth, 1)
	state, stateColor := "READY", palette.accent
	title := "Choose something to play"
	meta := "Browse your library or press / to search"
	if m.status != "" {
		state, title = "INFO", cleanText(m.status)
		meta = "Playback is shared with your other devices"
	} else if m.coverErr != "" {
		state, title = "INFO", cleanText(m.coverErr)
	}
	if m.playing && m.playingIndex >= 0 && m.playingIndex < len(m.queue) {
		track := m.queue[m.playingIndex]
		state, stateColor = "PLAYING", palette.green
		if m.paused {
			state, stateColor = "PAUSED", palette.yellow
		} else if !m.ready {
			state, stateColor = "LOADING", palette.yellow
		}
		title = cleanText(track.Title)
		meta = cleanText(track.artist)
		if track.album != "" {
			meta += " · " + cleanText(track.album)
		}
	}
	stateBadge := palette.badge(state, stateColor)
	repeat := palette.foreground(palette.muted).Render("Repeat " + m.repeat.String())
	if m.repeat != repeatOff {
		repeat = palette.foreground(palette.muted).Render("Repeat ") +
			palette.foreground(palette.accent).Render(m.repeat.String())
	}
	firstLine := leftRight(stateBadge+" "+palette.foreground(palette.text).Bold(true).Render(title), repeat, contentWidth)

	indicator := "◇"
	if m.playing && m.paused {
		indicator = "II"
	} else if m.playing && !m.ready {
		indicator = m.spinner.View()
	} else if m.playing {
		indicator = "▶"
	}
	secondLine := palette.foreground(palette.muted).Render(indicator + " " + meta)
	queueText := ""
	if m.playing && len(m.queue) > 0 {
		queueText = fmt.Sprintf("TRACK %d OF %d", m.playingIndex+1, len(m.queue))
	}
	queueLine := palette.foreground(palette.muted).Render(queueText)

	positionKnown := m.ready || (m.playing && m.sharedReady)
	position := m.position
	if !positionKnown || math.IsNaN(position) || math.IsInf(position, 0) || position < 0 {
		position = 0
	}
	duration := m.playbackDuration()
	positionText, durationText := "0:00", "--:--"
	if positionKnown {
		positionText = formatPlaybackTime(position)
	}
	if duration > 0 {
		durationText = formatPlaybackTime(duration)
	}
	timing := positionText + " / " + durationText
	m.progress.Width = max(contentWidth-ansi.StringWidth(timing)-1, 3)
	progressLine := leftRight(m.progress.View(), palette.foreground(palette.muted).Render(timing), contentWidth)
	contentLines := []string{firstLine, secondLine, queueLine, progressLine}
	if artworkWidth == 0 {
		return strings.Join(contentLines, "\n")
	}
	for i, line := range contentLines {
		artwork := strings.Repeat(" ", m.coverRows*2)
		if i < len(m.cover) {
			artwork = m.cover[i]
		}
		contentLines[i] = artwork + "  " + fitLine(line, contentWidth)
	}
	return strings.Join(contentLines, "\n")
}

func (m *playerModel) searchView(width int, palette uiPalette) string {
	cursor := "█"
	if m.animationFrame/5%2 == 1 {
		cursor = " "
	}
	prefix := palette.badge("SEARCH", palette.accent) + " "
	if ansi.StringWidth(prefix) >= width {
		prefix = ""
	}
	hint := palette.foreground(palette.muted).Render(fmt.Sprintf("%d results  ·  Enter validate  ·  → play  ·  Esc done", len(m.filtered)))
	inputWidth := width
	if ansi.StringWidth(hint)+ansi.StringWidth(prefix)+9 <= width {
		inputWidth = width - ansi.StringWidth(hint) - 1
	} else {
		hint = ""
	}
	queryWidth := max(inputWidth-ansi.StringWidth(prefix), 1)
	query := cleanText(m.query) + cursor
	if overflow := ansi.StringWidth(query) - queryWidth; overflow > 0 {
		query = ansi.TruncateLeft(query, overflow+1, "…")
	}
	input := prefix + palette.foreground(palette.text).Render(query)
	if hint == "" {
		return fitLine(input, width)
	}
	return leftRight(input, hint, width)
}

func renderPlayerBase(m *playerModel) string {
	if m.width <= 0 || m.height <= 0 {
		return ""
	}
	m.ensureComponents()
	palette := newUIPalette()
	m.spinner.Style = palette.foreground(palette.accent)
	lines := m.headerView(m.width, palette)

	libraryHeight := m.listHeight()
	libraryWidth := m.width
	borderedLibrary := m.height >= 12 && m.width >= 8
	if borderedLibrary {
		libraryWidth -= 2
	}
	library := m.libraryView(libraryHeight, libraryWidth, palette)
	if borderedLibrary {
		library = palette.panel(library, m.width)
	}
	lines = append(lines, strings.Split(library, "\n")...)

	playerWidth := m.width
	if m.width >= 8 {
		playerWidth -= 2
	}
	player := palette.panel(m.playerView(playerWidth, palette), m.width)
	lines = append(lines, strings.Split(player, "\n")...)

	if len(lines) > m.height {
		lines = lines[:m.height]
	}
	for len(lines) < m.height {
		lines = append(lines, "")
	}
	for i := range lines {
		lines[i] = ansi.Truncate(lines[i], m.width, "")
	}
	return strings.Join(lines, "\n")
}

func (m *playerModel) searchModal(width, height int, palette uiPalette) string {
	modalWidth := min(120, width-4)
	if modalWidth < 20 {
		modalWidth = width
	}
	modalHeight := min(24, max(height-4, 5))
	contentWidth := modalWidth - 2
	contentHeight := modalHeight - 2
	if contentWidth < 1 || contentHeight < 4 {
		return ""
	}
	resultHeight := contentHeight - 3
	content := make([]string, 0, contentHeight)
	title := palette.foreground(palette.text).Bold(true).Render("Find in your library")
	content = append(content, leftRight(title, palette.foreground(palette.muted).Render("ESC CLOSE"), contentWidth))

	items := m.visibleItems()
	selected := m.albumIndex
	if len(items) == 0 {
		selected = -1
	}
	m.albumOffset = scrollOffset(m.albumOffset, selected, len(items), resultHeight)
	for row := range resultHeight {
		index := m.albumOffset + row
		line := ""
		if index >= 0 && index < len(items) {
			line = renderPlayerItem(items[index], index == selected, contentWidth, palette)
		} else if len(items) == 0 && row == 0 {
			line = palette.foreground(palette.muted).Render("No matching albums or tracks.")
		}
		content = append(content, fitLine(line, contentWidth))
	}
	content = append(content, fitLine("", contentWidth), m.searchView(contentWidth, palette))
	return palette.panel(strings.Join(content, "\n"), modalWidth)
}

func helpRow(key, description string, width int, palette uiPalette) string {
	keyColumn := lipgloss.NewStyle().Width(12).Render(palette.foreground(palette.accent).Bold(true).Render(key))
	return fitLine(keyColumn+palette.foreground(palette.text).Render(description), width)
}

func (m *playerModel) helpModal(width int, palette uiPalette) string {
	modalWidth := min(76, width-4)
	if modalWidth < 24 {
		modalWidth = width
	}
	contentWidth := modalWidth - 2
	if contentWidth < 1 {
		return ""
	}
	title := palette.foreground(palette.text).Bold(true).Render("Keyboard shortcuts")
	lines := []string{
		leftRight(title, palette.foreground(palette.muted).Render("ESC CLOSE"), contentWidth),
		"",
		palette.foreground(palette.purple).Bold(true).Render("NAVIGATION"),
		helpRow("↑ ↓ / j k", "Move the selection", contentWidth, palette),
		helpRow("← → / h l", "Go back or open the selection", contentWidth, palette),
		helpRow("Enter", "Open an album or play a track", contentWidth, palette),
		helpRow("/", "Search the library", contentWidth, palette),
		helpRow("Esc", "Go back or close a panel", contentWidth, palette),
		"",
		palette.foreground(palette.purple).Bold(true).Render("TRACK RATING"),
		helpRow("f", "Toggle like on the selected track", contentWidth, palette),
		helpRow("d", "Toggle dislike on the selected track", contentWidth, palette),
		"",
		palette.foreground(palette.purple).Bold(true).Render("PLAYBACK"),
		helpRow("Space", "Pause or resume", contentWidth, palette),
		helpRow(", / .", "Seek backward / forward 5 seconds", contentWidth, palette),
		helpRow("n / p", "Next / previous track once when released", contentWidth, palette),
		helpRow("s", "Leave shared playback", contentWidth, palette),
		helpRow("r", "Repeat: off → all → one", contentWidth, palette),
		helpRow("?", "Toggle these shortcuts", contentWidth, palette),
		helpRow("q", "Quit Melody", contentWidth, palette),
	}
	return palette.panel(strings.Join(lines, "\n"), modalWidth)
}

func overlayModal(base, modal string, width, height int) string {
	if modal == "" {
		return base
	}
	lines := strings.Split(base, "\n")
	modalLines := strings.Split(modal, "\n")
	modalWidth := lipgloss.Width(modal)
	x := max((width-modalWidth)/2, 0)
	y := max((height-len(modalLines))/2, 0)
	for row, line := range modalLines {
		target := y + row
		if target >= len(lines) {
			break
		}
		left := ansi.Cut(lines[target], 0, x)
		right := ansi.Cut(lines[target], x+modalWidth, width)
		lines[target] = left + line + right
	}
	return strings.Join(lines, "\n")
}

func renderPlayer(m *playerModel) string {
	if m.width <= 0 || m.height <= 0 {
		return ""
	}
	if m.helpOpen {
		palette := newUIPalette()
		return overlayModal(renderPlayerBase(m), m.helpModal(m.width, palette), m.width, m.height)
	}
	if !m.searching {
		return renderPlayerBase(m)
	}

	saved := m.searchReturn
	query, filtered, filteredTracks := m.query, m.filtered, m.filteredTracks
	detail, searchResults := m.detail, m.searchResults
	albumIndex, trackIndex := m.albumIndex, m.trackIndex
	albumOffset, trackOffset := m.albumOffset, m.trackOffset
	m.searching = false
	m.query = saved.query
	m.filtered = saved.filtered
	m.filteredTracks = saved.filteredTracks
	m.detail, m.searchResults = saved.detail, saved.searchResults
	m.albumIndex, m.trackIndex = saved.albumIndex, saved.trackIndex
	m.albumOffset, m.trackOffset = saved.albumOffset, saved.trackOffset
	base := renderPlayerBase(m)
	m.searching = true
	m.query, m.filtered, m.filteredTracks = query, filtered, filteredTracks
	m.detail, m.searchResults = detail, searchResults
	m.albumIndex, m.trackIndex = albumIndex, trackIndex
	m.albumOffset, m.trackOffset = albumOffset, trackOffset
	palette := newUIPalette()
	return overlayModal(base, m.searchModal(m.width, m.height, palette), m.width, m.height)
}
