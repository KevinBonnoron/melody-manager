package player

import (
	"context"
	"fmt"
	"strings"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
)

// Library follows a list with more of what it already holds: tracks sharing a
// genre with the ones the listener chose, so that a list handed over as one
// album carries on sounding like it rather than like the library.
type Library struct {
	app core.App
}

func NewLibrary(app core.App) *Library {
	return &Library{app: app}
}

// spread is how many candidates to ask for beyond what is wanted, since some
// of them will already be in the list.
const spread = 3

func (l *Library) More(_ context.Context, _ string, list []string, want int) ([]string, error) {
	if want <= 0 || len(list) == 0 {
		return nil, nil
	}

	genres, err := l.genresOf(list)
	if err != nil {
		return nil, err
	}

	where := []string{"availability != 'none'"}
	params := dbx.Params{}
	if len(genres) > 0 {
		shared := make([]string, 0, len(genres))
		for i, id := range genres {
			key := fmt.Sprintf("g%d", i)
			shared = append(shared, fmt.Sprintf("genres.id ?= {:%s}", key))
			params[key] = id
		}
		where = append(where, "("+strings.Join(shared, " || ")+")")
	}

	found, err := l.app.FindRecordsByFilter("tracks", strings.Join(where, " && "), "@random", want*spread, 0, params)
	if err != nil {
		return nil, err
	}

	out := make([]string, 0, len(found))
	for _, record := range found {
		out = append(out, record.Id)
	}
	return out, nil
}

// genresOf reads the genres of the tracks chosen most recently, which is what
// the list is drifting towards rather than what it started as.
func (l *Library) genresOf(list []string) ([]string, error) {
	if len(list) > recentEnough {
		list = list[len(list)-recentEnough:]
	}

	where := make([]string, 0, len(list))
	params := dbx.Params{}
	for i, id := range list {
		key := fmt.Sprintf("t%d", i)
		where = append(where, fmt.Sprintf("id = {:%s}", key))
		params[key] = id
	}

	records, err := l.app.FindRecordsByFilter("tracks", strings.Join(where, " || "), "", 0, 0, params)
	if err != nil {
		return nil, err
	}

	seen := map[string]bool{}
	genres := []string{}
	for _, record := range records {
		for _, id := range record.GetStringSlice("genres") {
			if id == "" || seen[id] {
				continue
			}
			seen[id] = true
			genres = append(genres, id)
		}
	}
	return genres, nil
}

const recentEnough = 20
