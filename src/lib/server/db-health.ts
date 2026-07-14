export async function runDbHealthCheck() {
  return {
    ok: true,
    mode: 'remote',
    note: 'Database is managed by the remote Ewentcast API',
  }
}
