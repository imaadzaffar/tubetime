import React from 'react';
import { STATIONS, LINES, EVENTS, OPERATORS } from './tube-data.js';

const W = 2450,
  H = 1560,
  MINY = 1900,
  MAXY = 2026;

// Design data-props become fixed constants (the spec's defaults).
const SHOW_CLOSED = true;
const LABEL_DENSITY = 'all';
const PLAY_SPEED = 4;

export default class App extends React.Component {
  constructor(props) {
    super(props);
    // Data is available synchronously via static import, so we start "loaded".
    this.data = { STATIONS, LINES, EVENTS, OPERATORS };
    this.state = {
      year: 1900,
      sel: null,
      playing: false,
      view: { x: 0, y: 0, w: W, h: H },
      loaded: true,
    };
    this._svgRef = React.createRef();
    this._trackRef = React.createRef();
    this._wheelBound = false;
  }

  componentDidMount() {
    // Restore persisted year on mount, clamped to [MINY, MAXY].
    let y = MINY;
    try {
      const s = localStorage.getItem('tube-atlas-year');
      if (s) y = Math.min(MAXY, Math.max(MINY, +s));
    } catch (e) {}
    if (y !== this.state.year) this.setState({ year: y });
    this.bindWheel();
  }

  componentDidUpdate() {
    this.bindWheel();
  }

  bindWheel() {
    const el = this._svgRef && this._svgRef.current;
    if (el && !this._wheelBound) {
      this._wheelBound = true;
      // Non-passive listener so we can preventDefault the page scroll while zooming.
      el.addEventListener(
        'wheel',
        (e) => {
          e.preventDefault();
          const rect = el.getBoundingClientRect();
          const { view } = this.state;
          const fx = (e.clientX - rect.left) / rect.width,
            fy = (e.clientY - rect.top) / rect.height;
          const k = e.deltaY > 0 ? 1.15 : 1 / 1.15;
          this.zoomAt(fx, fy, k);
        },
        { passive: false }
      );
    }
  }

  componentWillUnmount() {
    clearInterval(this._timer);
  }

  setYear(y) {
    y = Math.round(Math.min(MAXY, Math.max(MINY, y)));
    if (y !== this.state.year) {
      this.setState({ year: y });
      try {
        localStorage.setItem('tube-atlas-year', String(y));
      } catch (e) {}
    }
  }

  zoomAt(fx, fy, k) {
    const v = this.state.view;
    let w = Math.min(W * 1.4, Math.max(280, v.w * k));
    const h = w * (v.h / v.w);
    this.setState({ view: { x: v.x + fx * (v.w - w), y: v.y + fy * (v.h - h), w, h } });
  }

  latest(arr, year) {
    let out = null;
    for (const [y, v] of arr) if (y <= year) out = v;
    return out;
  }

  lineOpen(line, year) {
    return line.segs.some((s) => year >= s.o && (!s.c || year < s.c));
  }

  stationVisible(id, year) {
    const st = this.data.STATIONS[id];
    if (!st || year < st.o || (st.c && year >= st.c)) return false;
    for (const line of this.data.LINES)
      for (const sg of line.segs)
        if (year >= sg.o && (!sg.c || year < sg.c) && sg.pts.includes(id)) return true;
    return false;
  }

  stationName(st, year) {
    if (!st.r) return st.n;
    let name = st.r[0][1];
    for (const [y, n] of st.r) if (y <= year) name = n;
    return name;
  }

  servingLines(id) {
    // all lines that ever serve this station, with year ranges
    const out = [];
    for (const line of this.data.LINES) {
      let o = null,
        c = null;
      for (const sg of line.segs)
        if (sg.pts.includes(id)) {
          if (o === null || sg.o < o) o = sg.o;
          if (sg.c) {
            if (c === null || sg.c > c) c = c === null ? sg.c : Math.max(c, sg.c);
          } else c = Infinity;
        }
      if (o !== null) out.push({ line, o, c: c === Infinity ? null : c });
    }
    return out.sort((a, b) => a.o - b.o);
  }

