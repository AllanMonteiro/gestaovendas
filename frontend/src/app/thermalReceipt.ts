export type ThermalReceiptDetail = {
  label?: string
  value?: string
}

export type ThermalReceiptItem = {
  name: string
  qty?: number
  weight_grams?: number
  unit_price?: number
  total?: number
  notes?: string
}

export type ThermalReceiptPayment = {
  method: string
  amount: number
}

export type ThermalReceiptPayload = {
  company_name?: string
  address?: string
  cnpj?: string
  title?: string
  order_id?: string
  cashier?: string
  receipt_header_lines?: string[]
  receipt_footer_lines?: string[]
  details?: ThermalReceiptDetail[]
  items?: ThermalReceiptItem[]
  subtotal?: number
  discount?: number
  total?: number
  payments?: ThermalReceiptPayment[]
}

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')

const formatBRL = (value: number | undefined) =>
  Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

const buildHtml = (payload: ThermalReceiptPayload) => {
  const now = new Date().toLocaleString('pt-BR')
  const details = (payload.details ?? [])
    .map((detail) => {
      const label = escapeHtml(detail.label ?? '')
      const value = escapeHtml(detail.value ?? '')
      return `<div class="row"><span>${label}</span><strong>${value}</strong></div>`
    })
    .join('')

  const items = (payload.items ?? [])
    .map((item) => {
      const qtyText =
        typeof item.weight_grams === 'number' && item.weight_grams > 0
          ? `${(item.weight_grams / 1000).toFixed(3)} kg x ${formatBRL(item.unit_price)}`
          : `${Number(item.qty || 0)} x ${formatBRL(item.unit_price)}`
      return `
        <div class="item">
          <div class="item-name">${escapeHtml(item.name)}</div>
          <div class="row"><span>${qtyText}</span><strong>${formatBRL(item.total)}</strong></div>
          ${item.notes ? `<div class="notes">Obs: ${escapeHtml(item.notes)}</div>` : ''}
        </div>
      `
    })
    .join('')

  const payments = (payload.payments ?? [])
    .map((payment) => `<div class="row"><span>${escapeHtml(payment.method)}</span><strong>${formatBRL(payment.amount)}</strong></div>`)
    .join('')

  const headerLines = (payload.receipt_header_lines ?? []).map((line) => `<div class="center">${escapeHtml(line)}</div>`).join('')
  const footerLines = (payload.receipt_footer_lines ?? []).map((line) => `<div class="center">${escapeHtml(line)}</div>`).join('')

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <title>${escapeHtml(payload.title || 'Cupom')}</title>
  <style>
    @page { size: 80mm auto; margin: 4mm; }
    body {
      margin: 0;
      background: #f3f4f6;
      font-family: "Courier New", monospace;
      color: #111827;
    }
    .receipt {
      width: 72mm;
      margin: 0 auto;
      background: #fff;
      padding: 4mm 3mm 6mm;
      box-sizing: border-box;
    }
    .center {
      text-align: center;
      font-size: 11px;
      line-height: 1.35;
    }
    .title {
      text-align: center;
      font-weight: 700;
      margin-top: 4px;
      margin-bottom: 4px;
      font-size: 13px;
    }
    .divider {
      border-top: 1px dashed #111827;
      margin: 8px 0;
    }
    .row {
      display: flex;
      justify-content: space-between;
      gap: 8px;
      font-size: 11px;
      line-height: 1.4;
    }
    .item {
      margin-bottom: 7px;
    }
    .item-name {
      font-size: 11px;
      font-weight: 700;
      margin-bottom: 2px;
    }
    .notes {
      font-size: 10px;
      margin-top: 2px;
    }
  </style>
</head>
<body>
  <div class="receipt">
    <div class="center"><strong>${escapeHtml(payload.company_name || 'Sorveteria POS')}</strong></div>
    ${payload.address ? `<div class="center">${escapeHtml(payload.address)}</div>` : ''}
    ${payload.cnpj ? `<div class="center">CNPJ: ${escapeHtml(payload.cnpj)}</div>` : ''}
    ${payload.title ? `<div class="title">${escapeHtml(payload.title)}</div>` : ''}
    ${headerLines}
    <div class="center">${escapeHtml(now)}</div>
    ${payload.order_id || payload.cashier ? `<div class="center">Pedido: ${escapeHtml(payload.order_id || '')} ${payload.cashier ? `| ${escapeHtml(payload.cashier)}` : ''}</div>` : ''}
    <div class="divider"></div>
    ${details}
    ${details ? '<div class="divider"></div>' : ''}
    ${items}
    ${(payload.items ?? []).length ? '<div class="divider"></div>' : ''}
    <div class="row"><span>Subtotal</span><strong>${formatBRL(payload.subtotal)}</strong></div>
    <div class="row"><span>Desconto</span><strong>${formatBRL(payload.discount)}</strong></div>
    <div class="row"><span>Total</span><strong>${formatBRL(payload.total)}</strong></div>
    ${payments ? '<div class="divider"></div>' : ''}
    ${payments}
    ${footerLines ? '<div class="divider"></div>' : ''}
    ${footerLines}
  </div>
</body>
</html>`
}

export const openThermalReceiptPdf = (payload: ThermalReceiptPayload) => {
  const popup = window.open('', '_blank', 'width=420,height=760')
  if (!popup) {
    return false
  }

  popup.document.open()
  popup.document.write(buildHtml(payload))
  popup.document.close()
  popup.focus()
  popup.print()
  return true
}
