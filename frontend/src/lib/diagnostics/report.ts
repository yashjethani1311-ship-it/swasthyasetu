import jsPDF from 'jspdf'
import { observationsOf, type Result } from './service'
let fontReady: Promise<void> | undefined
async function prepareFont() {
  fontReady ??= (async () => {
    const font = new FontFace('ReportDevanagari', 'url(/fonts/NotoSansDevanagari-Regular.ttf)')
    await font.load()
    document.fonts.add(font)
  })().catch(error => { fontReady = undefined; throw error })
  await fontReady
}
export async function reportPdf(result: Result, testName: string, orderId: string, labName: string) {
  const observations = observationsOf(result)
  const texts = [labName, testName, ...observations.flatMap(o => [o.parameter_name, o.raw_value, o.unit ?? '', o.reference_range ?? ''])]
  if (texts.some(text => /[^\x20-\x7E]/.test(text))) await prepareFont()
  const pdf = new jsPDF({ compress: true })
  let y = 22
  const nextLine = (height: number) => { if (y + height > 276) { pdf.addPage(); y = 22 } }
  const line = (text: string, size = 10) => {
    if (/[^\x20-\x7E]/.test(text)) {
      // Browser shaping preserves Indic scripts and source text. Rasterize only these
      // lines at high resolution; all ASCII report text remains selectable vector text.
      const canvas = document.createElement('canvas')
      const scale = 3, pxPerMm = 96 / 25.4
      canvas.width = Math.ceil(170 * pxPerMm * scale)
      canvas.height = Math.ceil(size * 1.333 * 2.1 * scale)
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('Report text rendering is unavailable')
      ctx.font = `${size * 1.333 * scale}px ReportDevanagari, Arial, sans-serif`
      ctx.textBaseline = 'middle'
      const lines: string[] = []; let current = ''
      for (const word of text.split(/(\s+)/)) {
        if (ctx.measureText(current + word).width <= canvas.width - 6 * scale) { current += word; continue }
        if (current) { lines.push(current); current = '' }
        for (const character of word) {
          if (current && ctx.measureText(current + character).width > canvas.width - 6 * scale) { lines.push(current); current = '' }
          current += character
        }
      }
      if (current) lines.push(current)
      for (const value of lines) {
        ctx.clearRect(0, 0, canvas.width, canvas.height)
        ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, canvas.width, canvas.height)
        ctx.fillStyle = '#172b36'; ctx.fillText(value, 0, canvas.height / 2)
        const height = canvas.height / (pxPerMm * scale)
        nextLine(height); pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 20, y - height / 2, 170, height); y += height
      }
    } else {
      pdf.setFont('helvetica', 'normal'); pdf.setFontSize(size); pdf.setTextColor('#172b36')
      for (const part of pdf.splitTextToSize(text, 170)) { nextLine(7); pdf.text(part, 20, y); y += 7 }
    }
    y += 2
  }
  line(labName, 17)
  line('Diagnostic report', 14)
  pdf.setDrawColor('#ccd8df'); pdf.line(20, y, 190, y); y += 9
  line(testName, 13)
  line(`Order: ${orderId}`)
  line(`Sample: ${result.result_json.sample_code ?? 'Not recorded'}`)
  line(`Verified: ${result.verified_at ?? 'Not recorded'}`)
  line(`Source: ${result.result_json.source ?? 'Not recorded'}`)
  line(`Result ID: ${result.id}`)
  for (const o of observations) {
    nextLine(35)
    line(o.parameter_name, 12)
    line(`Result: ${o.raw_value} ${o.unit ?? ''}`)
    line(`Reference: ${o.reference_range ?? 'Reference range not configured'} | Flag: ${o.flag}`)
  }
  line('Verified laboratory observations. Doctor review is a separate care step.')
  const pages = pdf.getNumberOfPages()
  for (let i = 1; i <= pages; i++) { pdf.setPage(i); pdf.setFont('helvetica'); pdf.setFontSize(8); pdf.setTextColor('#526571'); pdf.text(`Page ${i} of ${pages}`, 190, 288, { align: 'right' }) }
  return pdf.output('blob')
}