  renderVals() {
    const { year, sel, playing, view, loaded } = this.state;
    const density = LABEL_DENSITY;
    const showClosed = SHOW_CLOSED;

    const vals = {
      yearLabel: String(year),
      viewBox: `${view.x} ${view.y} ${view.w} ${view.h}`,
      pct: ((year - MINY) / (MAXY - MINY)) * 100,
      playGlyph: playing ? '❚❚' : '▶',
      segs: [],
      stations: [],
      ghosts: [],
      legend: [],
      ticks: [],
      caption: '',
      operatorName: '',
      panelOpen: false,
      selMarker: false,
      selX: 0,
      selY: 0,
      panelName: '',
      panelDates: '',
      panelRenames: false,
      panelOrigin: '',
      panelFact: false,
      panelLines: [],
      labelsLayer: [],
    };
    if (!loaded) return vals;

    const { STATIONS, LINES, EVENTS, OPERATORS } = this.data;
    vals.caption = (() => {
      let t = '';
      for (const [y, txt] of EVENTS) if (y <= year) t = y + ' — ' + txt;
      return t;
    })();
    vals.operatorName = (this.latest(OPERATORS, year) || '').toUpperCase();
    vals.ticks = EVENTS.map(([y]) => ({ pct: ((y - MINY) / (MAXY - MINY)) * 100 }));

    // segments, wide (underlay) first
    const drawSegs = [];
    for (const line of LINES) {
      const color = this.latest(line.colors, year);
      for (let i = 0; i < line.segs.length; i++) {
        const sg = line.segs[i];
        if (year < sg.o || (sg.c && year >= sg.c)) continue;
        const pts = sg.pts.map((p) => (Array.isArray(p) ? p : [STATIONS[p].x, STATIONS[p].y]));
        drawSegs.push({
          key: line.id + i,
          points: pts.map((p) => p.join(',')).join(' '),
          color,
          w: sg.w || 7,
        });
      }
    }
    drawSegs.sort((a, b) => b.w - a.w);
    vals.segs = drawSegs;

    // legend
    vals.legend = LINES.filter((l) => this.lineOpen(l, year)).map((l) => ({
      name: this.latest(l.names, year),
      color: this.latest(l.colors, year),
    }));

    // stations
    const lp = (st) => {
      const d = st.lp || 'n';
      if (d === 'e') return { lx: st.x + 14, ly: st.y + 4.5, anchor: 'start' };
      if (d === 'w') return { lx: st.x - 14, ly: st.y + 4.5, anchor: 'end' };
      if (d === 's') return { lx: st.x, ly: st.y + 24, anchor: 'middle' };
      return { lx: st.x, ly: st.y - 13, anchor: 'middle' };
    };
    const stations = [],
      ghosts = [];
    for (const id in STATIONS) {
      const st = STATIONS[id];
      const click = () => this.setState({ sel: id });
      if (this.stationVisible(id, year)) {
        const serving = this.servingLines(id).filter((s) => year >= s.o && (!s.c || year < s.c));
        const inter = serving.length >= 2;
        const label = this.stationName(st, year);
        const showLabel = density === 'all' || (density === 'major' && inter) ? label : '';
        const p = lp(st);
        stations.push({
          id,
          x: st.x,
          y: st.y,
          onClick: click,
          label: showLabel,
          lx: p.lx,
          ly: p.ly,
          anchor: p.anchor,
          fw: inter ? 700 : 400,
          r: inter ? 8 : 5,
          fill: inter ? '#f2ecdc' : '#2c2620',
          stroke: '#2c2620',
          sw: inter ? 3 : 0,
        });
      } else if (showClosed && st.c && year >= st.c) {
        const p = lp(st);
        ghosts.push({
          id,
          x: st.x,
          y: st.y,
          onClick: click,
          label: this.stationName(st, 9999) + ' †',
          lx: p.lx,
          ly: p.ly,
          anchor: p.anchor,
        });
      }
    }
    vals.stations = stations;
    vals.ghosts = ghosts;

    // SVG <text> labels must be real text nodes — built here as elements.
    const labels = [];
    for (const s of stations)
      if (s.label)
        labels.push(
          React.createElement(
            'text',
            {
              key: 'l' + s.x + ',' + s.y,
              x: s.lx,
              y: s.ly,
              textAnchor: s.anchor,
              fontWeight: s.fw,
              style: { fontFamily: "'Hammersmith One',sans-serif", fontSize: 13, fill: '#2c2620' },
            },
            s.label
          )
        );
    for (const g of ghosts)
      labels.push(
        React.createElement(
          'text',
          {
            key: 'g' + g.x + ',' + g.y,
            x: g.lx,
            y: g.ly,
            textAnchor: g.anchor,
            opacity: 0.65,
            style: {
              fontFamily: "'Hammersmith One',sans-serif",
              fontSize: 13,
              fontStyle: 'italic',
              fill: '#8d8172',
            },
          },
          g.label
        )
      );
    vals.labelsLayer = labels;

    // selected panel
    if (sel && STATIONS[sel]) {
      const st = STATIONS[sel];
      vals.panelOpen = true;
      vals.selMarker = true;
      vals.selX = st.x;
      vals.selY = st.y;
      vals.panelName = this.stationName(st, Math.max(year, st.o));
      let dates = 'OPENED ' + st.o;
      if (st.c) dates += ' · CLOSED ' + st.c;
      if (year < st.o) dates += ' · NOT YET BUILT IN ' + year;
      vals.panelDates = dates;
      if (st.r && st.r.length > 1) {
        const parts = [];
        for (let i = 0; i < st.r.length - 1; i++)
          parts.push('“' + st.r[i][1] + '” until ' + st.r[i + 1][0]);
        vals.panelRenames = 'Formerly ' + parts.join('; ') + '.';
      }
      vals.panelOrigin = st.e;
      vals.panelFact = st.f || false;
      vals.panelLines = this.servingLines(sel).map(({ line, o, c }) => {
        const active = year >= o && (!c || year < c);
        return {
          name: this.latest(line.names, Math.max(year, o)),
          color: this.latest(line.colors, Math.max(year, o)),
          range: o + '–' + (c ? c : ''),
          op: active ? 1 : 0.45,
        };
      });
    }
    return vals;
  }

