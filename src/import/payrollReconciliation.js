const cents = (value) => Math.round((value + Number.EPSILON) * 100) / 100

export function createPayrollReconciliationBatch(rows, reportingMonth, sourceControlTotal, { fileName = '', stagedAt = '' } = {}) {
  const monthRows = rows.filter((row) => row.reportingMonth === reportingMonth)
  const validGrossRows = monthRows.filter((row) => row.monthlyGrossSalary != null && row.monthlyGrossSalary !== '' && Number.isFinite(Number(row.monthlyGrossSalary)) && Number(row.monthlyGrossSalary) >= 0)
  const validRowsGrossTotal = cents(validGrossRows.reduce((sum, row) => sum + Number(row.monthlyGrossSalary), 0))
  const hasControlTotal = sourceControlTotal !== '' && sourceControlTotal != null
  const controlTotal = hasControlTotal ? Number(sourceControlTotal) : null
  if (hasControlTotal && (!Number.isFinite(controlTotal) || controlTotal < 0)) {
    throw new Error(`Enter a valid non-negative payroll control total for ${reportingMonth}.`)
  }
  return {
    reportingMonth,
    fileName,
    stagedAt,
    rowCount: validGrossRows.length,
    validRowsGrossTotal,
    sourceControlTotal: controlTotal,
    difference: controlTotal == null ? null : cents(validRowsGrossTotal - controlTotal),
  }
}

export function mergePayrollReconciliationBatches(existing = [], incoming = [], incomingMonths = [], mode = 'append') {
  const replacedMonths = new Set(incomingMonths)
  const reconciledReplacementMonths = new Set(incoming
    .filter((batch) => batch.sourceControlTotal != null && Math.abs(Number(batch.difference)) < 0.005)
    .map((batch) => batch.reportingMonth))
  const retained = mode === 'replace-months'
    ? existing.filter((batch) => !replacedMonths.has(batch.reportingMonth) || (batch.sourceControlTotal != null && Math.abs(Number(batch.difference)) >= 0.005 && !reconciledReplacementMonths.has(batch.reportingMonth)))
    : existing
  return [...retained, ...incoming]
}

export function getLatestPayrollReconciliationBatch(batches = [], reportingMonth) {
  return batches.filter((batch) => batch.reportingMonth === reportingMonth)
    .reduce((latest, batch) => !latest || String(batch.stagedAt).localeCompare(String(latest.stagedAt)) > 0 ? batch : latest, null)
}

export function getPayrollControlMismatches(batches = [], reportingMonth) {
  return batches.filter((batch) => batch.reportingMonth === reportingMonth && batch.sourceControlTotal != null && Math.abs(Number(batch.difference)) >= 0.005)
}
