/* ==========================================================================
   Univa — static HTML build. Small dependency-free chart helpers (inline
   SVG), the same technique the React app's own widgets use instead of
   pulling in a charting library.
   ========================================================================== */

function polarToCartesian(cx, cy, r, angleDeg) {
  const angleRad = ((angleDeg - 90) * Math.PI) / 180
  return { x: cx + r * Math.cos(angleRad), y: cy + r * Math.sin(angleRad) }
}

function describeArc(cx, cy, r, startAngle, endAngle) {
  const start = polarToCartesian(cx, cy, r, endAngle)
  const end = polarToCartesian(cx, cy, r, startAngle)
  const largeArc = endAngle - startAngle <= 180 ? 0 : 1
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 0 ${end.x} ${end.y}`
}

const Charts = {
  renderGauge(containerId, value, unit, color) {
    const start = -120
    const end = 120
    const valueAngle = start + (value / 100) * (end - start)
    const svg = `
      <svg viewBox="0 0 120 90" width="100%" height="90">
        <path d="${describeArc(60, 58, 46, start, end)}" fill="none" stroke="var(--surface-alt)" stroke-width="10" />
        <path d="${describeArc(60, 58, 46, start, valueAngle)}" fill="none" stroke="${color}" stroke-width="10" stroke-linecap="round" />
        <text x="60" y="60" class="gauge-value">${value}${unit}</text>
      </svg>`
    document.getElementById(containerId).innerHTML = svg
  },

  renderLineChart(containerId, points, color, options) {
    const width = (options && options.width) || 320
    const height = (options && options.height) || 140
    const padding = 24
    const max = Math.max(...points)
    const min = Math.min(...points)
    const range = max - min || 1
    const step = (width - padding * 2) / (points.length - 1)

    const coords = points.map((p, i) => ({
      x: padding + i * step,
      y: height - padding - ((p - min) / range) * (height - padding * 2),
    }))
    const path = coords.map((c, i) => `${i === 0 ? 'M' : 'L'}${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' ')

    const yTicks = [max, (max + min) / 2, min]
      .map((v, i) => `<text x="4" y="${padding + i * ((height - padding * 2) / 2) + 3}" class="axis-label">${Math.round(v)}</text>`)
      .join('')

    const svg = `
      <svg viewBox="0 0 ${width} ${height}" width="100%" height="${height}">
        <line x1="${padding}" y1="${padding}" x2="${padding}" y2="${height - padding}" stroke="var(--border)" />
        <line x1="${padding}" y1="${height - padding}" x2="${width - 8}" y2="${height - padding}" stroke="var(--border)" />
        ${yTicks}
        <path d="${path}" fill="none" stroke="${color}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" />
      </svg>`
    document.getElementById(containerId).innerHTML = svg
  },

  renderBarChart(containerId, points, color) {
    const width = 320
    const height = 140
    const padding = 24
    const max = Math.max(...points)
    const barWidth = (width - padding * 2) / points.length - 4

    const bars = points
      .map((p, i) => {
        const barHeight = (p / max) * (height - padding * 2)
        const x = padding + i * ((width - padding * 2) / points.length)
        const y = height - padding - barHeight
        return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barWidth.toFixed(1)}" height="${barHeight.toFixed(1)}" rx="2" fill="${color}" />`
      })
      .join('')

    const svg = `
      <svg viewBox="0 0 ${width} ${height}" width="100%" height="${height}">
        <line x1="${padding}" y1="${height - padding}" x2="${width - 8}" y2="${height - padding}" stroke="var(--border)" />
        ${bars}
      </svg>`
    document.getElementById(containerId).innerHTML = svg
  },

  randomSeries(count, base, amplitude) {
    const points = []
    let value = base
    for (let i = 0; i < count; i += 1) {
      value += (Math.random() - 0.5) * amplitude
      points.push(Number(value.toFixed(1)))
    }
    return points
  },
}

window.Charts = Charts
