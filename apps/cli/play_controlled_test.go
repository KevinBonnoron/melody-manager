package main

import (
	"bufio"
	"encoding/json"
	"errors"
	"fmt"
	"net"
	"strings"
	"testing"
)

func TestFFplayStartArgumentsKeepInputAttached(t *testing.T) {
	args := ffplayStartArguments([]string{"-nodisp", "-i", "-"}, 4.25)
	if got := strings.Join(args, " "); got != "-nodisp -ss 4.250 -i -" {
		t.Fatalf("ffplay arguments = %q", got)
	}
}

func TestFFplayPositionParsing(t *testing.T) {
	for _, tc := range []struct {
		line string
		want float64
		ok   bool
	}{
		{"  12.34 M-A:  0.000 fd=0", 12.34, true},
		{"  3.50 A-V:  0.001", 3.5, true},
		{" -0.01 M-A: 0.000", 0, false},
		{"Input #0, mov,mp4,m4a", 0, false},
	} {
		got, ok := parseFFplayPosition(tc.line)
		if ok != tc.ok || (ok && got != tc.want) {
			t.Errorf("parse %q = %v, %v", tc.line, got, ok)
		}
	}
}

func TestFFplayStatusSplit(t *testing.T) {
	scanner := bufio.NewScanner(strings.NewReader("first\rsecond\nthird"))
	scanner.Split(splitPlayerStatus)
	var lines []string
	for scanner.Scan() {
		lines = append(lines, scanner.Text())
	}
	if got := strings.Join(lines, ","); got != "first,second,third" {
		t.Fatalf("status lines: %q", got)
	}
	if err := scanner.Err(); err != nil {
		t.Fatal(err)
	}
}

func TestMPVRequestIgnoresEventsAndReportsUnavailable(t *testing.T) {
	client, server := net.Pipe()
	defer client.Close()
	defer server.Close()
	go func() {
		reader := bufio.NewReader(server)
		for i := 0; i < 2; i++ {
			line, err := reader.ReadBytes('\n')
			if err != nil {
				return
			}
			var request map[string]any
			if json.Unmarshal(line, &request) != nil {
				return
			}
			fmt.Fprintln(server, `{"event":"property-change"}`)
			if i == 0 {
				fmt.Fprintln(server, `{"request_id":1,"error":"success","data":12.5}`)
			} else {
				fmt.Fprintln(server, `{"request_id":1,"error":"property unavailable"}`)
			}
		}
	}()
	reader := bufio.NewReader(client)
	value, err := mpvRequest(client, reader, []any{"get_property", "time-pos"})
	if err != nil || value != float64(12.5) {
		t.Fatalf("position = %v, %v", value, err)
	}
	_, err = mpvRequest(client, reader, []any{"get_property", "time-pos"})
	if !errors.Is(err, errMPVPropertyUnavailable) {
		t.Fatalf("unavailable property: %v", err)
	}
}
