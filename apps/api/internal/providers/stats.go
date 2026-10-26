package providers

import (
	"errors"
	"slices"
	"strconv"
	"sync"
	"time"
)

// Stat is the per-provider usage since start (no URLs, keys or upstream bodies).
type Stat struct {
	Provider      string    `json:"provider"`
	Requests      int       `json:"requests"`
	Fetches       int       `json:"fetches"`
	Errors        int       `json:"errors"`
	LastOK        time.Time `json:"lastOk"`
	LastError     time.Time `json:"lastError"`
	LastProblem   string    `json:"lastProblem"`
	LastLatencyMs int64     `json:"lastLatencyMs"`
}

type stats struct {
	mu sync.Mutex
	m  map[string]*Stat
}

func (s *stats) get(p string) *Stat {
	if s.m == nil {
		s.m = map[string]*Stat{}
	}
	st, ok := s.m[p]
	if !ok {
		st = &Stat{Provider: p}
		s.m[p] = st
	}
	return st
}

func (s *stats) request(p string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.get(p).Requests++
}

func (s *stats) fetched(p string, took time.Duration, err error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	st := s.get(p)
	st.Fetches++
	st.LastLatencyMs = took.Milliseconds()
	if err == nil {
		st.LastOK = time.Now()
		return
	}
	st.Errors++
	st.LastError = time.Now()
	var se *StatusError
	var pe *Error
	switch {
	case errors.As(err, &se):
		st.LastProblem = "HTTP " + strconv.Itoa(se.Status)
	case errors.As(err, &pe):
		st.LastProblem = pe.Message // client-safe text, never the URL
	default:
		st.LastProblem = "request blocked or failed"
	}
}

// Stats returns a copy of the usage per provider, sorted by name.
func (c *Client) Stats() []Stat {
	c.stats.mu.Lock()
	defer c.stats.mu.Unlock()
	out := make([]Stat, 0, len(c.stats.m))
	for _, s := range c.stats.m {
		out = append(out, *s)
	}
	slices.SortFunc(out, func(a, b Stat) int {
		if a.Provider < b.Provider {
			return -1
		}
		return 1
	})
	return out
}