  togglePlay() {
    if (this.state.playing) {
      clearInterval(this._timer);
      this.setState({ playing: false });
    } else {
      let y = this.state.year >= MAXY ? MINY : this.state.year;
      this.setState({ playing: true, year: y });
      const speed = PLAY_SPEED;
      this._acc = y;
      this._timer = setInterval(() => {
        this._acc += speed / 10;
        if (this._acc >= MAXY) {
          this._acc = MAXY;
          clearInterval(this._timer);
          this.setState({ playing: false });
        }
        this.setYear(this._acc);
      }, 100);
    }
  }

  // --- map pan ---
  panStart(e) {
    if (e.button !== undefined && e.button !== 0) return;
    // Defer pointer capture to the first move: capturing on pointerdown makes
    // Chrome retarget the ensuing `click` to the SVG, which would swallow the
    // station <g> onClick. Capturing on drag preserves pan-with-capture while
    // letting a plain click through to the station beneath.
    this._pan = { x: e.clientX, y: e.clientY, view: { ...this.state.view }, pointerId: e.pointerId, captured: false };
  }
  panMove(e) {
    if (!this._pan) return;
    const el = this._svgRef.current;
    if (!el) return;
    if (!this._pan.captured) {
      this._pan.captured = true;
      el.setPointerCapture && el.setPointerCapture(this._pan.pointerId);
    }
    const rect = el.getBoundingClientRect();
    const scale = this.state.view.w / rect.width;
    const dx = (e.clientX - this._pan.x) * scale,
      dy = (e.clientY - this._pan.y) * scale;
    this.setState({
      view: { ...this.state.view, x: this._pan.view.x - dx, y: this._pan.view.y - dy },
    });
  }
  panEnd() {
    this._pan = null;
  }

  // --- timeline track ---
  yearFromEvent(e) {
    const el = this._trackRef.current;
    if (!el) return this.state.year;
    const rect = el.getBoundingClientRect();
    const f = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    return MINY + f * (MAXY - MINY);
  }
  trackDown(e) {
    this._drag = true;
    e.currentTarget.setPointerCapture && e.currentTarget.setPointerCapture(e.pointerId);
    if (this.state.playing) this.togglePlay();
    this.setYear(this.yearFromEvent(e));
  }
  trackMove(e) {
    if (this._drag) this.setYear(this.yearFromEvent(e));
  }
  trackUp() {
    this._drag = false;
  }

