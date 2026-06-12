async function main() {
  const email = 'ben@titandiamond.net';
  const url = `http://localhost:8888/api/get-accounts?email=${encodeURIComponent(email)}`;
  console.log('Hitting:', url);
  try {
    const res = await fetch(url);
    const data = await res.json();
    console.log('Sync result:', data.success, `Accounts fetched/synced:`, data.accounts?.length);
  } catch (err) {
    console.error('Error during local sync:', err);
  }
}
main().catch(console.error);
