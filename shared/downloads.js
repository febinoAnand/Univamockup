/* ==========================================================================
   Univa — static HTML build. File downloads shared by the pages that offer
   them (Email Tracking, Forklift Tracking): a CSV, or a PDF table.

   Both are made in the browser. The PDF libraries are only fetched when
   someone asks for a PDF.
   ========================================================================== */
(function () {
  const JSPDF_URL = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js'
  const AUTOTABLE_URL = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js'

  function saveFile(filename, text, type) {
    const link = document.createElement('a')
    const url = URL.createObjectURL(new Blob([text], { type }))
    link.href = url
    link.download = filename
    document.body.appendChild(link)
    link.click()
    link.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  // A cell that starts with = + - or @ would be run as a formula by a
  // spreadsheet, so it gets a ' in front (numbers are left alone).
  function csvCell(value) {
    let text = String(value == null ? '' : value)
    if (/^[=+\-@\t\r]/.test(text) && !/^-?\d+(\.\d+)?$/.test(text)) text = "'" + text
    return /[",\r\n]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text
  }

  function downloadCsv(filename, head, body) {
    const lines = [head].concat(body).map((row) => row.map(csvCell).join(','))
    saveFile(filename, lines.join('\n'), 'text/csv')
  }

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script')
      script.src = src
      script.onload = resolve
      script.onerror = () => reject(new Error('Could not load ' + src))
      document.head.appendChild(script)
    })
  }

  // `options.title`, if given, is written above the table.
  async function downloadPdf(filename, head, body, options) {
    try {
      const ready = () => window.jspdf && window.jspdf.jsPDF && window.jspdf.jsPDF.API && window.jspdf.jsPDF.API.autoTable
      if (!window.jspdf) await loadScript(JSPDF_URL)
      if (!ready()) await loadScript(AUTOTABLE_URL)
      const doc = new window.jspdf.jsPDF({ orientation: head.length > 6 ? 'landscape' : 'portrait' })
      const title = options && options.title
      if (title) {
        doc.setFontSize(14)
        doc.text(title, 14, 16)
      }
      doc.autoTable({ head: [head], body, startY: title ? 22 : 10 })
      doc.save(filename)
    } catch (err) {
      if (window.UI && UI.toast) UI.toast("Couldn't make the PDF: its library could not be loaded. Download the CSV instead.")
    }
  }

  // Text that is safe to use in a file name.
  const fileSafe = (text) => String(text || '').trim().replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '')

  window.Downloads = { saveFile, csvCell, downloadCsv, downloadPdf, fileSafe }
})()