  render() {
    const v = this.renderVals();
    return (
      <div
        style={{
          height: '100vh',
          display: 'flex',
          flexDirection: 'column',
          background: '#f2ecdc',
          fontFamily: "'Hammersmith One',sans-serif",
          color: '#2c2620',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            border: '2px solid #4a4133',
            margin: 10,
            minHeight: 0,
          }}
        >
          <div
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              border: '1px solid #4a4133',
              margin: 2,
              minHeight: 0,
              background: '#f2ecdc',
            }}
          >
            {/* Header */}
            <div
              data-screen-label="Header"
              style={{
                display: 'flex',
                alignItems: 'baseline',
                gap: 18,
                padding: '12px 22px 10px',
                borderBottom: '1px solid #b8ab8c',
                flexWrap: 'wrap',
              }}
            >
              <div style={{ fontSize: 21, fontWeight: 700, letterSpacing: '2.5px' }}>
                LONDON&rsquo;S UNDERGROUND RAILWAYS
              </div>
              <div style={{ fontStyle: 'italic', fontSize: 13, color: '#7a6f5c' }}>
                An Atlas of the Network Through Time &middot; 1900&ndash;2026
              </div>
              <div
                style={{
                  marginLeft: 'auto',
                  display: 'flex',
                  alignItems: 'baseline',
                  gap: 14,
                }}
              >
                <div
                  data-testid="operator"
                  style={{ fontSize: 12, letterSpacing: '1.5px', color: '#7a6f5c' }}
                >
                  {v.operatorName}
                </div>
                <div data-testid="year" style={{ fontSize: 34, fontWeight: 700, lineHeight: 1 }}>
                  {v.yearLabel}
                </div>
              </div>
            </div>

            {/* Map area */}
            <div
              data-screen-label="Map"
              style={{ flex: 1, position: 'relative', minHeight: 0, overflow: 'hidden' }}
            >
              <svg
                data-testid="map-svg"
                width="100%"
                height="100%"
                viewBox={v.viewBox}
                preserveAspectRatio="xMidYMid meet"
                style={{
                  display: 'block',
                  cursor: 'grab',
                  touchAction: 'none',
                  userSelect: 'none',
                }}
                onPointerDown={(e) => this.panStart(e)}
                onPointerMove={(e) => this.panMove(e)}
                onPointerUp={(e) => this.panEnd(e)}
                onPointerLeave={(e) => this.panEnd(e)}
                ref={this._svgRef}
              >
                <g>
                  {v.segs.map((sg) => (
                    <polyline
                      key={sg.key}
                      points={sg.points}
                      fill="none"
                      stroke={sg.color}
                      strokeWidth={sg.w}
                      strokeLinejoin="round"
                      strokeLinecap="round"
                    />
                  ))}
                  {v.ghosts.map((g) => (
                    <g
                      key={'gh' + g.id}
                      data-station-id={g.id}
                      data-ghost="true"
                      opacity="0.55"
                      onClick={g.onClick}
                      style={{ cursor: 'pointer' }}
                    >
                      <circle
                        cx={g.x}
                        cy={g.y}
                        r="6"
                        fill="#f2ecdc"
                        stroke="#8d8172"
                        strokeWidth="2"
                        strokeDasharray="3 2.5"
                      />
                      <circle cx={g.x} cy={g.y} r="14" fill="transparent" />
                    </g>
                  ))}
                  {v.stations.map((s) => (
                    <g
                      key={'st' + s.id}
                      data-station-id={s.id}
                      data-testid={'station-' + s.id}
                      onClick={s.onClick}
                      style={{ cursor: 'pointer' }}
                    >
                      <circle
                        cx={s.x}
                        cy={s.y}
                        r={s.r}
                        fill={s.fill}
                        stroke={s.stroke}
                        strokeWidth={s.sw}
                      />
                      <circle cx={s.x} cy={s.y} r="14" fill="transparent" />
                    </g>
                  ))}
                  <g style={{ pointerEvents: 'none' }}>{v.labelsLayer}</g>
                  {v.selMarker && (
                    <circle
                      cx={v.selX}
                      cy={v.selY}
                      r="15"
                      fill="none"
                      stroke="#a8402e"
                      strokeWidth="2.5"
                      style={{ pointerEvents: 'none' }}
                    />
                  )}
                </g>
              </svg>

