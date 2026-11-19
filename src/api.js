export async function request(action, { params, data, signal, file } = {}) {
  const url = `/api/registry?${new URLSearchParams({ action, ...params })}`;
  const response = await fetch(url, {
    signal,
    ...(data !== undefined && { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    if (response.status === 401 && action !== 'login') window.dispatchEvent(new Event('session-expired'));
    throw new Error(payload.error || 'Something went wrong. Please try again.');
  }
  if (!file) return response.json();
  const link = document.createElement('a');
  const objectUrl = URL.createObjectURL(await response.blob());
  link.href = objectUrl;
  link.download = /filename="([^"]+)"/.exec(response.headers.get('content-disposition') ?? '')?.[1] ?? 'schooldesk.xlsx';
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 30_000);
}
