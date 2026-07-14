export async function executeConfirmedTransaction<Request, Hash, Receipt extends { status?: string }>({
  simulate,
  write,
  wait,
}: {
  simulate: () => Promise<Request>;
  write: (request: Request) => Promise<Hash>;
  wait: (hash: Hash) => Promise<Receipt>;
}) {
  const request = await simulate();
  const hash = await write(request);
  const receipt = await wait(hash);
  if (receipt.status === "reverted") {
    throw new Error("The transaction was reverted on-chain.");
  }
  return { hash, receipt };
}