              {/* Legend */}
              <div
                data-testid="legend"
                style={{
                  position: 'absolute',
                  top: 12,
                  left: 12,
                  background: 'rgba(250,245,232,.93)',
                  border: '1px solid #b8ab8c',
                  padding: '10px 14px 8px',
                  maxWidth: 250,
                }}
              >
                <div
                  style={{
                    fontSize: 11,
                    letterSpacing: '2px',
                    color: '#7a6f5c',
                    marginBottom: 6,
                  }}
                >
                  LINES OF {v.yearLabel}
                </div>
                {v.legend.map((l, i) => (
                  <div
                    key={'leg' + i}
                    data-testid="legend-row"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '1.5px 0',
                    }}
                  >
                    <span
                      style={{
                        width: 22,
                        height: 5,
                        background: l.color,
                        flexShrink: 0,
                      }}
                    />
                    <span
                      style={{
                        fontSize: '12.5px',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {l.name}
                    </span>
                  </div>
                ))}
              </div>

              {/* Zoom controls */}
              <div
                style={{
                  position: 'absolute',
                  top: 12,
                  right: 12,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 6,
                }}
              >
                <button
                  data-testid="zoom-in"
                  onClick={() => this.zoomAt(0.5, 0.5, 1 / 1.35)}
                  style={{
                    width: 34,
                    height: 34,
                    border: '1px solid #4a4133',
                    background: '#faf5e8',
                    font: "700 18px 'Hammersmith One',sans-serif",
                    color: '#2c2620',
                    cursor: 'pointer',
                  }}
                >
                  +
                </button>
                <button
                  data-testid="zoom-out"
                  onClick={() => this.zoomAt(0.5, 0.5, 1.35)}
                  style={{
                    width: 34,
                    height: 34,
                    border: '1px solid #4a4133',
                    background: '#faf5e8',
                    font: "700 18px 'Hammersmith One',sans-serif",
                    color: '#2c2620',
                    cursor: 'pointer',
                  }}
                >
                  &minus;
                </button>
                <button
                  data-testid="zoom-fit"
                  onClick={() => this.setState({ view: { x: 0, y: 0, w: W, h: H } })}
                  title="Fit map"
                  style={{
                    width: 34,
                    height: 34,
                    border: '1px solid #4a4133',
                    background: '#faf5e8',
                    font: "400 11px 'Hammersmith One',sans-serif",
                    color: '#2c2620',
                    cursor: 'pointer',
                  }}
                >
                  fit
                </button>
              </div>

