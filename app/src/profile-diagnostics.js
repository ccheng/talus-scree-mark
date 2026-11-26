export function downloadProfileDiagnostics(data) {
  const body = { format: 'talus-template-diagnostics', version: 1, ...data };
  const blob = new Blob([JSON.stringify(body, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'scree-template-diagnostics.json';
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
