package ping

import (
	"context"
	"net"
	"net/http"
	"net/netip"
	"time"

	"github.com/go-chi/chi/v5"
	probing "github.com/prometheus-community/pro-bing"

	"github.com/digibaro/net-tools-docker/apps/api/internal/limits"
	"github.com/digibaro/net-tools-docker/apps/api/internal/target"
	"github.com/digibaro/net-tools-docker/apps/api/internal/tools"
	"github.com/digibaro/net-tools-docker/apps/api/internal/tools/params"
	"github.com/digibaro/net-tools-docker/apps/api/internal/tools/rttstats"
	"github.com/digibaro/net-tools-docker/apps/api/internal/tools/stream"
)

// Sent is an SSE "sent" event: one echo request went out (replies come as "reply").
type Sent struct {
	Seq int   `json:"seq"`
	At  int64 `json:"at"` // Unix milliseconds
}

// MonitorEngine sends count echo requests every interval and reports each send and reply.
type MonitorEngine func(ctx context.Context, ip netip.Addr, interval time.Duration, count int, onSent func(Sent), onReply func(Reply, time.Duration)) error

// ProBingMonitor is the production monitor engine.
func ProBingMonitor(ctx context.Context, ip netip.Addr, interval time.Duration, count int, onSent func(Sent), onReply func(Reply, time.Duration)) error {
	p := probing.New(ip.String())
	p.SetIPAddr(&net.IPAddr{IP: net.IP(ip.AsSlice())})
	p.SetPrivileged(false)
	p.Count, p.Interval, p.Size = count, interval, 56
	p.Timeout = time.Duration(count)*interval + 3*time.Second
	p.OnSend = func(pkt *probing.Packet) { onSent(Sent{Seq: pkt.Seq, At: time.Now().UnixMilli()}) }
	p.OnRecv = func(pkt *probing.Packet) {
		onReply(Reply{Seq: pkt.Seq, RTTMs: rttstats.Ms(pkt.Rtt), TTL: pkt.TTL, From: pkt.IPAddr.String(), Bytes: pkt.Nbytes}, pkt.Rtt)
	}
	return p.RunWithContext(ctx) //nolint:wrapcheck // surfaced as INTERNAL/TIMEOUT
}

// MonitorTool is CON-18: smokeping-style latency monitor, up to MONITOR_MAX_MINUTES in one session.
type MonitorTool struct {
	deps   tools.Deps
	Engine MonitorEngine
}

func (*MonitorTool) ID() string                                { return "net.monitor" }
func (*MonitorTool) Enabled(d tools.Deps) (bool, tools.Reason) { return tools.Always(d) }

func (t *MonitorTool) Mount(r chi.Router, d tools.Deps) {
	t.deps = d
	if t.Engine == nil {
		t.Engine = ProBingMonitor
	}
	maxDur := time.Duration(d.Config.Limits.MonitorMaxMinutes)*time.Minute + 30*time.Second
	r.With(d.RateLimit(limits.Heavy), d.Slot, d.Timeout(maxDur)).Get("/ping/monitor/stream", t.handle)
}

func (t *MonitorTool) handle(w http.ResponseWriter, r *http.Request) {
	lim := t.deps.Config.Limits
	stream.Serve(w, r, func(ctx context.Context) (*stream.Job, error) {
		q := params.New(r.URL.Query())
		raw := q.String("target", "", true, 300)
		minutes := q.Int("minutes", min(5, lim.MonitorMaxMinutes), 1, lim.MonitorMaxMinutes)
		intervalS := q.Int("interval", 1, 1, 10)
		family := q.Family()
		if err := q.Err(); err != nil {
			return nil, err
		}
		tgt, err := t.deps.Target.Resolve(ctx, raw, target.Opts{Family: family})
		if err != nil {
			return nil, err //nolint:wrapcheck // client-facing
		}
		interval := time.Duration(intervalS) * time.Second
		count := minutes * 60 / intervalS
		return &stream.Job{
			Meta: map[string]any{"tool": t.ID(), "vantage": "server", "target": map[string]any{"input": raw, "resolved": tgt.Resolved, "used": tgt.IP}, "params": map[string]int{"minutes": minutes, "interval": intervalS, "count": count}},
			Run: func(ctx context.Context, emit stream.Emit) (any, error) {
				var rtts []time.Duration
				sent := 0
				err := t.Engine(ctx, tgt.IP, interval, count, func(s Sent) {
					sent++
					emit("sent", s)
				}, func(rep Reply, rtt time.Duration) {
					rtts = append(rtts, rtt)
					emit("reply", rep)
				})
				if err != nil && ctx.Err() == nil {
					return nil, err
				}
				return rttstats.Summarize(sent, rtts), nil
			},
		}, nil
	})
}