              {/* Station panel */}
              {v.panelOpen && (
                <div
                  data-testid="station-panel"
                  data-screen-label="Station panel"
                  style={{
                    position: 'absolute',
                    right: 12,
                    bottom: 12,
                    width: 'min(330px,calc(100% - 24px))',
                    maxHeight: 'calc(100% - 70px)',
                    overflow: 'auto',
                    background: '#faf5e8',
                    border: '1px solid #b8ab8c',
                    boxShadow: '0 3px 14px rgba(44,38,32,.18)',
                    padding: '16px 18px',
                    animation: 'fadeUp .25s ease',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                    <div style={{ flex: 1 }}>
                      <div
                        data-testid="panel-name"
                        style={{ fontSize: 20, fontWeight: 700, lineHeight: 1.15 }}
                      >
                        {v.panelName}
                      </div>
                      <div
                        style={{
                          fontSize: 11,
                          letterSpacing: '1.8px',
                          color: '#7a6f5c',
                          marginTop: 4,
                        }}
                      >
                        {v.panelDates}
                      </div>
                    </div>
                    <button
                      data-testid="panel-close"
                      onClick={() => this.setState({ sel: null })}
                      style={{
                        border: 'none',
                        background: 'none',
                        font: "400 20px 'Hammersmith One',sans-serif",
                        color: '#7a6f5c',
                        cursor: 'pointer',
                        lineHeight: 1,
                        padding: '0 2px',
                      }}
                    >
                      &times;
                    </button>
                  </div>
                  {v.panelRenames && (
                    <div
                      style={{
                        fontSize: '12.5px',
                        fontStyle: 'italic',
                        color: '#7a6f5c',
                        marginTop: 7,
                      }}
                    >
                      {v.panelRenames}
                    </div>
                  )}
                  <div
                    style={{
                      borderTop: '1px solid #d8cfb6',
                      marginTop: 10,
                      paddingTop: 9,
                    }}
                  >
                    <div style={{ fontSize: 11, letterSpacing: '2px', color: '#7a6f5c' }}>
                      NAME ORIGIN
                    </div>
                    <p style={{ fontSize: '13.5px', lineHeight: 1.55, margin: '4px 0 0' }}>
                      {v.panelOrigin}
                    </p>
                  </div>
                  {v.panelFact && (
                    <div
                      style={{
                        borderTop: '1px solid #d8cfb6',
                        marginTop: 10,
                        paddingTop: 9,
                      }}
                    >
                      <div style={{ fontSize: 11, letterSpacing: '2px', color: '#7a6f5c' }}>
                        NOTES
                      </div>
                      <p style={{ fontSize: '13.5px', lineHeight: 1.55, margin: '4px 0 0' }}>
                        {v.panelFact}
                      </p>
                    </div>
                  )}
                  <div
                    style={{
                      borderTop: '1px solid #d8cfb6',
                      marginTop: 10,
                      paddingTop: 9,
                    }}
                  >
                    <div style={{ fontSize: 11, letterSpacing: '2px', color: '#7a6f5c' }}>
                      LINES THROUGH TIME
                    </div>
                    <div
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 3,
                        marginTop: 5,
                      }}
                    >
                      {v.panelLines.map((pl, i) => (
                        <div
                          key={'pl' + i}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8,
                            opacity: pl.op,
                          }}
                        >
                          <span
                            style={{
                              width: 20,
                              height: 5,
                              background: pl.color,
                              flexShrink: 0,
                            }}
                          />
                          <span style={{ fontSize: '12.5px' }}>{pl.name}</span>
                          <span
                            style={{
                              fontSize: '11.5px',
                              color: '#7a6f5c',
                              marginLeft: 'auto',
                            }}
                          >
                            {pl.range}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Timeline */}
            <div
              data-screen-label="Timeline"
              style={{
                borderTop: '1px solid #b8ab8c',
                padding: '12px 22px 10px',
                background: '#ede6d2',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                <button
                  data-testid="play"
                  onClick={() => this.togglePlay()}
                  style={{
                    width: 44,
                    height: 44,
                    border: '1.5px solid #4a4133',
                    background: '#faf5e8',
                    font: "400 15px 'Hammersmith One',sans-serif",
                    color: '#2c2620',
                    cursor: 'pointer',
                    flexShrink: 0,
                  }}
                >
                  {v.playGlyph}
                </button>
                <div style={{ fontSize: 13, color: '#7a6f5c', flexShrink: 0 }}>1900</div>
                <div
                  data-testid="timeline-track"
                  style={{
                    flex: 1,
                    position: 'relative',
                    height: 44,
                    cursor: 'pointer',
                    touchAction: 'none',
                  }}
                  onPointerDown={(e) => this.trackDown(e)}
                  onPointerMove={(e) => this.trackMove(e)}
                  onPointerUp={(e) => this.trackUp(e)}
                  ref={this._trackRef}
                >
                  <div
                    style={{
                      position: 'absolute',
                      left: 0,
                      right: 0,
                      top: 21,
                      height: 3,
                      background: '#c9bd9e',
                    }}
                  />
                  {v.ticks.map((t, i) => (
                    <div
                      key={'tick' + i}
                      style={{
                        position: 'absolute',
                        left: t.pct + '%',
                        top: 17,
                        width: '1.5px',
                        height: 11,
                        background: '#a3966f',
                      }}
                    />
                  ))}
                  <div
                    style={{
                      position: 'absolute',
                      left: 0,
                      top: 21,
                      height: 3,
                      background: '#4a4133',
                      width: v.pct + '%',
                    }}
                  />
                  <div
                    style={{
                      position: 'absolute',
                      left: v.pct + '%',
                      top: '22.5px',
                      transform: 'translate(-50%,-50%) rotate(45deg)',
                      width: 13,
                      height: 13,
                      background: '#faf5e8',
                      border: '2px solid #2c2620',
                      pointerEvents: 'none',
                    }}
                  />
                </div>
                <div style={{ fontSize: 13, color: '#7a6f5c', flexShrink: 0 }}>2026</div>
              </div>
              <div
                data-testid="caption"
                style={{
                  textAlign: 'center',
                  fontStyle: 'italic',
                  fontSize: '13.5px',
                  color: '#4a4133',
                  marginTop: 4,
                  minHeight: 19,
                }}
              >
                {v.caption}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }
}
